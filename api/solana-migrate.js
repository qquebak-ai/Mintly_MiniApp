/* Выход токена Solana на биржу — сам, как у pump.fun.
 *
 * Кривая на пороге закрывается (wallet-solana.js, закрытьКривые) и
 * отдаёт собранные SOL и остаток выпуска кошельку ликвидности. Отсюда
 * сервер заводит пул Raydium CPMM (api/_raydium.js) и сжигает LP-токены
 * пула: вынуть ликвидность после этого не может никто, включая площадку.
 * Адрес пула пишется в tokens.dex_pool_address — по нему приложение
 * показывает токен в разделе «На DEX».
 *
 * Работает только для кривых, которые отдают ликвидность кошельку,
 * чей ключ есть у сервера (SOLANA_LIQUIDITY_KEY). Токены, запущенные
 * раньше, отдают её прежнему адресу — их пул заводят руками.
 *
 * Плата Raydium за пул (0,15 SOL) и аренда его счетов берутся из
 * собранного: в пул уходит порог за вычетом ЦЕНА_ПУЛА_SOL. У pump.fun
 * так же — плата за выход удерживается из собранного.
 */
import { createClient } from "@supabase/supabase-js";
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createBurnInstruction } from "@solana/spl-token";
import { состояние, ОСНОВНАЯ_СЕТЬ } from "./solana-launch.js";
import { инструкцииПула, инструкцияСжечьLP, ЦЕНА_ПУЛА_SOL } from "./_raydium.js";

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1_000_000_000;
// Один и тот же токен не заводим дважды, пока первая попытка идёт.
const вРаботе = new Set();

async function отправить(connection, ключ, инструкции) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(new TransactionMessage({
    payerKey: ключ.publicKey, recentBlockhash: blockhash, instructions: инструкции,
  }).compileToV0Message());
  tx.sign([ключ]);
  const подпись = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
  const итог = await connection.confirmTransaction({ signature: подпись, blockhash, lastValidBlockHeight }, "confirmed");
  if (итог.value && итог.value.err) throw new Error(`транзакция отклонена: ${JSON.stringify(итог.value.err)}`);
  return подпись;
}

function ключЛиквидности() {
  const сырой = String(process.env.SOLANA_LIQUIDITY_KEY || "").trim();
  if (!сырой) return null;
  try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(сырой))); } catch { return null; }
}

export async function вывестиНаБиржу() {
  const ключ = ключЛиквидности();
  if (!ключ || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: токены, error } = await db
    .from("tokens")
    .select("id, address, ticker, owner_id")
    .eq("chain", "solana")
    .is("dex_pool_address", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error || !токены) return 0;

  const connection = new Connection(RPC, "confirmed");
  const сеть = ОСНОВНАЯ_СЕТЬ ? "mainnet" : "devnet";
  let выведено = 0;
  for (const tok of токены) {
    if (вРаботе.has(tok.id)) continue;
    try {
      const st = await состояние(tok.address);
      // Кривая ещё торгует или отдаёт ликвидность не нам — не наше дело.
      if (!st || !st.закрыта || st.destination !== ключ.publicKey.toBase58()) continue;
      вРаботе.add(tok.id);
      const mint = new PublicKey(tok.address);
      const своиТокены = getAssociatedTokenAddressSync(mint, ключ.publicKey);
      const остаток = await connection.getTokenAccountBalance(своиТокены).catch(() => null);
      const есть = остаток && остаток.value ? BigInt(остаток.value.amount) : 0n;
      if (!(есть > 0n)) continue;
      const лампортов = BigInt(Math.max(0, Math.round(st.graduationSol - ЦЕНА_ПУЛА_SOL * LAMPORTS)));
      /* Пул открывается по последней цене кривой, а не по всему остатку:
         если порог меньше полного выкупа (в devnet), непроданного
         остаётся много, и пул из всего остатка стоил бы в разы дешевле
         кривой — первый же продавец обвалил бы цену. Цена конца кривой —
         (запас + порог) / (токены − проданное по ней); лишнее сжигается.
         В mainnet остаток и так совпадает с этой долей. */
      const x = BigInt(Math.round(st.virtualSol)) + BigInt(Math.round(st.graduationSol));
      const y = (BigInt(Math.round(st.virtualSol)) * BigInt(Math.round(st.virtualTokens))) / x;
      const поЦене = (лампортов * y) / x;
      const токенов = поЦене > 0n && поЦене < есть ? поЦене : есть;
      const лишнее = есть - токенов;
      const наКошельке = BigInt(await connection.getBalance(ключ.publicKey));
      if (наКошельке < лампортов + BigInt(Math.round(ЦЕНА_ПУЛА_SOL * LAMPORTS))) {
        console.warn("[выход на DEX]", tok.ticker, "на кошельке ликвидности не хватает SOL");
        continue;
      }

      const { инструкции, пул, lp, lpСчёт } = инструкцииПула({ владелец: ключ.publicKey, mint, токенов, лампортов, сеть });
      // Пул уже есть — значит прошлая попытка дошла до сети, а запись в
      // базу не успела: только записываем.
      if (!(await connection.getAccountInfo(пул))) {
        // Лишнее сгорает в той же транзакции, что заводит пул: иначе оно
        // осталось бы у площадки.
        const сжечь = лишнее > 0n ? [createBurnInstruction(своиТокены, mint, ключ.publicKey, лишнее)] : [];
        await отправить(connection, ключ, [...сжечь, ...инструкции]);
      }

      // LP-токены сжигаем: ликвидность заперта навсегда, как у pump.fun.
      const lpОстаток = await connection.getTokenAccountBalance(lpСчёт).catch(() => null);
      const lpСколько = lpОстаток && lpОстаток.value ? BigInt(lpОстаток.value.amount) : 0n;
      if (lpСколько > 0n) await отправить(connection, ключ, [инструкцияСжечьLP({ владелец: ключ.publicKey, lpСчёт, lp, сколько: lpСколько })]);

      await db.from("tokens").update({ dex_pool_address: пул.toBase58(), listed_at: new Date().toISOString() }).eq("id", tok.id);
      console.log("[выход на DEX]", tok.ticker, "пул", пул.toBase58());
      выведено += 1;
    } catch (e) {
      console.warn("[выход на DEX]", tok.ticker, e && e.message);
    } finally {
      вРаботе.delete(tok.id);
    }
  }
  return выведено;
}
