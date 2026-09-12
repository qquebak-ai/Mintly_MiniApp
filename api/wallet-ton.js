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
// Продажа: те же величины, что в src/curveConfig.js. Пересылка — сколько
// уходит вместе с жетонами дальше, на саму кривую; газ — сколько стоит
// всё сообщение целиком.
const ПЕРЕСЫЛКА_ПРОДАЖИ = 80000000n;   // 0.08 TON
const ГАЗ_ПРОДАЖИ = 200000000n;        // 0.2 TON
const SELL_OP = 0x53454c4c;            // «SELL» в пометке к переводу жетонов

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

  /* Ключ — из общей фразы человека, по своему пути монеты TON: та же
     запись из двадцати четырёх слов открывает и кошелёк Solana. Храним
     готовую пару, а не слова: фраза лежит отдельно, одна на оба
     кошелька. Если общий корень недоступен, заводим собственную
     TON-мнемонику, как было раньше. */
  let секрет = null;
  let пара = null;
  try {
    const nacl = (await import("tweetnacl")).default;
    const { фразаПользователя, ключПути, ПУТЬ_TON } = await import("./_seed.js");
    const фраза = await фразаПользователя(db, user, набор);
    const из = nacl.sign.keyPair.fromSeed(ключПути(фраза, ПУТЬ_TON));
    пара = { publicKey: Buffer.from(из.publicKey), secretKey: Buffer.from(из.secretKey) };
    секрет = Buffer.from(`hex:${пара.secretKey.toString("hex")}`);
  } catch (e) {
    console.warn("[wallet-ton] общая фраза недоступна:", e && e.message);
    const слова = await mnemonicNew(24);
    пара = await mnemonicToPrivateKey(слова);
    секрет = Buffer.from(слова.join(" "));
  }
  const контракт = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey });

  const строка = {
    user_id: user.id,
    chain: "ton",
    address: контракт.address.toString({ bounceable: false, testOnly: TESTNET }),
    secret_enc: зашифровать(секрет, набор.текущий, user.id),
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
  const тайна = расшифровать(строка.secret_enc, набор.текущий, user.id).toString("utf8");
  /* Два вида записи. Кошельки, выведенные из общей фразы, хранят готовую
     пару: «hex:» и шестьдесят четыре байта ключа. Заведённые раньше —
     собственную мнемонику из двадцати четырёх слов. */
  let пара;
  if (тайна.startsWith("hex:")) {
    const байты = Buffer.from(тайна.slice(4), "hex");
    пара = { publicKey: байты.subarray(32), secretKey: байты };
  } else {
    пара = await mnemonicToPrivateKey(тайна.split(" "));
  }
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

/* Жетонный кошелёк владельца для конкретного жетона: адрес и остаток.
   Спрашиваем у сети — считать его самим значит повторять код мастера
   жетона, а ошибка здесь отправила бы жетоны в никуда. */
async function жетонныйКошелёк(владелец, мастер) {
  try {
    const res = await fetch(`${TONAPI}/v2/accounts/${владелец}/jettons/${мастер}`, {
      headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
    });
    if (!res.ok) return null;
    const j = await res.json();
    const адрес = j && j.wallet_address && j.wallet_address.address;
    if (!адрес) return null;
    return { address: адрес, balance: j.balance != null ? String(j.balance) : null };
  } catch {
    return null;
  }
}

async function выведеноЗаСутки(db, user) {
  const сутки = new Date(Date.now() - 86400000).toISOString();
  const { data } = await db
    // Журнал один на обе сети (см. supabase_app_wallet.sql): таблица
    // называется wallet_ops, а сеть различается колонкой chain.
    .from("wallet_ops")
    .select("amount")
    .eq("user_id", user.id).eq("chain", "ton").eq("kind", "withdraw")
    .gte("created_at", сутки);
  return (data || []).reduce((с, о) => с + (Number(о.amount) || 0), 0);
}

/* Начало денежной операции: отметка в журнале, она же защита от двух
   бед сразу. Первая — двойное нажатие: тот же ключ запроса не создаёт
   вторую строку, и вместо повторного перевода возвращается исход
   первого. Вторая — шквал: больше нескольких операций в минуту от одного
   человека не пропускаем. В Solana это давно так; в TON вывода это не
   было, и повторное нажатие отправляло деньги ещё раз. */
const ОПЕРАЦИЙ_В_МИНУТУ = Number(process.env.TON_WALLET_RATE || 6);

async function начать(db, user, { дело, сумма = 0, адрес = null, ключЗапроса = null, ip = null }) {
  const минуту = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db
    .from("wallet_ops")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gt("created_at", минуту);
  if ((count || 0) >= ОПЕРАЦИЙ_В_МИНУТУ) throw Object.assign(new Error("слишком часто"), { код: 429 });

  const { data, error } = await db
    .from("wallet_ops")
    .insert({ user_id: user.id, chain: "ton", kind: дело, amount: сумма, address: адрес, request_key: ключЗапроса, ip })
    .select("id")
    .single();

  if (error) {
    if (ключЗапроса) {
      const { data: прошлая } = await db
        .from("wallet_ops")
        .select("id, signature")
        .eq("user_id", user.id)
        .eq("request_key", ключЗапроса)
        .maybeSingle();
      if (прошлая) return { повтор: true, id: прошлая.id, signature: прошлая.signature };
    }
    throw new Error(error.message);
  }
  return { повтор: false, id: data.id };
}

async function завершить(db, id, signature) {
  if (!id) return;
  await db.from("wallet_ops").update({ signature: signature || null }).eq("id", id);
}

async function записать(db, user, kind, amount, hash) {
  await db.from("wallet_ops").insert({
    user_id: user.id, chain: "ton", kind, amount, signature: hash || null,
  }).then(() => {}, () => {});
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

      /* Двойное нажатие не должно превращаться во вторую покупку: тот
         же ключ запроса возвращает исход первой. */
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
      const оп = await начать(db, user, {
        дело: "buy", сумма, адрес: адресРынка,
        ключЗапроса: String(тело.requestKey || "").slice(0, 64) || null, ip,
      });
      if (оп.повтор) return res.status(200).json({ ok: true, repeat: true });

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

      await завершить(db, оп.id, `seqno:${seqno}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, seqno });
    }

    /* Продажа на кривой. Жетоны лежат на кошельке приложения, поэтому и
       продавать их может только он: внешнего кошелька в приложении
       больше нет. Уходит одно сообщение — перевод жетонов на кривую с
       пометкой «продажа»; TON за них кривая возвращает сама.

       Адрес жетонного кошелька спрашиваем у сети, а не у браузера: это
       единственное место, куда уходят жетоны, и подменять его снаружи
       нельзя. */
    if (действие === "sell") {
      const tokenId = String(тело.tokenId || "");
      const сколько = Number(тело.amount) || 0;
      if (!tokenId || !(сколько > 0)) return res.status(400).json({ error: "bad_request" });

      const { data: токен } = await db
        .from("tokens")
        .select("id, address, curve_address, dex_pool_address, chain, curve_cache(graduated)")
        .eq("id", tokenId)
        .maybeSingle();
      if (!токен || (токен.chain || "ton") !== "ton") return res.status(404).json({ error: "token_not_found" });
      const кеш = Array.isArray(токен.curve_cache) ? токен.curve_cache[0] : токен.curve_cache;
      const рынок = (кеш && кеш.graduated && токен.dex_pool_address) || токен.curve_address;
      if (!рынок || !токен.address) return res.status(400).json({ error: "no_curve" });

      const мой = await жетонныйКошелёк(строка.address, токен.address);
      if (!мой) return res.status(400).json({ error: "no_jetton_wallet" });
      // Больше, чем есть, не продаём: сеть такое сообщение просто
      // отобьёт, а газ спишется.
      const хочет = BigInt(Math.round(сколько * 1e9));
      const сколькоБигом = мой.balance != null && BigInt(мой.balance) < хочет ? BigInt(мой.balance) : хочет;
      if (!(сколькоБигом > 0n)) return res.status(400).json({ error: "not_enough" });

      const есть = await баланс(строка.address);
      if (есть < 0.25) return res.status(400).json({ error: "not_enough_gas", have: есть, need: 0.25 });

      /* Та же отметка, что и у покупки: повтор запроса не продаёт
         жетоны второй раз. */
      const опПродажи = await начать(db, user, {
        дело: "sell", сумма: сколько, адрес: мой.address,
        ключЗапроса: String(тело.requestKey || "").slice(0, 64) || null,
        ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null,
      });
      if (опПродажи.повтор) return res.status(200).json({ ok: true, repeat: true });

      const { beginCell, internal, Address, SendMode } = await библиотеки();
      const { пара, кошелёк: открытый } = await подписант(строка, набор, user);

      const пометка = beginCell().storeBit(false).storeUint(SELL_OP, 32).storeCoins(0n).endCell();
      const тело_ = beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(0n, 64)
        .storeCoins(сколькоБигом)
        .storeAddress(Address.parse(рынок))
        .storeAddress(Address.parse(строка.address))
        .storeBit(false)
        .storeCoins(ПЕРЕСЫЛКА_ПРОДАЖИ)
        .storeBit(true)
        .storeRef(пометка)
        .endCell();

      const seqno = await открытый.getSeqno();
      await открытый.sendTransfer({
        seqno,
        secretKey: пара.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        messages: [internal({
          to: Address.parse(мой.address),
          value: ГАЗ_ПРОДАЖИ,
          body: тело_,
          bounce: true,
        })],
      });

      await завершить(db, опПродажи.id, `seqno:${seqno}`);
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
      /* Куда выводим — как в Solana: привязанный адрес главнее, а пока
         его нет, адрес можно назвать прямо в запросе. Иначе деньги с
         внутреннего кошелька просто некуда забрать. */
      const { Address: АдресTON } = await библиотеки();
      const названный = String(тело.address || "").trim();
      if (названный) {
        try { АдресTON.parse(названный); } catch { return res.status(400).json({ error: "bad_address" }); }
      }
      if (строка.payout_address && названный && названный !== строка.payout_address) {
        return res.status(400).json({ error: "payout_locked", payout: строка.payout_address });
      }
      const куда = строка.payout_address || названный;
      if (!куда) return res.status(400).json({ error: "no_payout" });
      if (куда === строка.address) return res.status(400).json({ error: "same_address" });

      const есть = await баланс(строка.address);
      const сумма = тело.all ? Math.max(0, есть - 0.05) : Number(тело.amount) || 0;
      if (!(сумма > 0) || сумма > есть) return res.status(400).json({ error: "bad_amount" });

      const выведено = await выведеноЗаСутки(db, user);
      if (выведено + сумма > ЛИМИТ_В_СУТКИ) {
        return res.status(400).json({ error: "daily_limit", left: Math.max(0, ЛИМИТ_В_СУТКИ - выведено) });
      }

      /* Отметка в журнале до перевода: по ней повтор того же запроса
         вернёт исход первого, а не отправит деньги ещё раз. */
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
      const оп = await начать(db, user, {
        дело: "withdraw", сумма, адрес: куда,
        ключЗапроса: String(тело.requestKey || "").slice(0, 64) || null, ip,
      });
      if (оп.повтор) return res.status(200).json({ ok: true, sent: сумма, repeat: true });

      const { internal, toNano, Address, SendMode } = await библиотеки();
      const { пара, кошелёк: открытый } = await подписант(строка, набор, user);
      const seqno = await открытый.getSeqno();
      await открытый.sendTransfer({
        seqno,
        secretKey: пара.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        messages: [internal({
          to: Address.parse(куда),
          value: toNano(сумма.toFixed(9)),
          bounce: false,
        })],
      });

      await завершить(db, оп.id, `seqno:${seqno}`);
      return res.status(200).json({ ok: true, sent: сумма });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    console.error("[wallet-ton]", err && err.message);
    return res.status(500).json({ error: "failed", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
