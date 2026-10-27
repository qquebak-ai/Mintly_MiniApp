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
import { нуженВторойКлюч } from "./_second.js";
import { занятьПоОчереди, свободныйНомер, занятьНомер, номерЖдёт } from "./_walletLock.js";
import { скоростьИз, наценка, монетыЗаСкорость, списатьМонетыЗаСкорость } from "./_speed.js";
import { быстрыйОстаток } from "./_остаток.js";
import { ВНУТРЕННИЙ_ВХОД } from "./_внутри.js";

const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
const TONAPI_KEY = process.env.TONAPI_KEY || "";

// Столько кошелёк держит спокойно; выше — приложение просит вывести.
const ПОТОЛОК = Number(process.env.TON_WALLET_CAP || 50);
// Больше этого за сутки не уходит наружу: украденная сессия не выносит
// всё разом.
/* Суточный предел вывода. По умолчанию его нет: человек выводит свои
   деньги, и упираться в потолок на ровном месте он не должен. Ставится
   только вручную — положительным числом в TON_WALLET_DAILY; ноль и пустое
   значение означают «без предела». */
const ЛИМИТ_В_СУТКИ = Number(process.env.TON_WALLET_DAILY || 0);
const ЕСТЬ_ПРЕДЕЛ = ЛИМИТ_В_СУТКИ > 0;

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

