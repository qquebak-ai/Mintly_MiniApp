/* Кошелёк приложения в TON.
 *
 * Зачем он. Внешний кошелёк подписывает каждую покупку сам: человек
 * уходит в Tonkeeper, подтверждает, возвращается — и так на каждую
 * сделку. В мемкоинах это половина причины не купить: пока идёшь туда и
 * обратно, цена уже другая. Кошелёк приложения снимает этот шаг: ключ
 * живёт на сервере, подпись ставит он же, а человек нажимает одну
 * кнопку.
 *
 * Что защищает деньги.
 *   — Ключ шифруется AES-256-GCM тем же ключом площадки, что и в
 *     Solana (APP_WALLET_KEY), а владелец подмешивается связанными
 *     данными: строка, переставленная в базе на другого человека, просто
 *     не расшифруется.
 *   — Сервер отправляет только два вида сообщений: покупку на кривой
 *     нашего токена и вывод на подтверждённый адрес. Ни произвольного
 *     адреса, ни произвольного тела в запросе нет.
 *   — Потолок хранения и суточный лимит вывода — те же, что у Solana:
 *     это кошелёк на карманные расходы, а не хранилище.
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * APP_WALLET_KEY (base64, 32 байта), TONCENTER_URL/TONAPI_KEY по
 * желанию, TON_TESTNET=1 для тестовой сети.
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
const TONAPI_KEY = process.env.TONAPI_KEY || "";

// Столько кошелёк держит спокойно; выше — приложение просит вывести.
const ПОТОЛОК = Number(process.env.TON_WALLET_CAP || 50);
// Больше этого за сутки не уходит наружу: украденная сессия не выносит
// всё разом.
const ЛИМИТ_В_СУТКИ = Number(process.env.TON_WALLET_DAILY || 100);

// Газ, который контракт кривой удерживает на своей стороне. Та же
// величина, что в приложении: иначе на кривую придёт меньше, чем ввёл
// человек, и покупка отскочит.
const ГАЗ_ПОКУПКИ = 150000000n;  // 0.15 TON
const OP_BUY = 1112889633;       // storeBuy из сгенерированного контракта

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function разобратьКлюч(строка) {
  if (!строка) return null;
  try {
    const b = Buffer.from(String(строка), "base64");
    return b.length === 32 ? b : null;
  } catch { return null; }
}

function ключи() {
  const текущий = разобратьКлюч(process.env.APP_WALLET_KEY);
  if (!текущий) return null;
  return { текущий, метка: crypto.createHash("sha256").update(текущий).digest("hex").slice(0, 8) };
}

function зашифровать(данные, ключ, владелец) {
  const соль = crypto.randomBytes(12);
  const шифр = crypto.createCipheriv("aes-256-gcm", ключ, соль);
  шифр.setAAD(Buffer.from(String(владелец)));
  const тело = Buffer.concat([шифр.update(данные), шифр.final()]);
  return Buffer.concat([соль, шифр.getAuthTag(), тело]).toString("base64");
}

function расшифровать(строка, ключ, владелец) {
  const b = Buffer.from(String(строка), "base64");
  const шифр = crypto.createDecipheriv("aes-256-gcm", ключ, b.subarray(0, 12));
  шифр.setAuthTag(b.subarray(12, 28));
  шифр.setAAD(Buffer.from(String(владелец)));
  return Buffer.concat([шифр.update(b.subarray(28)), шифр.final()]);
}

let тон = null;
async function библиотеки() {
  if (!тон) {
    const [core, ton, crypt] = await Promise.all([
      import("@ton/core"),
      import("@ton/ton"),
      import("@ton/crypto"),
    ]);
    тон = { ...core, ...ton, ...crypt };
  }
  return тон;
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

const ПОЛЯ = "user_id, chain, address, secret_enc, key_id, payout_address";

/* Кошелёк человека в TON. Мнемоника рождается здесь, шифруется и больше
   нигде в открытом виде не появляется. */
async function кошелёк(db, user, набор) {
  const { data } = await db
    .from("app_wallets").select(ПОЛЯ)
    .eq("user_id", user.id).eq("chain", "ton").maybeSingle();
  if (data) return data;

  const { mnemonicNew, mnemonicToPrivateKey, WalletContractV4 } = await библиотеки();
  const слова = await mnemonicNew(24);
  const пара = await mnemonicToPrivateKey(слова);
  const контракт = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey });

  const строка = {
    user_id: user.id,
    chain: "ton",
    address: контракт.address.toString({ bounceable: false, testOnly: TESTNET }),
    secret_enc: зашифровать(Buffer.from(слова.join(" ")), набор.текущий, user.id),
    key_id: набор.метка,
  };
  const { error } = await db.from("app_wallets").insert(строка);
  if (error) {
    const { data: снова } = await db
      .from("app_wallets").select(ПОЛЯ)
      .eq("user_id", user.id).eq("chain", "ton").maybeSingle();
    if (снова) return снова;
    throw new Error(error.message);
  }
  return строка;
}

/* Ключи для подписи — только на время одной операции. */
async function подписант(строка, набор, user) {
  const { mnemonicToPrivateKey, WalletContractV4, TonClient } = await библиотеки();
  const слова = расшифровать(строка.secret_enc, набор.текущий, user.id).toString("utf8").split(" ");
  const пара = await mnemonicToPrivateKey(слова);
  const контракт = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey });
  // Отправляет транзакции toncenter: у tonapi для этого свой протокол,
  // а клиент библиотеки умеет именно этот.
  const client = new TonClient({
    endpoint: process.env.TONCENTER_URL
      || (TESTNET ? "https://testnet.toncenter.com/api/v2/jsonRPC" : "https://toncenter.com/api/v2/jsonRPC"),
    apiKey: process.env.TONCENTER_API_KEY || undefined,
  });
  return { пара, контракт, client, кошелёк: client.open(контракт) };
}

