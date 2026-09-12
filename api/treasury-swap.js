/* Обмен между сетями через казначейство: SOL ⇄ GRAM.
 *
 * Моста между TON и Solana у площадки нет, и честного «одной сделкой»
 * обмена тоже. Зато есть запас обеих монет: человек переводит свою на
 * казначейский адрес, казна тем же движением шлёт ему другую в другой
 * сети. Получается обычный обменник — с курсом, комиссией и пределом на
 * одну операцию.
 *
 * Порядок нарочно такой: сперва приходит монета от человека, и только
 * потом платит казна. Обратный порядок означал бы, что площадка платит
 * вперёд и остаётся ни с чем, если вторая нога не пройдёт.
 *
 * Что делать, если вторая нога всё же упала: обмен останется со статусом
 * paid, а в detail будет причина — по нему видно, кому казна должна.
 *
 * Переменные окружения:
 *   TREASURY_FEE_BPS   — комиссия площадки, сотые доли процента (100 = 1%).
 *   TREASURY_MAX_SOL   — предел одной операции в SOL.
 *   TREASURY_MAX_GRAM  — предел одной операции в GRAM.
 *   TREASURY_MIN_USD   — нижняя граница: мелочь не стоит комиссии сети.
 */

import crypto from "node:crypto";
import { админ, ключи, казна, остаток, отправитьИзКазны, СЕТЬ_TON, СЕТЬ_SOL } from "./_treasury.js";
import { курсSol, курсTon } from "./_market.js";

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const TESTNET = process.env.TON_TESTNET === "1";
const LAMPORTS = 1_000_000_000;

const КОМИССИЯ_BPS = Number(process.env.TREASURY_FEE_BPS || 100);
const ПРЕДЕЛ_SOL = Number(process.env.TREASURY_MAX_SOL || 5);
const ПРЕДЕЛ_GRAM = Number(process.env.TREASURY_MAX_GRAM || 500);
const МИНИМУМ_USD = Number(process.env.TREASURY_MIN_USD || 0.2);

// Запас, который остаётся на кошельке человека под комиссию сети: без
// него перевод «на весь остаток» просто не проходит.
const ЗАПАС_SOL = 0.003;
const ЗАПАС_TON = 0.05;

function расшифровать(строка, ключ, владелец) {
  const b = Buffer.from(String(строка), "base64");
  const шифр = crypto.createDecipheriv("aes-256-gcm", ключ, b.subarray(0, 12));
  шифр.setAuthTag(b.subarray(12, 28));
  шифр.setAAD(Buffer.from(String(владелец)));
  return Buffer.concat([шифр.update(b.subarray(28)), шифр.final()]);
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

async function кошелёкЧеловека(db, user_id, chain) {
  const { data } = await db
    .from("app_wallets")
    .select("user_id, chain, address, secret_enc")
    .eq("user_id", user_id).eq("chain", chain).maybeSingle();
  return data || null;
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "rpc");
  return json.result;
}

async function остатокЧеловека(chain, адрес) {
  return await остаток(chain, адрес);
}

/* Нога «человек → казна». Подписывается ключом самого человека: он лежит
   в app_wallets, закрытый ключом площадки, и открывается только на время
   одного перевода. */
async function перевестиВКазну({ строка, набор, user_id, chain, куда, сумма }) {
  if (chain === "solana") {
    const { Keypair, Connection, PublicKey, SystemProgram, Transaction } = await import("@solana/web3.js");
    const секрет = расшифровать(строка.secret_enc, набор.текущий, user_id);
    const пара = Keypair.fromSecretKey(new Uint8Array(секрет));
    const соединение = new Connection(RPC, "confirmed");
    const tx = new Transaction().add(SystemProgram.transfer({
      fromPubkey: пара.publicKey,
      toPubkey: new PublicKey(куда),
      lamports: Math.floor(сумма * LAMPORTS),
    }));
    const { blockhash, lastValidBlockHeight } = await соединение.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = пара.publicKey;
    tx.sign(пара);
    const подпись = await соединение.sendRawTransaction(tx.serialize(), {
      skipPreflight: false, preflightCommitment: "processed", maxRetries: 5,
    });
    /* Ждём подтверждения: платить из казны по неподтверждённому переводу
       нельзя — он ещё может не дойти. */
    await соединение.confirmTransaction({ signature: подпись, blockhash, lastValidBlockHeight }, "confirmed");
    return подпись;
  }

  const [core, ton, crypt] = await Promise.all([import("@ton/core"), import("@ton/ton"), import("@ton/crypto")]);
  const { Address, internal, toNano } = core;
  const { TonClient, WalletContractV4 } = ton;
  const { mnemonicToPrivateKey } = crypt;
  const слова = расшифровать(строка.secret_enc, набор.текущий, user_id).toString("utf8").split(" ");
  const пара = await mnemonicToPrivateKey(слова);
  const контракт = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey });
  const client = new TonClient({
    endpoint: process.env.TONCENTER_URL
      || (TESTNET ? "https://testnet.toncenter.com/api/v2/jsonRPC" : "https://toncenter.com/api/v2/jsonRPC"),
    apiKey: process.env.TONCENTER_API_KEY || undefined,
  });
  const кошелёк = client.open(контракт);
  const seqno = await кошелёк.getSeqno();
  await кошелёк.sendTransfer({
    secretKey: пара.secretKey,
    seqno,
    messages: [internal({ to: Address.parse(куда), value: toNano(сумма.toFixed(9)), body: "", bounce: false })],
  });
  /* Ждём, пока номер сообщения вырастет: это и значит, что кошелёк
     отправил. Полминуты хватает; дальше сеть всё равно доставит, но
     платить из казны вслепую мы не станем. */
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const сейчас = await кошелёк.getSeqno().catch(() => seqno);
    if (сейчас > seqno) return `seqno:${seqno}`;
  }
  throw new Error("ton_transfer_timeout");
}