// Ключ принимаем в том же виде, что и кошелёк Solana: шестнадцатеричной
// строкой или base64. Раньше здесь понимался только base64, а на сервере
// ключ лежит hex-строкой — и кошелёк TON считался выключенным.
function разобратьКлюч(строка) {
  const s = String(строка || "").trim();
  if (!s) return null;
  try {
    const b = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
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

const ПОЛЯ = "user_id, chain, address, secret_enc, key_id, payout_address, payout_pending, payout_pending_at";

/* Смена адреса вывода ждёт сутки — как в Solana. Тот, кто завладел
   сессией, мог бы сразу подменить адрес и вывести всё; за сутки
   владелец видит уведомление в боте и успевает отменить. */
const ЗАДЕРЖКА_ПРИВЯЗКИ = 24 * 60 * 60 * 1000;
async function освежитьПривязку(db, строка) {
  if (!строка.payout_pending || !строка.payout_pending_at) return строка;
  if (Date.now() - new Date(строка.payout_pending_at).getTime() < ЗАДЕРЖКА_ПРИВЯЗКИ) return строка;
  await db.from("app_wallets")
    .update({ payout_address: строка.payout_pending, payout_pending: null, payout_pending_at: null })
    .eq("user_id", строка.user_id).eq("chain", "ton");
  return { ...строка, payout_address: строка.payout_pending, payout_pending: null, payout_pending_at: null };
}

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

/* Кошелёк комиссии площадки — тот же, что зашит в кривые и пулы
   (АДРЕС_КОМИССИИ в src/tonLaunchCore.js). На него уходит наценка за
   скорость (api/_speed.js). */
const КОШЕЛЁК_КОМИССИИ = (process.env.TON_FEE_ADDRESS || "0QClGN5huzz-Z3bwgxr7GOPe5Jyi8PNKbsNnDFKFNGbjunBZ").trim();

/* Отправка перевода — по скорости. «Обычно» — как раньше: библиотека
   сперва спрашивает узел, развёрнут ли кошелёк, и шлёт в toncenter.
   «Быстро» и «Молния» собирают внешнее сообщение сами — кошелёк с
   номером больше нуля уже развёрнут, спрашивать об этом незачем, это
   круг к узлу, — и шлют его сразу в toncenter и tonapi: принял любой —
   перевод в сети, а дубль тот же номер сеть отбросит. */
async function отправитьПеревод({ кошелёк: открытый, контракт, client }, args, скорость = "fast") {
  if (скорость === "normal") return открытый.sendTransfer(args);
  const { external, beginCell, storeMessage } = await библиотеки();
  const тело = контракт.createTransfer({ seqno: args.seqno, secretKey: args.secretKey, messages: args.messages, sendMode: args.sendMode });
  const внешнее = external({ to: контракт.address, init: args.seqno === 0 ? контракт.init : undefined, body: тело });
  const boc = beginCell().store(storeMessage(внешнее)).endCell().toBoc();
  const пути = [client.sendFile(boc)];
  пути.push(fetch(`${TONAPI}/v2/blockchain/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {}) },
    body: JSON.stringify({ boc: boc.toString("base64") }),
    signal: AbortSignal.timeout(8000),
  }).then((r) => { if (!r.ok) throw new Error(`tonapi ${r.status}`); }));
  await Promise.any(пути).catch((e) => { throw (e && e.errors && e.errors[0]) || e; });
}

// Последний ответ по адресу: на сбой узла — он, а не ноль (см. Solana).
const последнийБаланс = new Map();
async function балансИзСети(адрес) {
  for (let попытка = 0; попытка < 2; попытка += 1) {
    try {
      const res = await fetch(`${TONAPI}/v2/accounts/${адрес}`, {
        headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404) { последнийБаланс.set(адрес, 0); return 0; }
      if (!res.ok) { await new Promise((r) => setTimeout(r, 400)); continue; }
      const j = await res.json();
      const v = (Number(j.balance) || 0) / 1e9;
      последнийБаланс.set(адрес, v);
      return v;
    } catch { /* повторим */ }
  }
  // Сеть не ответила и прежнего числа нет — null: ноль на карточке при
  // деньгах на кошельке хуже, чем честное «ещё не знаем».
  return последнийБаланс.has(адрес) ? последнийБаланс.get(адрес) : null;
}
// Для проверок перед тратой неизвестное — ноль: тратить то, чего не
// видно, нельзя.
async function баланс(адрес) {
  const v = await балансИзСети(адрес);
  return v == null ? 0 : v;
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
    // Перевод человеку уносит деньги так же, как вывод, — он в пределе.
    .eq("user_id", user.id).eq("chain", "ton").in("kind", ["withdraw", "transfer"])
    .gte("created_at", сутки);
  return (data || []).reduce((с, о) => с + (Number(о.amount) || 0), 0);
}

/* Начало денежной операции: отметка в журнале, она же защита от двух
   бед сразу. Первая — двойное нажатие: тот же ключ запроса не создаёт
   вторую строку, и вместо повторного перевода возвращается исход
   первого. Вторая — шквал: больше нескольких операций в минуту от одного
   человека не пропускаем. В Solana это давно так; в TON вывода это не
   было, и повторное нажатие отправляло деньги ещё раз. */
// Быстрые нажатия — несколько сделок за секунды, и они должны проходить;
// предел только против шквала.
const ОПЕРАЦИЙ_В_МИНУТУ = Number(process.env.TON_WALLET_RATE || 40);

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

/* Перевод не ушёл — строки в журнале быть не должно (как в Solana):
   иначе в истории висела трата, которой не было, она съедала предел за
   сутки, а ключ запроса на честный повтор отвечал «уже сделано». */
async function отменить(db, id) {
  if (!id) return;
  try { await db.from("wallet_ops").delete().eq("id", id); } catch { /* журнал не главнее самой ошибки */ }
}

/* Весточка в бота. Деньги ушли из кошелька — человек должен узнать об
   этом, даже если приложение в этот момент закрыто. Молчание бота саму
   операцию не отменяет. */
// Уведомления идут только отдельным ботом MintlyTrading: основной бот —
// для входа и команд, а сделки и деньги — в своём тихом канале.
const BOT_TOKEN = (process.env.TRADING_BOT_TOKEN || "").trim();
// Монета сети в письмах бота: в приложении она называется GRAM.
const ТИКЕР = "GRAM";
async function сообщить(db, user_id, текст) {
  if (!BOT_TOKEN) return;
  try {
    const { data } = await db.from("profiles").select("telegram_id").eq("id", user_id).maybeSingle();
    if (!data || !data.telegram_id) return;
    // Через общий отправитель: он помнит, не выключил ли человек уведомления.
    const { уведомить } = await import("./_trading.js");
    await уведомить(data.telegram_id, текст, "wallet");
  } catch { /* бот молчит — это не повод отменять саму операцию */ }
}

/* Живая цена в мемпаде и на главной — сразу после своей сделки, а не на
   следующем минутном обходе. Перевод отправлен, но сеть подтверждает
   его не мгновенно (см. комментарий у setTimeout ниже по файлу про
   баланс) — тем же двум с половиной секундам даём кривой время дойти
   до нового состояния, читаем его и толкаем всем, кто слушает
   api/ton-stream.js?all=1: обоим спискам сразу, без ожидания опроса.
   Отдельно от ответа человеку — та сделка уже закрыта, эта работа
   только для чужих экранов. */
async function подтолкнутьЦену(tokenId, curveAddress) {
  if (!curveAddress) return;
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const { состояние, цена, DEFAULT_VIRTUAL_TON, DEFAULT_VIRTUAL_TOKENS } = await import("./refresh-curves.js");
    const st = await состояние(curveAddress);
    // Кривая закрылась ровно на этой сделке — цена переезжает в пул, а
    // читать его здесь не будем: редкий случай, минутный обход дочитает.
    if (!st || st.graduated) return;
    const params = { virtualTon: st.virtualTon || DEFAULT_VIRTUAL_TON, virtualTokens: st.virtualTokens || DEFAULT_VIRTUAL_TOKENS };
    const свежаяЦена = цена(st.realTon, params);
    if (!(свежаяЦена > 0)) return;

    /* Сначала — в живую память: она сверит чтение с тем, что уже знает,
       и отставшее (сделка ещё не легла, узел tonapi отстал) не примет.
       Тогда и в кеш ленты его не пишем. */
    const { протолкнутьЦену } = await import("./ton-stream.js");
    const итог = протолкнутьЦену(curveAddress, {
      price: свежаяЦена,
      raised: Number(st.realTon) / 1e9,
      sold: Number(st.tokensSold) / 1e9,
      graduation: Number(st.graduationTon) / 1e9,
      graduated: false,
    });
    if (!итог.изменилось) return;

    const db = admin();
    if (db) {
      await db.from("curve_cache").update({
        price_ton: свежаяЦена,
        real_ton: Number(st.realTon) / 1e9,
        graduation_ton: Number(st.graduationTon) / 1e9,
        tokens_sold: Number(st.tokensSold) / 1e9,
        graduated: false,
        updated_at: new Date().toISOString(),
      }).eq("token_id", tokenId);
    }
  } catch (err) {
    console.warn("[wallet-ton] не удалось протолкнуть цену:", err && err.message);
  }
}

async function записать(db, user, kind, amount, hash) {
  await db.from("wallet_ops").insert({
    user_id: user.id, chain: "ton", kind, amount, signature: hash || null,
  }).then(() => {}, () => {});
}

/* Кривая и жетон — настоящие ли.
 *
 * Адрес кривой и сам жетон записывает в строку токена браузер создателя,
 * и правит их он же. Раньше покупка отправляла монеты по этому адресу
 * не глядя: подставь свой кошелёк — и все покупатели платят тебе. Теперь
 * адрес кривой сверяется с тем, что получается из кода кривой площадки и
 * её параметров (админ — кошелёк создателя в приложении, комиссия и
 * получатель ликвидности — наши), а у жетона проверяется стандартный код
 * и отказ от выпуска: допечатать токены и слить их в кривую некому. */
const проверенныеКривые = new Map(); // токен|кривая -> { итог, до }
async function проверкаКривой(db, токен) {
  const ключ = `${токен.id}|${токен.curve_address}`;
  const было = проверенныеКривые.get(ключ);
  // Проверенное до конца не меняется — его помним; «ещё с админом» и
  // сбой сети перепроверяем через пятнадцать секунд.
  if (было && (было.итог.безАдмина || было.до > Date.now())) return было.итог;
  const итог = { кривая: false, безАдмина: false, админ: null };
  try {
    const { Address, Cell } = await библиотеки();
    const { data: владелец } = !токен.owner_id ? { data: null } : await db.from("app_wallets").select("address")
      .eq("user_id", токен.owner_id).eq("chain", "ton").maybeSingle();
    /* Админ кривой — кошелёк создателя в приложении; у аккаунта, который
       удалили, его уже нет, и тогда сверяем по кошельку из строки токена.
       Подменить им ничего нельзя: права админа у кривой — только
       привязать кошелёк жетона, а его привязку мы проверяем ниже. */
    const админы = [...new Set([владелец && владелец.address, токен.creator_wallet].filter(Boolean))];
    if (админы.length && токен.address && токен.curve_address) {
      const { адресаКривойПлощадки, отпечатокМинтера, кошелёкЖетонаКривой } = await import("./_tonLaunchCore.js");
      const { кошелёкЛиквидности } = await import("./_stonfi.js");
      const ликв = await кошелёкЛиквидности().catch(() => null);
      const ожидаем = [];
      for (const адм of админы) {
        try { ожидаем.push(...(await адресаКривойПлощадки({ admin: адм, jettonMaster: токен.address, ликвидность: ликв ? ликв.адрес : null }))); } catch { /* не адрес TON */ }
      }
      if (ожидаем.includes(Address.parse(токен.curve_address).toRawString())) {
        const заголовки = TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {};
        const [счёт, жетон] = await Promise.all([
          fetch(`${TONAPI}/v2/blockchain/accounts/${encodeURIComponent(токен.address)}`, { headers: заголовки, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)),
          fetch(`${TONAPI}/v2/jettons/${encodeURIComponent(токен.address)}`, { headers: заголовки, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)),
        ]);
        const код = счёт && счёт.code ? Cell.fromBoc(Buffer.from(счёт.code, "hex"))[0].hash().toString("hex") : "";
        // Кошелёк жетона у кривой — восьмое поле data() после чисел и
        // флага (contracts/src/bonding_curve.tact, CurveData).
        let привязан = "";
        try {
          const { TonClient } = await библиотеки();
          const c = new TonClient({
            endpoint: process.env.TONCENTER_URL
              || (TESTNET ? "https://testnet.toncenter.com/api/v2/jsonRPC" : "https://toncenter.com/api/v2/jsonRPC"),
            apiKey: process.env.TONCENTER_API_KEY || undefined,
          });
          const ответ = await c.runMethod(Address.parse(токен.curve_address), "data");
          ответ.stack.skip(8);
          const а = ответ.stack.readAddressOpt();
          привязан = а ? а.toRawString() : "";
        } catch { /* узел не ответил — проверим в следующий раз */ }
        const свой = привязан && привязан === кошелёкЖетонаКривой({ curve: токен.curve_address, jettonMaster: токен.address });
        итог.кривая = код === отпечатокМинтера() && !!жетон && !!свой;
        итог.безАдмина = итог.кривая && !жетон.admin;
        итог.админ = жетон && жетон.admin && жетон.admin.address ? жетон.admin.address : null;
      }
    }
  } catch (e) {
    console.warn("[wallet-ton] проверка кривой не удалась:", e && e.message);
  }
  проверенныеКривые.set(ключ, { итог, до: Date.now() + 15000 });
  if (проверенныеКривые.size > 2000) проверенныеКривые.clear();
  return итог;
}

/* Покупать — только у кривой, где допечатать токены уже некому.
   Продавать — у любой настоящей кривой: закрыть держателям выход из-за
   того, что создатель не отказался от выпуска, значило бы запереть их
   деньги. */
export async function криваяНастоящая(db, токен, { продажа = false } = {}) {
  const п = await проверкаКривой(db, токен);
  return продажа ? п.кривая : п.кривая && п.безАдмина;
}

/* Отказ от выпуска у токенов, запущенных до того, как отказ вошёл в сам
   запуск, и у запусков, оборвавшихся до пакета с ним. Админ жетона —
   кошелёк создателя в приложении, ключ от него у сервера: пока админ
   жив, создатель может по своей фразе допечатать токенов и слить их в
   кривую. Отказ стоит 0,03 TON с кошелька создателя. Зовёт его круг
   выхода на биржу (api/ton-migrate.js). */
export async function отказатьсяОтВыпуска(db, токен) {
  const набор = ключи();
  if (!db || !набор || !токен.owner_id || !токен.address || !токен.curve_address) return false;
  const п = await проверкаКривой(db, токен);
  if (!п.кривая || п.безАдмина || !п.админ) return false;
  const { Address, internal, SendMode } = await библиотеки();
  const { data: строка } = await db.from("app_wallets").select(ПОЛЯ)
    .eq("user_id", токен.owner_id).eq("chain", "ton").maybeSingle();
  // Админ — не кошелёк создателя в приложении: ключа от него у нас нет.
  if (!строка || !Address.parse(п.админ).equals(Address.parse(строка.address))) return false;
  if ((await баланс(строка.address)) < 0.06) return false;
  const user = { id: токен.owner_id };
  let отпустить;
  // Фоновая работа: если кошелёк занят сделками, придём в следующий круг.
  try { отпустить = await занятьПоОчереди(номерКошелька(user), { ждать: 1000, предел: 0 }); } catch { return false; }
  try {
    const { сообщениеОтказа } = await import("./_tonLaunchCore.js");
    const м = await сообщениеОтказа({ admin: строка.address, jettonMaster: токен.address });
    const { пара, кошелёк: открытый } = await подписант(строка, набор, user);
    const seqno = await свободныйНомер(открытый, номерКошелька(user));
    await открытый.sendTransfer({
      seqno,
      secretKey: пара.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
      messages: [internal({ to: м.to, value: м.value, body: м.body, bounce: true })],
    });
    занятьНомер(номерКошелька(user), seqno);
    проверенныеКривые.delete(`${токен.id}|${токен.curve_address}`);
    return true;
  } catch (e) {
    console.warn("[wallet-ton] отказ от выпуска не ушёл:", токен.id, e && e.message);
    return false;
  } finally {
    отпустить();
  }
}

/* Своя сделка TON — до вести. Сервер отвечает, когда перевод ушёл, а
   кривая исполняет его через несколько секунд. Наблюдатель спрашивает
   кривую, пока изменение не пришло, и отдаёт его вестям (api/notify.js):
   сделавшему — «прошла», владельцу токена — о покупке или продаже. Без
   него о сделке писал только обход раз в десять минут. */
async function следитьЗаСвоейСделкой(токен, user, { продажа, сумма = 0, штук = 0, скорость = "fast" }) {
  // «Молния» спрашивает кривую чаще: «прошла» и весть владельцу — раньше.
  const шаг = скорость === "turbo" ? 400 : скорость === "fast" ? 900 : 1500;
  if (!process.env.TRADING_BOT_TOKEN || !токен.curve_address || !токен.address) return;
  try {
    const [{ вестиПоКривой, своюСделку, своюСделкуЖдём }, { состояние }] = await Promise.all([
      import("./notify.js"), import("./refresh-curves.js"),
    ]);
    const ид = своюСделку(токен.address, { userId: user.id, продажа, сумма, штук, сказать: true });
    const до = Date.now() + 45_000;
    let прошлое = null;
    while (Date.now() < до && своюСделкуЖдём(токен.address, ид)) {
      await new Promise((r) => setTimeout(r, шаг));
      const st = await состояние(токен.curve_address).catch(() => null);
      if (!st) continue;
      const собрано = Number(st.realTon) / 1e9;
      if (прошлое === собрано) continue;
      прошлое = собрано;
      await вестиПоКривой({
        tokenId: токен.id, собрано, продано: Number(st.tokensSold) / 1e9,
        цель: Number(st.graduationTon) / 1e9, закрыта: !!st.graduated, от: Date.now(),
      });
    }
  } catch (e) {
    console.warn("[wallet-ton] наблюдатель сделки:", e && e.message);
  }
}

/* Один перевод за раз. Кошелёк TON нумерует переводы (seqno), и второй,
   отправленный до того, как сеть приняла первый, получал тот же номер —
   сеть молча отбрасывала его, а в истории он значился сделкой. Замок и
   номер — общие с обменом через казну (api/_walletLock.js). */
const номерКошелька = (user) => `ton:${user.id}`;

/* Токен вышел на STON.fi — сделка обменом через роутер биржи, а не по
   кривой. Пул STON.fi узнаём по адресу: роутер считает его из пары
   жетонов, и если в базе записан именно он — токен на бирже; иначе там
   прежний собственный пул токена, и сделка идёт старым путём. */
async function сделкаНаSTON(токен, кеш, { покупка, сумма, кошелёк }) {
  if (!(кеш && кеш.graduated) || !токен.dex_pool_address || !токен.address) return null;
  const { адресПула, сделкаВПуле } = await import("./_stonfi.js");
  const { Address, Cell, internal } = await библиотеки();
  const пул = await адресПула(токен.address).catch(() => null);
  if (!пул || !пул.equals(Address.parse(токен.dex_pool_address))) return null;
  const т = await сделкаВПуле({ jetton: токен.address, покупка, сумма, кошелёк });
  return internal({
    to: Address.parse(т.to),
    value: BigInt(т.value),
    body: т.body ? Cell.fromBase64(т.body) : undefined,
    bounce: true,
  });
}

export default async function handler(req, res) {
  const db = admin();
  const набор = ключи();
  const действие = String((req.query && req.query.action) || "");

  if (действие === "enabled") {
    return res.status(200).json({ enabled: !!(db && набор), network: TESTNET ? "testnet" : "mainnet" });
  }
  if (!db || !набор) return res.status(503).json({ error: "not_configured" });

  let отпустить = null;
  try {
    // Изнутри сервера (лимитная заявка, api/_limitWorker.js) человек уже
    // известен; снаружи метку не подделать — это символ (api/_внутри.js).
    const user = req[ВНУТРЕННИЙ_ВХОД] || await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const строка = await освежитьПривязку(db, await кошелёк(db, user, набор));

    if (действие === "state") {
      res.setHeader("Cache-Control", "no-store");
      // Остаток — быстрым путём, как в Solana (api/_остаток.js).
      const свежее = String((req.query && req.query.fresh) || "") === "1";
      const [есть, выведено] = await Promise.all([
        быстрыйОстаток(`ton:${строка.address}`, () => балансИзСети(строка.address), { свежее }),
        выведеноЗаСутки(db, user),
      ]);
      return res.status(200).json({
        address: строка.address,
        ton: есть,
        cap: ПОТОЛОК,
        // Без предела поле пустое: интерфейс тогда ничем сумму не режет.
        dailyLeft: ЕСТЬ_ПРЕДЕЛ ? Math.max(0, ЛИМИТ_В_СУТКИ - выведено) : null,
        payout: строка.payout_address || null,
        pending: строка.payout_pending || null,
        pendingAt: строка.payout_pending_at || null,
        network: TESTNET ? "testnet" : "mainnet",
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    /* Тратящие действия — по одному на кошелёк: иначе пачка одновременных
       выводов проходила проверку предела за сутки по одной и той же сумме,
       а покупки разом брали один seqno. Сделки при этом не отказывают, а
       встают в очередь: быстрые нажатия проходят одно за другим. */
    if (["launch", "buy", "sell", "withdraw"].includes(действие)) отпустить = await занятьПоОчереди(номерКошелька(user));

    /* Запуск токена кошельком приложения.
       Из браузера приходит только адрес метаданных (их браузер уже
       положил в хранилище площадки) и сумма стартовой покупки. Жетон,
       кривую и пул сервер собирает сам — из адреса этого кошелька и
       параметров площадки, — так что подписывается ровно запуск и
       ничего больше. Админом контрактов становится сам кошелёк
       приложения: им же потом платят и подписывают сделки. */
    if (действие === "launch") {
      const метаданные = String(тело.metadataUrl || "");
      const покупка = Math.max(0, Number(тело.buyAmount) || 0);
      // Метаданные — только из своего хранилища: чужой адрес мог бы
      // подменить имя и картинку токена уже после запуска.
      const своё = `${SUPABASE_URL}/storage/v1/object/public/token-assets/${user.id}/`;
      if (!метаданные.startsWith(своё) || !метаданные.endsWith("/metadata.json") || метаданные.length > 300) {
        return res.status(400).json({ error: "bad_metadata" });
      }
      if (покупка > 5000) return res.status(400).json({ error: "bad_request" });

      // Газ четырёх контрактов и сети — около 0,3; покупке свой запас.
      const есть = await баланс(строка.address);
      const нужно = 0.35 + (покупка > 0 ? покупка + 0.2 : 0);
      if (есть < нужно) return res.status(400).json({ error: "not_enough", have: есть, need: нужно });

      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
      const оп = await начать(db, user, {
        дело: "launch", сумма: покупка, адрес: null,
        ключЗапроса: String(тело.requestKey || "").slice(0, 64) || null, ip,
      });
      if (оп.повтор) return res.status(200).json({ ok: true, repeat: true });

      const { internal, SendMode } = await библиотеки();
      const { сообщенияЗапуска } = await import("./_tonLaunchCore.js");
      // Есть кошелёк ликвидности — токен выйдет на STON.fi (api/ton-migrate.js).
      const { кошелёкЛиквидности } = await import("./_stonfi.js");
      const ликв = await кошелёкЛиквидности().catch(() => null);
      const { пакеты, адреса } = await сообщенияЗапуска({ admin: строка.address, metadataUrl: метаданные, buyTon: покупка, ликвидность: ликв ? ликв.адрес : null });
      const { пара, кошелёк: открытый } = await подписант(строка, набор, user);

      /* Кошелёк v4 отправляет не больше четырёх сообщений за раз, поэтому
         запуск — два перевода: контракты и затем покупка. Второй ждёт,
         пока сеть примет первый (счётчик seqno вырастет), иначе его
         отвергнут как повтор. */
      let seqno = await свободныйНомер(открытый, номерКошелька(user));
      const подписи = [];
      try {
        for (let i = 0; i < пакеты.length; i += 1) {
          if (i > 0) {
            const было = seqno;
            // Блок в TON — доли секунды, а спрашивали раз в две секунды:
            // покупка после запуска ждала лишнее. Теперь — чаще.
            for (let ждём = 0; ждём < 85; ждём += 1) {
              await new Promise((r) => setTimeout(r, 700));
              try { seqno = await открытый.getSeqno(); } catch { /* узел моргнул — спросим снова */ }
              if (seqno > было) break;
            }
            if (seqno <= было) break; // покупку не шлём вслепую: её можно сделать со страницы токена
          }
          await открытый.sendTransfer({
            seqno,
            secretKey: пара.secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: пакеты[i].map((m) => internal({ to: m.to, value: m.value, body: m.body, init: m.init, bounce: m.bounce })),
          });
          подписи.push(`seqno:${seqno}`);
        }
      } catch (e) {
        // Ушёл хотя бы первый пакет — запуск в сети есть, строку оставляем.
        if (!подписи.length) { await отменить(db, оп.id); throw e; }
      }

      занятьНомер(номерКошелька(user), seqno);
      await завершить(db, оп.id, подписи.join(","));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, ...адреса, wallet: строка.address, bought: подписи.length > 1 });
    }

    /* Покупка на кривой — без подтверждения в кошельке.
       Адрес кривой не приходит из запроса: он берётся из базы по токену,
       который человек открыл. Подсунуть чужой контракт нельзя. */
    if (действие === "buy") {
      const tokenId = String(тело.tokenId || "");
      const сумма = Number(тело.amount) || 0;
      if (!tokenId || !(сумма > 0)) return res.status(400).json({ error: "bad_request" });

      const { data: токен } = await db
        .from("tokens")
        .select("id, owner_id, creator_wallet, address, curve_address, dex_pool_address, chain, curve_cache(graduated)")
        .eq("id", tokenId)
        .maybeSingle();
      if (!токен || (токен.chain || "ton") !== "ton") return res.status(404).json({ error: "token_not_found" });

      const кеш = Array.isArray(токен.curve_cache) ? токен.curve_cache[0] : токен.curve_cache;
      const адресРынка = (кеш && кеш.graduated && токен.dex_pool_address) || токен.curve_address;
      if (!адресРынка) return res.status(400).json({ error: "no_curve" });
      // На кривую — только на проверенную (на бирже пул сверяет роутер).
      if (!(кеш && кеш.graduated) && !(await криваяНастоящая(db, токен))) {
        return res.status(400).json({ error: "unverified_curve" });
      }

      /* Сперва ждём, пока сеть примет прошлую сделку этого кошелька (номер
         seqno вырос), и только потом смотрим остаток — у того же узла, что
         отвечает за номер. Иначе при быстрых нажатиях вторая покупка
         проверялась по остатку до первой. */
      /* Скорость (api/_speed.js): наценка площадке уходит тем же переводом,
         а «Быстро» и «Молния» читают номер и остаток разом, если прошлый
         перевод кошелька уже принят. */
      const скорость = скоростьИз(тело.speed);
      // Наценку можно оплатить монетами приложения — тогда в переводе её нет.
      const монет = await монетыЗаСкорость(db, user.id, скорость, тело.payCoins);
      const надбавка = монет > 0 ? 0 : наценка("ton", скорость);
      const подпис = await подписант(строка, набор, user);
      const { пара, контракт, client, кошелёк: открытый } = подпис;
      const остаток = () => client.getBalance(контракт.address).then((б) => Number(б) / 1e9).catch(() => баланс(строка.address));
      const разом = скорость !== "normal" && !номерЖдёт(номерКошелька(user));
      const [seqno, есть] = разом
        ? await Promise.all([свободныйНомер(открытый, номерКошелька(user)), остаток()])
        : [await свободныйНомер(открытый, номерКошелька(user)), await остаток()];
      // Покупка плюс газ: у кривой — 0,15 на сообщение и сеть, у биржи больше.
      const нужно = сумма + (кеш && кеш.graduated ? 0.45 : 0.2) + надбавка;
      if (есть < нужно) return res.status(400).json({ error: "not_enough", have: есть, need: нужно });

      // Вышел на STON.fi — покупка обменом через роутер биржи.
      const наБирже = await сделкаНаSTON(токен, кеш, { покупка: true, сумма, кошелёк: строка.address });

      /* Двойное нажатие не должно превращаться во вторую покупку: тот
         же ключ запроса возвращает исход первой. */
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
      const оп = await начать(db, user, {
        дело: "buy", сумма, адрес: адресРынка,
        ключЗапроса: String(тело.requestKey || "").slice(0, 64) || null, ip,
      });
      if (оп.повтор) return res.status(200).json({ ok: true, repeat: true });

      const { beginCell, internal, toNano, Address, SendMode } = await библиотеки();

      const тело_ = beginCell()
        .storeUint(OP_BUY, 32)
        .storeUint(0n, 64)
        .storeCoins(0n)   // без ограничения проскальзывания: цену считает контракт
        .endCell();

      try {
        await отправитьПеревод(подпис, {
          seqno,
          secretKey: пара.secretKey,
          sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
          messages: [наБирже || internal({
            to: Address.parse(адресРынка),
            value: toNano(сумма.toFixed(9)) + ГАЗ_ПОКУПКИ,
            body: тело_,
            bounce: true,
          }), ...(надбавка > 0 ? [internal({ to: Address.parse(КОШЕЛЁК_КОМИССИИ), value: toNano(надбавка.toFixed(9)), bounce: false })] : [])],
        }, скорость);
      } catch (e) {
        await отменить(db, оп.id);
        throw e;
      }

      занятьНомер(номерКошелька(user), seqno);
      await завершить(db, оп.id, `seqno:${seqno}`);
      списатьМонетыЗаСкорость(db, user.id, монет);
      res.setHeader("Cache-Control", "no-store");
      // Только пока сделка идёт по самой кривой: адрес рынка — это пул
      // биржи, если токен уже закрылся, а состояние() умеет читать
      // только контракт кривой.
      if (!(кеш && кеш.graduated)) {
        подтолкнутьЦену(tokenId, токен.curve_address).catch(() => {});
        следитьЗаСвоейСделкой(токен, user, { продажа: false, сумма, скорость }).catch(() => {});
      }
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
        .select("id, owner_id, creator_wallet, address, curve_address, dex_pool_address, chain, curve_cache(graduated)")
        .eq("id", tokenId)
        .maybeSingle();
      if (!токен || (токен.chain || "ton") !== "ton") return res.status(404).json({ error: "token_not_found" });
      const кеш = Array.isArray(токен.curve_cache) ? токен.curve_cache[0] : токен.curve_cache;
      const рынок = (кеш && кеш.graduated && токен.dex_pool_address) || токен.curve_address;
      if (!рынок || !токен.address) return res.status(400).json({ error: "no_curve" });
      if (!(кеш && кеш.graduated) && !(await криваяНастоящая(db, токен, { продажа: true }))) {
        return res.status(400).json({ error: "unverified_curve" });
      }

      // Как у покупки: остатки читаем после того, как прошлая сделка
      // этого кошелька принята сетью.
      const скорость = скоростьИз(тело.speed);
      // Наценку можно оплатить монетами приложения — тогда в переводе её нет.
      const монет = await монетыЗаСкорость(db, user.id, скорость, тело.payCoins);
      const надбавка = монет > 0 ? 0 : наценка("ton", скорость);
      const подпис = await подписант(строка, набор, user);
      const { пара, контракт, client, кошелёк: открытый } = подпис;
      const разом = скорость !== "normal" && !номерЖдёт(номерКошелька(user));
      const остаток = () => client.getBalance(контракт.address).then((б) => Number(б) / 1e9).catch(() => баланс(строка.address));
      // Номер, свой кошелёк жетона и остаток — разом, если прошлый перевод принят.
      const [seqno, мой, естьСразу] = разом
        ? await Promise.all([свободныйНомер(открытый, номерКошелька(user)), жетонныйКошелёк(строка.address, токен.address), остаток()])
        : [await свободныйНомер(открытый, номерКошелька(user)), await жетонныйКошелёк(строка.address, токен.address), null];
      if (!мой) return res.status(400).json({ error: "no_jetton_wallet" });
      // Больше, чем есть, не продаём: сеть такое сообщение просто
      // отобьёт, а газ спишется.
      const хочет = BigInt(Math.round(сколько * 1e9));
      const сколькоБигом = мой.balance != null && BigInt(мой.balance) < хочет ? BigInt(мой.balance) : хочет;
      if (!(сколькоБигом > 0n)) return res.status(400).json({ error: "not_enough" });

      const есть = естьСразу != null ? естьСразу : await остаток();
      if (есть < 0.35 + надбавка) return res.status(400).json({ error: "not_enough_gas", have: есть, need: 0.35 + надбавка });
      const наБирже = await сделкаНаSTON(токен, кеш, { покупка: false, сумма: Number(сколькоБигом) / 1e9, кошелёк: строка.address });

      /* Та же отметка, что и у покупки: повтор запроса не продаёт
         жетоны второй раз. */
      const опПродажи = await начать(db, user, {
        дело: "sell", сумма: сколько, адрес: мой.address,
        ключЗапроса: String(тело.requestKey || "").slice(0, 64) || null,
        ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null,
      });
      if (опПродажи.повтор) return res.status(200).json({ ok: true, repeat: true });

      // toNano — для наценки Pro/Turbo: без него продажа с наценкой падала
      // ReferenceError уже после записи операции и не уходила в сеть.
      const { beginCell, internal, toNano, Address, SendMode } = await библиотеки();

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

      try {
        await отправитьПеревод(подпис, {
          seqno,
          secretKey: пара.secretKey,
          sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
          messages: [наБирже || internal({
            to: Address.parse(мой.address),
            value: ГАЗ_ПРОДАЖИ,
            body: тело_,
            bounce: true,
          }), ...(надбавка > 0 ? [internal({ to: Address.parse(КОШЕЛЁК_КОМИССИИ), value: toNano(надбавка.toFixed(9)), bounce: false })] : [])],
        }, скорость);
      } catch (e) {
        await отменить(db, опПродажи.id);
        throw e;
      }

      занятьНомер(номерКошелька(user), seqno);
      await завершить(db, опПродажи.id, `seqno:${seqno}`);
      списатьМонетыЗаСкорость(db, user.id, монет);
      res.setHeader("Cache-Control", "no-store");
      if (!(кеш && кеш.graduated)) {
        подтолкнутьЦену(tokenId, токен.curve_address).catch(() => {});
        следитьЗаСвоейСделкой(токен, user, { продажа: true, штук: Number(сколькоБигом) / 1e9, скорость }).catch(() => {});
      }
      return res.status(200).json({ ok: true, seqno });
    }

    /* Вывод — только на адрес, который человек подтвердил заранее. */
    if (действие === "payout-set") {
      const отказ = await нуженВторойКлюч(req, db, user);
      if (отказ) return res.status(403).json({ error: отказ });
      const адрес = String(тело.address || "").trim();
      const { Address } = await библиотеки();
      try { Address.parse(адрес); } catch { return res.status(400).json({ error: "bad_address" }); }
      if (адрес === строка.address) return res.status(400).json({ error: "same_address" });
      // Сразу — только первый адрес на почти пустом кошельке: увести там
      // нечего. Иначе смена ждёт сутки.
      const есть = await баланс(строка.address);
      const сразу = !строка.payout_address && есть < 0.05;
      await db.from("app_wallets").update(сразу
        ? { payout_address: адрес, payout_pending: null, payout_pending_at: null }
        : { payout_pending: адрес, payout_pending_at: new Date().toISOString() })
        .eq("user_id", user.id).eq("chain", "ton");
      await сообщить(db, user.id, сразу
        ? `Адрес вывода привязан: <code>${адрес}</code>`
        : `Запрошена смена адреса вывода на <code>${адрес}</code>. Она вступит в силу через сутки. Если это не вы — смените пароль и напишите в поддержку.`);
      return res.status(200).json({ ok: true, payout: сразу ? адрес : null, pending: сразу ? null : адрес });
    }

    if (действие === "withdraw") {
      const отказ2 = await нуженВторойКлюч(req, db, user);
      if (отказ2) return res.status(403).json({ error: отказ2 });
      /* Куда выводим — как в Solana: привязанный адрес главнее, а пока
         его нет, адрес можно назвать прямо в запросе. Иначе деньги с
         внутреннего кошелька просто некуда забрать. */
      const { Address: АдресTON } = await библиотеки();
      /* Перевод человеку Mintly по нику — как в Solana (api/_transfer.js):
         адрес берётся из его кошелька в приложении, привязка вывода такой
         перевод закрывает. */
      let кому = null;
      let названный = String(тело.address || "").trim();
      if (тело.toUser) {
        const { человекПоИд } = await import("./_transfer.js");
        кому = await человекПоИд(db, String(тело.toUser));
        if (!кому) return res.status(404).json({ error: "user_not_found" });
        if (кому.id === user.id) return res.status(400).json({ error: "self" });
        if (строка.payout_address) return res.status(400).json({ error: "payout_locked", payout: строка.payout_address });
        названный = (await кошелёк(db, { id: кому.id }, набор)).address;
      }
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

      if (ЕСТЬ_ПРЕДЕЛ) {
        const выведено = await выведеноЗаСутки(db, user);
        if (выведено + сумма > ЛИМИТ_В_СУТКИ) {
          return res.status(400).json({ error: "daily_limit", left: Math.max(0, ЛИМИТ_В_СУТКИ - выведено) });
        }
      }

      /* Отметка в журнале до перевода: по ней повтор того же запроса
         вернёт исход первого, а не отправит деньги ещё раз. */
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
      const оп = await начать(db, user, {
        дело: кому ? "transfer" : "withdraw", сумма, адрес: куда,
        ключЗапроса: String(тело.requestKey || "").slice(0, 64) || null, ip,
      });
      if (оп.повтор) return res.status(200).json({ ok: true, sent: сумма, repeat: true });

      const { internal, toNano, Address, SendMode } = await библиотеки();
      const { пара, кошелёк: открытый } = await подписант(строка, набор, user);
      const seqno = await свободныйНомер(открытый, номерКошелька(user));
      try {
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
      } catch (e) {
        await отменить(db, оп.id);
        throw e;
      }

      занятьНомер(номерКошелька(user), seqno);
      await завершить(db, оп.id, `seqno:${seqno}`);
      if (кому) {
        /* Хеша у перевода до исполнения нет — ключ строки получателя
           собран из отправителя и номера seqno: он один на перевод. */
        const { записатьПолучение, сообщитьПолучателю } = await import("./_transfer.js");
        await записатьПолучение(db, {
          получатель: кому.id, сеть: "ton", сумма, откуда: строка.address,
          подпись: `seqno:${seqno}`, ключ: `tin:${user.id}:${seqno}`,
        });
        const { data: я } = await db.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
        сообщитьПолучателю(db, кому.id, { отКого: (я && я.nickname) || "?", сумма, монета: ТИКЕР });
      }
      await сообщить(db, user.id, кому
        ? `Отправлено ${сумма.toFixed(4)} ${ТИКЕР} <b>@${кому.nickname}</b>`
        : `Отправлено ${сумма.toFixed(4)} ${ТИКЕР} на <code>${куда}</code>`);
      return res.status(200).json({ ok: true, sent: сумма });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    console.error("[wallet-ton]", err && err.message);
    const код = (err && err.код) || 500;
    return res.status(код).json({ error: код === 409 ? "wallet_busy" : код === 429 ? "too_often" : "failed", detail: String((err && err.message) || err).slice(0, 200) });
  } finally {
    if (отпустить) отпустить();
  }
}

// Для проверки без сети (как заменитьБазуДляПроверки в api/wallet-evm.js).
export const дляПроверки = { отправитьПеревод, КОШЕЛЁК_КОМИССИИ };
