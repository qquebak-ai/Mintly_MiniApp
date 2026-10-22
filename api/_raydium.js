/* Пул Raydium CPMM — выход токена Solana на биржу после кривой.
 *
 * Кривая на пороге закрывается и одним переводом отдаёт собранные SOL и
 * остаток выпуска на кошелёк ликвидности площадки. Отсюда сервер сам
 * заводит пул на Raydium — как pump.fun, — и сжигает LP-токены: забрать
 * ликвидность из пула после этого не может никто, включая площадку.
 *
 * SDK Raydium весит под двести мегабайт, а нужна от него одна
 * инструкция, поэтому она собрана вручную по раскладке программы
 * raydium-cp-swap (инструкция initialize). Адреса проверены по сети:
 *   mainnet — программа CPMMoo8L…, настройка №0 D4FPEru… (0,25%),
 *             плата за создание 0,15 SOL на DNXgeM9…;
 *   devnet  — программа DRaycpLY…, настройка №0 5MxLgy9… (0,25%),
 *             плата 0,15 SOL на 3oE58BK… (адрес назвала сама программа).
 */
import crypto from "node:crypto";
import {
  PublicKey, SystemProgram, TransactionInstruction, ComputeBudgetProgram, SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction, createBurnInstruction, createCloseAccountInstruction,
} from "@solana/spl-token";

export const RAYDIUM = {
  mainnet: {
    программа: new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"),
    настройка: new PublicKey("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2"),
    плата: new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"),
  },
  devnet: {
    программа: new PublicKey("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb"),
    настройка: new PublicKey("5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy"),
    плата: new PublicKey("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy"),
  },
};
// Сколько стоит заведение пула сверх ликвидности: плата Raydium и аренда
// счетов пула. Оставляем на кошельке, иначе транзакция упадёт.
export const ЦЕНА_ПУЛА_SOL = 0.2;

const дискриминатор = (имя) => crypto.createHash("sha256").update(`global:${имя}`).digest().subarray(0, 8);
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const pda = (семена, программа) => PublicKey.findProgramAddressSync(семена, программа)[0];

/* Адреса пула для пары. Порядок монет в Raydium — по байтам ключа:
   меньший — token_0. */
export function адресаПула(mint, сеть = "devnet") {
  const р = RAYDIUM[сеть];
  const [m0, m1] = Buffer.compare(mint.toBuffer(), NATIVE_MINT.toBuffer()) < 0 ? [mint, NATIVE_MINT] : [NATIVE_MINT, mint];
  const пул = pda([Buffer.from("pool"), р.настройка.toBuffer(), m0.toBuffer(), m1.toBuffer()], р.программа);
  return {
    р, m0, m1, пул,
    власть: pda([Buffer.from("vault_and_lp_mint_auth_seed")], р.программа),
    lp: pda([Buffer.from("pool_lp_mint"), пул.toBuffer()], р.программа),
    хран0: pda([Buffer.from("pool_vault"), пул.toBuffer(), m0.toBuffer()], р.программа),
    хран1: pda([Buffer.from("pool_vault"), пул.toBuffer(), m1.toBuffer()], р.программа),
    наблюдение: pda([Buffer.from("observation"), пул.toBuffer()], р.программа),
  };
}

/* Инструкции заведения пула: SOL заворачивается в wSOL, дальше
   initialize с обеими суммами. Возвращает и адрес пула — его пишем в
   базу как dex_pool_address. */
export function инструкцииПула({ владелец, mint, токенов, лампортов, сеть = "devnet" }) {
  const а = адресаПула(mint, сеть);
  const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, владелец);
  const своиТокены = getAssociatedTokenAddressSync(mint, владелец);
  const lpСчёт = getAssociatedTokenAddressSync(а.lp, владелец);
  const сумма0 = а.m0.equals(mint) ? BigInt(токенов) : BigInt(лампортов);
  const сумма1 = а.m1.equals(mint) ? BigInt(токенов) : BigInt(лампортов);
  const счёт0 = а.m0.equals(mint) ? своиТокены : wsol;
  const счёт1 = а.m1.equals(mint) ? своиТокены : wsol;
  const ключ = (pubkey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  const инструкции = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    createAssociatedTokenAccountIdempotentInstruction(владелец, wsol, владелец, NATIVE_MINT),
    SystemProgram.transfer({ fromPubkey: владелец, toPubkey: wsol, lamports: BigInt(лампортов) }),
    createSyncNativeInstruction(wsol),
    new TransactionInstruction({
      programId: а.р.программа,
      keys: [
        ключ(владелец, true, true),
        ключ(а.р.настройка),
        ключ(а.власть),
        ключ(а.пул, true),
        ключ(а.m0),
        ключ(а.m1),
        ключ(а.lp, true),
        ключ(счёт0, true),
        ключ(счёт1, true),
        ключ(lpСчёт, true),
        ключ(а.хран0, true),
        ключ(а.хран1, true),
        ключ(а.р.плата, true),
        ключ(а.наблюдение, true),
        ключ(TOKEN_PROGRAM_ID),
        ключ(TOKEN_PROGRAM_ID),
        ключ(TOKEN_PROGRAM_ID),
        ключ(ASSOCIATED_TOKEN_PROGRAM_ID),
        ключ(SystemProgram.programId),
        ключ(SYSVAR_RENT_PUBKEY),
      ],
      // Открыт сразу: open_time = 0.
      data: Buffer.concat([дискриминатор("initialize"), u64(сумма0), u64(сумма1), u64(0)]),
    }),
    // Остаток wSOL обратно в SOL: счёт обёртки больше не нужен.
    createCloseAccountInstruction(wsol, владелец, владелец),
  ];
  return { инструкции, пул: а.пул, lp: а.lp, lpСчёт };
}