/* Курс обмена: обе монеты считаются через доллар. Своей пары SOL/GRAM у
   нас нет, а доллар знают оба источника. */
async function курсы() {
  const [sol, ton] = await Promise.all([курсSol().catch(() => 0), курсTon().catch(() => 0)]);
  return { sol, ton };
}

function расчёт({ откуда, сумма, sol, ton }) {
  const ценаВхода = откуда === "SOL" ? sol : ton;
  const ценаВыхода = откуда === "SOL" ? ton : sol;
  if (!(ценаВхода > 0) || !(ценаВыхода > 0)) return null;
  const вДолларах = сумма * ценаВхода;
  const послеКомиссии = вДолларах * (1 - КОМИССИЯ_BPS / 10000);
  const выход = послеКомиссии / ценаВыхода;
  return {
    вДолларах,
    выход: Math.max(0, Number(выход.toFixed(9))),
    курс: ценаВхода / ценаВыхода,
    feeBps: КОМИССИЯ_BPS,
  };
}

export default async function handler(req, res) {
  const db = админ();
  const набор = ключи();
  const действие = String((req.query && req.query.action) || "");

  if (!db || !набор) return res.status(200).json({ enabled: false });

  try {
    if (действие === "state") {
      const [казнаSol, казнаTon] = await Promise.all([казна(db, набор, "solana"), казна(db, набор, "ton")]);
      const [естьSol, естьTon, { sol, ton }] = await Promise.all([
        остаток("solana", казнаSol.address),
        остаток("ton", казнаTon.address),
        курсы(),
      ]);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        enabled: true,
        fee_bps: КОМИССИЯ_BPS,
        // Адреса отдаём открыто: на них площадка кладёт запас, и знать
        // их полезно — по ним обмен видно в обозревателе.
        treasury: {
          solana: { address: казнаSol.address, network: СЕТЬ_SOL, balance: естьSol },
          ton: { address: казнаTon.address, network: СЕТЬ_TON, balance: естьTon },
        },
        rates: { sol, ton },
        limits: { sol: ПРЕДЕЛ_SOL, gram: ПРЕДЕЛ_GRAM, minUsd: МИНИМУМ_USD },
      });
    }

    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const откуда = String(тело.from || "").toUpperCase() === "GRAM" ? "GRAM" : "SOL";
    const сумма = Number(тело.amount) || 0;

    if (действие === "quote") {
      const { sol, ton } = await курсы();
      const счёт = расчёт({ откуда, сумма, sol, ton });
      if (!счёт) return res.status(503).json({ error: "no_rate" });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ from: откуда, amount: сумма, ...счёт });
    }

    if (действие !== "swap") return res.status(400).json({ error: "unknown_action" });
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (!(сумма > 0)) return res.status(400).json({ error: "bad_amount" });

    const предел = откуда === "SOL" ? ПРЕДЕЛ_SOL : ПРЕДЕЛ_GRAM;
    if (сумма > предел) return res.status(400).json({ error: "too_much", limit: предел });

    const { sol, ton } = await курсы();
    const счёт = расчёт({ откуда, сумма, sol, ton });
    if (!счёт) return res.status(503).json({ error: "no_rate" });
    if (счёт.вДолларах < МИНИМУМ_USD) return res.status(400).json({ error: "too_small", minUsd: МИНИМУМ_USD });

    const цепочкаВхода = откуда === "SOL" ? "solana" : "ton";
    const цепочкаВыхода = откуда === "SOL" ? "ton" : "solana";

    const [мойВход, мойВыход] = await Promise.all([
      кошелёкЧеловека(db, user.id, цепочкаВхода),
      кошелёкЧеловека(db, user.id, цепочкаВыхода),
    ]);
    // Кошелька может не быть вовсе — тогда и менять не с чего, и слать
    // некуда. Заводит их обработчик своей сети при первом заходе.
    if (!мойВход) return res.status(400).json({ error: "no_wallet", chain: цепочкаВхода });
    if (!мойВыход) return res.status(400).json({ error: "no_wallet", chain: цепочкаВыхода });

    const запас = цепочкаВхода === "solana" ? ЗАПАС_SOL : ЗАПАС_TON;
    const есть = await остатокЧеловека(цепочкаВхода, мойВход.address);
    if (сумма + запас > есть) return res.status(400).json({ error: "not_enough", balance: есть });

    const [казнаВхода, казнаВыхода] = await Promise.all([
      казна(db, набор, цепочкаВхода),
      казна(db, набор, цепочкаВыхода),
    ]);
    const вКазне = await остаток(цепочкаВыхода, казнаВыхода.address);
    const запасКазны = цепочкаВыхода === "solana" ? ЗАПАС_SOL : ЗАПАС_TON;
    if (счёт.выход + запасКазны > вКазне) {
      return res.status(503).json({ error: "treasury_empty", available: Math.max(0, вКазне - запасКазны) });
    }

    /* Повтор того же запроса не должен обменивать дважды: сеть бывает
       медленной, и человек нажимает ещё раз. Ключ приходит от
       приложения и живёт одну попытку. */
    const ключЗапроса = String(тело.requestKey || "").slice(0, 64) || null;
    if (ключЗапроса) {
      const { data: было } = await db
        .from("treasury_swaps").select("id, status, amount_out, out_signature")
        .eq("user_id", user.id).eq("request_key", ключЗапроса).maybeSingle();
      if (было && было.status === "done") {
        return res.status(200).json({
          repeat: true, amount_out: было.amount_out, signature: было.out_signature,
        });
      }
      // Начатый, но не доведённый обмен повторять нельзя тем более:
      // деньги могли уже уйти в казну, и второй заход списал бы ещё раз.
      if (было && было.status !== "failed") {
        return res.status(409).json({ error: "in_progress", swap: было.id });
      }
    }

    const { data: обмен, error: ошибкаЗаписи } = await db.from("treasury_swaps").insert({
      user_id: user.id,
      request_key: ключЗапроса,
      from_chain: цепочкаВхода,
      to_chain: цепочкаВыхода,
      amount_in: сумма,
      rate: счёт.курс,
      fee_bps: счёт.feeBps,
      status: "started",
    }).select("id").single();

    /* Запись не прошла — значит тот же ключ запроса уже занят (двойное
       нажатие) или база недоступна. В обоих случаях обмен начинать
       нельзя: без строки некуда записать, что деньги ушли в казну. */
    if (ошибкаЗаписи || !обмен) {
      return res.status(409).json({ error: "not_started", detail: (ошибкаЗаписи && ошибкаЗаписи.message) || "no_row" });
    }

    let входнаяПодпись = null;
    try {
      входнаяПодпись = await перевестиВКазну({
        строка: мойВход, набор, user_id: user.id,
        chain: цепочкаВхода, куда: казнаВхода.address, сумма,
      });
    } catch (e) {
      await db.from("treasury_swaps").update({
        status: "failed", detail: String((e && e.message) || e).slice(0, 300), updated_at: new Date().toISOString(),
      }).eq("id", обмен.id);
      return res.status(502).json({ error: "transfer_failed", detail: String((e && e.message) || e).slice(0, 200) });
    }

    await db.from("treasury_swaps").update({
      status: "paid", in_signature: входнаяПодпись, updated_at: new Date().toISOString(),
    }).eq("id", обмен.id);

    let выходнаяПодпись = null;
    try {
      выходнаяПодпись = await отправитьИзКазны(казнаВыхода, набор, мойВыход.address, счёт.выход);
    } catch (e) {
      /* Деньги человека уже в казне, а выплата не прошла. Не молчим: на
         записи остаётся статус paid и причина — по ним видно, кому казна
         должна, и обмен можно дослать руками. */
      await db.from("treasury_swaps").update({
        detail: String((e && e.message) || e).slice(0, 300), updated_at: new Date().toISOString(),
      }).eq("id", обмен.id);
      return res.status(502).json({ error: "payout_failed", owed: счёт.выход, swap: обмен.id });
    }

    await db.from("treasury_swaps").update({
      status: "done", amount_out: счёт.выход, out_signature: выходнаяПодпись, updated_at: new Date().toISOString(),
    }).eq("id", обмен.id);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      from: откуда,
      amount_in: сумма,
      amount_out: счёт.выход,
      rate: счёт.курс,
      fee_bps: счёт.feeBps,
      in_signature: входнаяПодпись,
      out_signature: выходнаяПодпись,
    });
  } catch (err) {
    console.warn("[treasury-swap]", err && err.message);
    return res.status(502).json({ error: "failed", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