async function баланс(адрес) {
  try {
    const res = await fetch(`${TONAPI}/v2/accounts/${адрес}`, {
      headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
    });
    if (!res.ok) return 0;
    const j = await res.json();
    return (Number(j.balance) || 0) / 1e9;
  } catch {
    return 0;
  }
}

async function выведеноЗаСутки(db, user) {
  const сутки = new Date(Date.now() - 86400000).toISOString();
  const { data } = await db
    .from("app_wallet_ops")
    .select("amount")
    .eq("user_id", user.id).eq("chain", "ton").eq("kind", "withdraw")
    .gte("created_at", сутки);
  return (data || []).reduce((с, о) => с + (Number(о.amount) || 0), 0);
}

async function записать(db, user, kind, amount, hash) {
  await db.from("app_wallet_ops").insert({
    user_id: user.id, chain: "ton", kind, amount, tx_hash: hash || null,
  }).catch(() => {});
}

export default async function handler(req, res) {
  const db = admin();
  const набор = ключи();
  const действие = String((req.query && req.query.action) || "");

  if (действие === "enabled") {
    return res.status(200).json({ enabled: !!(db && набор), network: TESTNET ? "testnet" : "mainnet" });
  }
  if (!db || !набор) return res.status(503).json({ error: "not_configured" });

  try {
    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const строка = await кошелёк(db, user, набор);

    if (действие === "state") {
      res.setHeader("Cache-Control", "no-store");
      const [есть, выведено] = await Promise.all([баланс(строка.address), выведеноЗаСутки(db, user)]);
      return res.status(200).json({
        address: строка.address,
        ton: есть,
        cap: ПОТОЛОК,
        dailyLeft: Math.max(0, ЛИМИТ_В_СУТКИ - выведено),
        payout: строка.payout_address || null,
        network: TESTNET ? "testnet" : "mainnet",
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    /* Покупка на кривой — без подтверждения в кошельке.
       Адрес кривой не приходит из запроса: он берётся из базы по токену,
       который человек открыл. Подсунуть чужой контракт нельзя. */
    if (действие === "buy") {
      const tokenId = String(тело.tokenId || "");
      const сумма = Number(тело.amount) || 0;
      if (!tokenId || !(сумма > 0)) return res.status(400).json({ error: "bad_request" });

      const { data: токен } = await db
        .from("tokens")
        .select("id, curve_address, dex_pool_address, chain, curve_cache(graduated)")
        .eq("id", tokenId)
        .maybeSingle();
      if (!токен || (токен.chain || "ton") !== "ton") return res.status(404).json({ error: "token_not_found" });

      const кеш = Array.isArray(токен.curve_cache) ? токен.curve_cache[0] : токен.curve_cache;
      const адресРынка = (кеш && кеш.graduated && токен.dex_pool_address) || токен.curve_address;
      if (!адресРынка) return res.status(400).json({ error: "no_curve" });

      const есть = await баланс(строка.address);
      const нужно = сумма + 0.2;   // покупка плюс газ контракта и сети
      if (есть < нужно) return res.status(400).json({ error: "not_enough", have: есть, need: нужно });

      const { beginCell, internal, toNano, Address, SendMode } = await библиотеки();
      const { пара, кошелёк: открытый } = await подписант(строка, набор, user);

      const тело_ = beginCell()
        .storeUint(OP_BUY, 32)
        .storeUint(0n, 64)
        .storeCoins(0n)   // без ограничения проскальзывания: цену считает контракт
        .endCell();

      const seqno = await открытый.getSeqno();
      await открытый.sendTransfer({
        seqno,
        secretKey: пара.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        messages: [internal({
          to: Address.parse(адресРынка),
          value: toNano(сумма.toFixed(9)) + ГАЗ_ПОКУПКИ,
          body: тело_,
          bounce: true,
        })],
      });

      await записать(db, user, "buy", сумма, null);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, seqno });
    }

    /* Вывод — только на адрес, который человек подтвердил заранее. */
    if (действие === "payout-set") {
      const адрес = String(тело.address || "").trim();
      const { Address } = await библиотеки();
      try { Address.parse(адрес); } catch { return res.status(400).json({ error: "bad_address" }); }
      await db.from("app_wallets").update({ payout_address: адрес })
        .eq("user_id", user.id).eq("chain", "ton");
      return res.status(200).json({ ok: true });
    }

    if (действие === "withdraw") {
      if (!строка.payout_address) return res.status(400).json({ error: "no_payout" });
      const есть = await баланс(строка.address);
      const сумма = тело.all ? Math.max(0, есть - 0.05) : Number(тело.amount) || 0;
      if (!(сумма > 0) || сумма > есть) return res.status(400).json({ error: "bad_amount" });

      const выведено = await выведеноЗаСутки(db, user);
      if (выведено + сумма > ЛИМИТ_В_СУТКИ) {
        return res.status(400).json({ error: "daily_limit", left: Math.max(0, ЛИМИТ_В_СУТКИ - выведено) });
      }

      const { internal, toNano, Address, SendMode } = await библиотеки();
      const { пара, кошелёк: открытый } = await подписант(строка, набор, user);
      const seqno = await открытый.getSeqno();
      await открытый.sendTransfer({
        seqno,
        secretKey: пара.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        messages: [internal({
          to: Address.parse(строка.payout_address),
          value: toNano(сумма.toFixed(9)),
          bounce: false,
        })],
      });

      await записать(db, user, "withdraw", сумма, null);
      return res.status(200).json({ ok: true, sent: сумма });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    console.error("[wallet-ton]", err && err.message);
    return res.status(500).json({ error: "failed", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