/* Сжечь LP-токены пула: ликвидность запирается навсегда. */
export function инструкцияСжечьLP({ владелец, lpСчёт, lp, сколько }) {
  return createBurnInstruction(lpСчёт, lp, владелец, BigInt(сколько));
}

/* Состояние пула: адреса и резервы, нужные для обмена. Раскладка —
   PoolState программы raydium-cp-swap. Резервы — остатки хранилищ за
   вычетом накопленных комиссий протокола и фонда: так считает и сама
   программа. */
export async function прочитатьПул(connection, пул) {
  const инфо = await connection.getAccountInfo(пул);
  if (!инфо || инфо.data.length < 381) return null;
  const d = инфо.data;
  const ключ = (o) => new PublicKey(d.subarray(o, o + 32));
  const u64 = (o) => d.readBigUInt64LE(o);
  const п = {
    программа: инфо.owner, настройка: ключ(8), хран0: ключ(72), хран1: ключ(104),
    m0: ключ(168), m1: ключ(200), прог0: ключ(232), прог1: ключ(264), наблюдение: ключ(296),
    комиссии0: u64(341) + u64(357), комиссии1: u64(349) + u64(365),
  };
  const [в0, в1] = await Promise.all([п.хран0, п.хран1].map((х) => connection.getTokenAccountBalance(х)));
  п.резерв0 = BigInt(в0.value.amount) - п.комиссии0;
  п.резерв1 = BigInt(в1.value.amount) - п.комиссии1;
  return п;
}

// Ставка обмена настройки №0 — 0,25%, в миллионных долях, как у программы.
const СТАВКА_ОБМЕНА = 2500n;

/* Сколько выйдет при обмене amountIn — та же формула, что в программе:
   сначала удерживается ставка, потом постоянное произведение. */
export function котировкаПула(резервВход, резервВыход, amountIn) {
  const чистыми = BigInt(amountIn) - (BigInt(amountIn) * СТАВКА_ОБМЕНА + 999_999n) / 1_000_000n;
  if (чистыми <= 0n || резервВход <= 0n || резервВыход <= 0n) return 0n;
  return (резервВыход * чистыми) / (резервВход + чистыми);
}

/* Обмен в пуле: SOL → токен (покупка) или токен → SOL (продажа).
   SOL заворачивается в wSOL на время сделки и разворачивается обратно
   тем же сообщением. */
export function инструкцииОбмена({ владелец, пул, п, mint, покупка, amountIn, minOut }) {
  const токенПервый = п.m0.equals(mint);
  const wsol = getAssociatedTokenAddressSync(NATIVE_MINT, владелец);
  const своиТокены = getAssociatedTokenAddressSync(mint, владелец);
  const вход = покупка ? NATIVE_MINT : mint;
  const выход = покупка ? mint : NATIVE_MINT;
  const хранВход = вход.equals(п.m0) ? п.хран0 : п.хран1;
  const хранВыход = выход.equals(п.m0) ? п.хран0 : п.хран1;
  const прогВход = вход.equals(п.m0) ? п.прог0 : п.прог1;
  const прогВыход = выход.equals(п.m0) ? п.прог0 : п.прог1;
  void токенПервый;
  const ключ = (pubkey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
  const власть = pda([Buffer.from("vault_and_lp_mint_auth_seed")], п.программа);
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    createAssociatedTokenAccountIdempotentInstruction(владелец, wsol, владелец, NATIVE_MINT),
    createAssociatedTokenAccountIdempotentInstruction(владелец, своиТокены, владелец, mint),
    ...(покупка ? [
      SystemProgram.transfer({ fromPubkey: владелец, toPubkey: wsol, lamports: BigInt(amountIn) }),
      createSyncNativeInstruction(wsol),
    ] : []),
    new TransactionInstruction({
      programId: п.программа,
      keys: [
        ключ(владелец, false, true),
        ключ(власть),
        ключ(п.настройка),
        ключ(пул, true),
        ключ(покупка ? wsol : своиТокены, true),
        ключ(покупка ? своиТокены : wsol, true),
        ключ(хранВход, true),
        ключ(хранВыход, true),
        ключ(прогВход),
        ключ(прогВыход),
        ключ(вход),
        ключ(выход),
        ключ(п.наблюдение, true),
      ],
      data: Buffer.concat([дискриминатор("swap_base_input"), u64(amountIn), u64(minOut)]),
    }),
    createCloseAccountInstruction(wsol, владелец, владелец),
  ];
}
