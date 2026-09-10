/* Внутренний кошелёк приложения (Solana).
 *
 * Зачем. Каждая сделка через Phantom — это поход в кошелёк и обратно.
 * Пока человек ходит, цена на кривой уезжает. Внутренний кошелёк убирает
 * этот шаг: монеты лежат на адресе, которым управляет приложение, и
 * покупка уходит в сеть сразу после нажатия.
 *
 * Чем за это платят. Ключ от адреса хранится у нас — зашифрованным, но
 * хранится. Это кастодиальное хранение, и вся защита ниже построена на
 * одном допущении: считать, что и токен входа человека, и переменные
 * окружения площадки однажды утекут. Поэтому:
 *
 *   • Транзакции собирает только сервер. Готовые байты из браузера не
 *     принимаются вовсе — раньше принимались, и это была прямая дорога
 *     к «подпиши мне перевод всего остатка».
 *   • Всё, что уходит на подпись, проходит разбор (api/_txguard.js):
 *     плательщик — наш кошелёк, программы из списка, сумма прямых
 *     переводов не больше заявленной.
 *   • Вывод — только на адрес, владение которым доказано подписью, и
 *     смена этого адреса ждёт сутки, а человек получает письмо в бота и
 *     может отменить.
 *   • Ключ шифрования привязан к владельцу (AAD), так что переставить
 *     строки в базе и подписать чужим ключом не выйдет.
 *   • Сам ключ может жить не здесь: если задан SIGNER_URL, подпись
 *     ставит отдельная служба, а Vercel ключа не видит вовсе.
 *   • Частота, суточный потолок вывода и повторы ограничены журналом
 *     операций, он же — история для разбирательств.
 *
 * Баланс нигде не хранится: он читается из сети по адресу.
 *
 * Переменные окружения:
 *   APP_WALLET_KEY      — ключ шифрования (32 байта, base64 или hex).
 *                         Без него внутренний кошелёк выключен целиком.
 *   APP_WALLET_KEY_OLD  — прежний ключ на время ротации (необязательно).
 *   APP_WALLET_LIMIT    — потолок вывода за сутки в SOL (по умолчанию 10).
 *   APP_WALLET_CAP      — с какого остатка предупреждать (по умолчанию 2).
 *   SIGNER_URL, SIGNER_TOKEN — внешняя служба подписи (необязательно).
 *   SOLANA_RPC, SOLANA_CURVE_PROGRAM, SOLANA_FEE_ACCOUNT.
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, CRON_SECRET.
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { проверитьТранзакцию } from "./_txguard.js";
import { собратьЗапуск, собратьСделку, собратьЗакрытие, состояние as состояниеКривой } from "./solana-launch.js";
import { котировка, сделка as свопJupiter, SOL_MINT } from "./solana.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const КРИВАЯ_ПРОГРАММА = (process.env.SOLANA_CURVE_PROGRAM || "").trim();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const SIGNER_URL = (process.env.SIGNER_URL || "").trim();
const SIGNER_TOKEN = (process.env.SIGNER_TOKEN || "").trim();

const LAMPORTS = 1_000_000_000;
const ЗАПАС_НА_КОМИССИЮ = 0.00002;
// Сутки на смену адреса вывода: столько есть у хозяина, чтобы увидеть
// письмо от бота и отменить чужую привязку.
const ЗАДЕРЖКА_ПРИВЯЗКИ = 24 * 60 * 60 * 1000;
// Одноразовая строка для доказательства владения живёт десять минут.
const ЖИЗНЬ_ВЫЗОВА = 10 * 60 * 1000;
const ЛИМИТ_В_СУТКИ = Number(process.env.APP_WALLET_LIMIT || 10);
const ПОТОЛОК_ХРАНЕНИЯ = Number(process.env.APP_WALLET_CAP || 2);
// Больше двенадцати операций в минуту человек руками не делает — дальше
// это либо цикл в чужом скрипте, либо перебор.
const ОПЕРАЦИЙ_В_МИНУТУ = 12;

const адресОк = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

/* --- Ключи площадки --------------------------------------------------
   Ключей может быть два: текущий и прежний. Так ключ можно сменить, не
   теряя доступ к уже заведённым кошелькам: строка помнит, каким её
   закрыли, а после первой же расшифровки перешифровывается текущим. */
function разобратьКлюч(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const b = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

const меткаКлюча = (ключ) => crypto.createHash("sha256").update(ключ).digest("hex").slice(0, 8);

function ключи() {
  const текущий = разобратьКлюч(process.env.APP_WALLET_KEY);
  if (!текущий) return null;
  const прежний = разобратьКлюч(process.env.APP_WALLET_KEY_OLD);
  const набор = new Map([[меткаКлюча(текущий), текущий]]);
  if (прежний) набор.set(меткаКлюча(прежний), прежний);
  return { текущий, метка: меткаКлюча(текущий), набор };
}

/* Шифрование ключа кошелька. AES-GCM прячет и подписывает разом, а
   владелец подмешивается как связанные данные: строка, переставленная в
   базе на другого человека, просто не расшифруется. */
function зашифровать(данные, ключ, владелец) {
  const соль = crypto.randomBytes(12);
  const шифр = crypto.createCipheriv("aes-256-gcm", ключ, соль);
  if (владелец) шифр.setAAD(Buffer.from(String(владелец)));
  const тело = Buffer.concat([шифр.update(данные), шифр.final()]);
  return Buffer.concat([соль, шифр.getAuthTag(), тело]).toString("base64");
}

function расшифроватьКлючом(строка, ключ, владелец) {
  const b = Buffer.from(String(строка), "base64");
  const шифр = crypto.createDecipheriv("aes-256-gcm", ключ, b.subarray(0, 12));
  шифр.setAuthTag(b.subarray(12, 28));
  if (владелец) шифр.setAAD(Buffer.from(String(владелец)));
  return Buffer.concat([шифр.update(b.subarray(28)), шифр.final()]);
}

/* Расшифровка с перебором: сначала нужным ключом и с владельцем, потом —
   старым и без владельца, ради строк, заведённых до этих правил. */
function расшифровать(строка, набор, владелец) {
  const порядок = строка.key_id && набор.набор.has(строка.key_id)
    ? [набор.набор.get(строка.key_id)]
    : [...набор.набор.values()];
  for (const ключ of порядок) {
    for (const аад of [владелец, null]) {
      try {
        const байты = расшифроватьКлючом(строка.secret_enc, ключ, аад);
        return { байты, свежий: ключ === набор.текущий && аад === владелец };
      } catch { /* не этот ключ — пробуем следующий */ }
    }
  }
  throw new Error("ключ кошелька не читается");
}

let solana = null;
async function библиотеки() {
  if (!solana) {
    const [web3, spl] = await Promise.all([
      import("@solana/web3.js"),
      import("@solana/spl-token"),
    ]);
    solana = { ...web3, ...spl };
  }
  return solana;
}

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/* Кто спрашивает. Токен приходит от приложения, проверяет его сам
   Supabase — своей проверки подписи нам не надо. */
async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

const ПОЛЯ = "user_id, address, secret_enc, key_id, payout_address, payout_pending, payout_pending_at, payout_nonce, payout_nonce_at, sweep_above";

/* Кошелёк человека: берём существующий или заводим новый. Ключ рождается
   здесь и здесь же шифруется — в открытом виде он не покидает память
   обработчика. */
async function кошелёк(db, user, набор) {
  const { data } = await db.from("app_wallets").select(ПОЛЯ).eq("user_id", user.id).maybeSingle();
  if (data) return data;

  const { Keypair } = await библиотеки();
  const пара = Keypair.generate();
  const строка = {
    user_id: user.id,
    chain: "solana",
    address: пара.publicKey.toBase58(),
    secret_enc: зашифровать(Buffer.from(пара.secretKey), набор.текущий, user.id),
    key_id: набор.метка,
  };
  const { error } = await db.from("app_wallets").insert(строка);
  if (error) {
    // Уже завели параллельным запросом — читаем, что получилось.
    const { data: снова } = await db.from("app_wallets").select(ПОЛЯ).eq("user_id", user.id).maybeSingle();
    if (снова) return снова;
    throw new Error(error.message);
  }
  return строка;
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

/* Сколько на кошельке. Спрашиваем сеть: свой учёт разошёлся бы с ней при
   первом же переводе мимо приложения. */
async function баланс(адрес) {
  const b = await rpc("getBalance", [адрес]).catch(() => null);
  return Number((b && b.value) || 0) / LAMPORTS;
}

async function сообщить(db, user_id, текст) {
  if (!BOT_TOKEN) return;
  try {
    const { data } = await db.from("profiles").select("telegram_id").eq("id", user_id).maybeSingle();
    if (!data || !data.telegram_id) return;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: data.telegram_id, text: текст, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch { /* бот молчит — это не повод отменять саму операцию */ }
}

/* --- Журнал операций -------------------------------------------------
   Одна таблица закрывает три задачи разом: не дать повторить сделку по
   двойному нажатию, не дать долбить подпись в цикле и оставить историю,
   по которой потом видно, кто и куда отправил монеты. */
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
    .insert({ user_id: user.id, kind: дело, amount: сумма, address: адрес, request_key: ключЗапроса, ip })
    .select("id")
    .single();

  if (error) {
    // Тот же ключ запроса уже есть — значит это повтор нажатия, а не
    // новая операция. Отдаём её исход, а второй раз ничего не делаем.
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

async function выведеноЗаСутки(db, user) {
  const сутки = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("wallet_ops")
    .select("amount")
    .eq("user_id", user.id)
    .eq("kind", "withdraw")
    .gt("created_at", сутки);
  return (data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

/* --- Подпись ---------------------------------------------------------
   Либо здесь, либо в отдельной службе. Служба нужна затем, что ключ
   площадки тогда не лежит рядом с базой: утечка переменных Vercel сама
   по себе перестаёт открывать чужие кошельки. */
async function подписатьТут(строка, base64, набор, user_id, db) {
  const { Keypair, Transaction, VersionedTransaction } = await библиотеки();
  const { байты, свежий } = расшифровать(строка, набор, user_id);
  const пара = Keypair.fromSecretKey(new Uint8Array(байты));
  if (пара.publicKey.toBase58() !== строка.address) throw new Error("ключ не от этого адреса");

  // Расшифровали прежним ключом — заодно перешифруем текущим: ротация
  // так доводится до конца сама, без отдельного прохода по базе.
  if (!свежий && db) {
    await db.from("app_wallets")
      .update({ secret_enc: зашифровать(Buffer.from(байты), набор.текущий, user_id), key_id: набор.метка })
      .eq("user_id", user_id);
  }

  const сырые = Buffer.from(base64, "base64");
  try {
    const v = VersionedTransaction.deserialize(new Uint8Array(сырые));
    v.sign([пара]);
    return Buffer.from(v.serialize()).toString("base64");
  } catch {
    const t = Transaction.from(сырые);
    t.partialSign(пара);
    return t.serialize({ requireAllSignatures: false }).toString("base64");
  }
}

async function подписатьСлужбой(строка, base64, максПеревода) {
  const res = await fetch(`${SIGNER_URL.replace(/\/$/, "")}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SIGNER_TOKEN}` },
    body: JSON.stringify({
      secret: строка.secret_enc,
      key_id: строка.key_id || null,
      owner: строка.address,
      user_id: строка.user_id,
      transaction: base64,
      maxTransfer: максПеревода,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.signed) {
    throw new Error((json && (json.detail || json.error)) || `служба подписи: ${res.status}`);
  }
  return json.signed;
}

/* Общий путь для всех действий: проверить собранное, подписать,
   отправить. Ни одна ветка ниже не подписывает в обход этой. */
async function подписатьИОтправить({ db, user, строка, набор, base64, дело, максПеревода }) {
  await проверитьТранзакцию(base64, {
    владелец: строка.address,
    дело,
    максПеревода: Math.round(максПеревода),
    кривая: КРИВАЯ_ПРОГРАММА,
  });
  const подписанная = SIGNER_URL
    ? await подписатьСлужбой(строка, base64, Math.round(максПеревода))
    : await подписатьТут(строка, base64, набор, user.id, db);
  return await rpc("sendTransaction", [
    подписанная,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "processed", maxRetries: 3 },
  ]);
}

/* --- Закрытие кривых по расписанию -----------------------------------
 *
 * Кривая, набравшая порог, сама не закроется: программа ждёт вызова.
 * Раньше звать было некому, и токен, собравший свои 85 SOL, продолжал
 * торговаться дальше — пока не кончится запас на продажу.
 *
 * Зовём внутренним кошельком владельца токена. Кто платит комиссию, для
 * программы неважно — деньги всё равно уходят получателю, записанному в
 * кривую при создании; важно только, что порог достигнут. Владелец
 * выбран потому, что это его токен и его выход на биржу, а комиссия
 * здесь — тысячные доли цента.
 */
async function закрытьКривые(db, набор) {
  const { data: токены } = await db
    .from("tokens")
    .select("id, address, owner_id, ticker, chain")
    // Колонка chain появилась позже первых запусков, поэтому берём и
    // пустые, а цепочку у них узнаём по самому адресу.
    .or("chain.eq.solana,chain.is.null")
    .not("owner_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);

  let закрыто = 0;
  for (const tok of токены || []) {
    try {
      if (!адресОк(tok.address)) continue;
      const st = await состояниеКривой(tok.address);
      if (!st || st.закрыта || st.solСобрано < st.solЦель) continue;

      const { data: строкаКошелька } = await db
        .from("app_wallets").select(ПОЛЯ).eq("user_id", tok.owner_id).maybeSingle();
      if (!строкаКошелька) continue;
      // На комиссию нужно совсем немного, но если и её нет — ждём: тот,
      // кто следующим будет торговать этим токеном, закроет кривую сам.
      if ((await баланс(строкаКошелька.address)) < 0.001) continue;

      const собрано = await собратьЗакрытие({ payer: строкаКошелька.address, mint: tok.address });
      const подпись = await подписатьИОтправить({
        db, user: { id: tok.owner_id }, строка: строкаКошелька, набор,
        base64: собрано.transaction, дело: "graduate", максПеревода: 0,
      });
      await db.from("wallet_ops").insert({
        user_id: tok.owner_id, kind: "graduate", amount: st.solСобрано,
        address: tok.address, signature: подпись,
      });
      await сообщить(db, tok.owner_id,
        `$${tok.ticker || "токен"} закрыл кривую 🎉\nСобрано ${st.solСобрано.toFixed(2)} SOL. Ликвидность — монеты и отложенный запас токенов — ушла площадке под пару на бирже.`);
      закрыто += 1;
    } catch (e) {
      console.warn("[wallet-graduate]", tok.address, e && e.message);
    }
  }
  return закрыто;
}

/* --- Вход для бота ---------------------------------------------------
 *
 * В чате нет ни сессии Supabase, ни кошелька в кармане: там есть только
 * телеграм-аккаунт. Поэтому бот зовёт эти две функции напрямую, минуя
 * HTTP: снаружи ничего нового не открывается, а значит и подделать этот
 * путь нельзя — он существует только внутри одного развёртывания.
 *
 * Проверки те же самые, что у приложения: журнал операций, разбор
 * собранной транзакции и подпись у службы. Отдельной, «упрощённой»
 * дороги к ключу нет и быть не должно.
 */
export async function кошелёкДляБота(user_id) {
  const db = admin();
  const набор = ключи();
  if (!db || !набор || !user_id) return null;
  const строка = await освежитьПривязку(db, await кошелёк(db, { id: user_id }, набор));
  return { address: строка.address, sol: await баланс(строка.address) };
}

/* Сколько этого токена лежит на внутреннем кошельке. Нужно боту, чтобы
   предложить продать долю, а не спрашивать число штук: «продать
   половину» человек понимает, «продать 4 173 902» — нет. */
export async function балансТокенаДляБота(user_id, mint) {
  const db = admin();
  const набор = ключи();
  if (!db || !набор || !адресОк(String(mint || ""))) return 0;
  const строка = await кошелёк(db, { id: user_id }, набор);
  const ответ = await rpc("getTokenAccountsByOwner", [
    строка.address, { mint: String(mint) }, { encoding: "jsonParsed" },
  ]).catch(() => null);
  const счета = (ответ && ответ.value) || [];
  let всего = 0;
  for (const с of счета) {
    const сумма = с?.account?.data?.parsed?.info?.tokenAmount;
    всего += Number((сумма && сумма.uiAmount) || 0);
  }
  return всего;
}

/* Сделка. При покупке amount — это SOL, при продаже — штуки токена:
   так же, как их считает сама программа кривой. */
export async function сделкаДляБота({ user_id, mint, amount, продажа, ключЗапроса = null }) {
  const db = admin();
  const набор = ключи();
  if (!db || !набор) throw new Error("внутренний кошелёк выключен");
  if (!адресОк(String(mint || ""))) throw new Error("не тот адрес токена");
  const сумма = Math.max(0, Number(amount) || 0);
  if (!(сумма > 0)) throw new Error("нужна сумма");

  const user = { id: user_id };
  const строка = await освежитьПривязку(db, await кошелёк(db, user, набор));

  // Покупка идёт с остатка кошелька — проверяем до сборки, иначе человек
  // получит невнятную ошибку из сети вместо понятного «пополни».
  if (!продажа) {
    const есть = await баланс(строка.address);
    if (есть < сумма + ЗАПАС_НА_КОМИССИЮ) {
      const ошибка = new Error(`не хватает: на кошельке ${есть.toFixed(4)} SOL`);
      ошибка.нехватка = { нужно: сумма, есть, address: строка.address };
      throw ошибка;
    }
  }

  const оп = await начать(db, user, { дело: "trade", сумма: продажа ? 0 : сумма, ключЗапроса, ip: null });
  if (оп.повтор) return { signature: оп.signature, repeat: true, address: строка.address };

  const собрано = await собратьСделку({
    wallet: строка.address,
    mint: String(mint),
    продажа,
    amount: сумма,
  });
  const подпись = await подписатьИОтправить({
    db, user, строка, набор,
    base64: собрано.transaction, дело: "trade",
    максПеревода: (продажа ? 0.01 : сумма + 0.01) * LAMPORTS,
  });
  await завершить(db, оп.id, подпись);
  return { signature: подпись, curve: собрано.curve, address: строка.address };
}

/* --- Привязка адреса вывода -----------------------------------------
   Доказательство простое: кошелёк подписывает нашу строку своим ключом,
   мы проверяем подпись открытым ключом, который и есть адрес. Никаких
   переводов «на копейку» и ожиданий подтверждения. */
function проверитьПодписьАдреса(сообщение, подписьBase58, адрес, bs58) {
  const ключ = Buffer.from(bs58.decode(адрес));
  const подпись = Buffer.from(bs58.decode(подписьBase58));
  if (ключ.length !== 32 || подпись.length !== 64) return false;
  // Ed25519 в узле принимает ключ только в обёртке SPKI, а её начало
  // для этой кривой постоянно — дописываем и проверяем.
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), ключ]);
  const открытый = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  return crypto.verify(null, Buffer.from(сообщение, "utf8"), открытый, подпись);
}

const текстВызова = (адрес, вызов) =>
  `Mintly: разрешаю вывод на этот адрес\n${адрес}\n${вызов}`;

/* Созревшая привязка становится действующей сама — отдельного
   подтверждения не просим: сутки прошли, письмо человек видел. */
function созреть(строка) {
  if (!строка.payout_pending || !строка.payout_pending_at) return null;
  if (Date.now() - new Date(строка.payout_pending_at).getTime() < ЗАДЕРЖКА_ПРИВЯЗКИ) return null;
  return строка.payout_pending;
}

async function освежитьПривязку(db, строка) {
  const зрелый = созреть(строка);
  if (!зрелый) return строка;
  await db.from("app_wallets")
    .update({ payout_address: зрелый, payout_pending: null, payout_pending_at: null })
    .eq("user_id", строка.user_id);
  return { ...строка, payout_address: зрелый, payout_pending: null, payout_pending_at: null };
}

/* --- Вывод ----------------------------------------------------------- */
async function собратьВывод({ откуда, куда, лямпорты }) {
  const { Connection, PublicKey, SystemProgram, Transaction } = await библиотеки();
  const connection = new Connection(RPC, "confirmed");
  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: new PublicKey(откуда),
    toPubkey: new PublicKey(куда),
    lamports: лямпорты,
  }));
  tx.feePayer = new PublicKey(откуда);
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
}

/* Автовывод излишка. Горячий кошелёк должен быть маленьким: всё, что
   выше порога, само уходит на свой адрес. Ходит по расписанию, а не по
   запросу человека, — потому и живёт отдельным действием под ключом. */
async function свести(db, набор) {
  const { data } = await db
    .from("app_wallets")
    .select(ПОЛЯ)
    .not("sweep_above", "is", null)
    .not("payout_address", "is", null)
    .limit(50);
  let сделано = 0;
  for (const строка of data || []) {
    try {
      const есть = await баланс(строка.address);
      const порог = Number(строка.sweep_above) || 0;
      const излишек = есть - порог;
      if (!(порог > 0) || излишек <= 0.001) continue;
      const лямпорты = Math.floor((излишек - ЗАПАС_НА_КОМИССИЮ) * LAMPORTS);
      if (лямпорты <= 0) continue;
      const base64 = await собратьВывод({ откуда: строка.address, куда: строка.payout_address, лямпорты });
      const подпись = await подписатьИОтправить({
        db, user: { id: строка.user_id }, строка, набор,
        base64, дело: "withdraw", максПеревода: лямпорты,
      });
      await db.from("wallet_ops").insert({
        user_id: строка.user_id, kind: "sweep", amount: лямпорты / LAMPORTS,
        address: строка.payout_address, signature: подпись,
      });
      await сообщить(db, строка.user_id,
        `Автовывод: ${(лямпорты / LAMPORTS).toFixed(4)} SOL ушли на ${строка.payout_address.slice(0, 6)}…`);
      сделано += 1;
    } catch (e) {
      console.warn("[wallet-sweep]", строка.address, e && e.message);
    }
  }
  return сделано;
}

/* Правила запуска: честный старт и замок доли создателя.
 *
 * Обещания создателя не должны жить одной строкой в описании — сервер
 * их и исполняет. Честный старт: первую минуту кривая открыта только
 * тем, кто пришёл из Telegram, — снайпер-бот, торгующий напрямую по
 * адресу, до приложения не доходит и покупает уже после. Замок:
 * создатель не может продать свою долю раньше, чем кривая наберёт
 * оговорённое.
 */
const ЧЕСТНЫЙ_СТАРТ_СЕК = 60;

async function правилаТокена(db, mint) {
  if (!db || !mint) return null;
  const { data } = await db
    .from("tokens")
    // Сколько кривая собрала, лежит в её кеше, а не в самом токене.
    .select("id, owner_id, created_at, fair_start, creator_lock, curve_cache(real_ton, graduation_ton, graduated)")
    .eq("address", String(mint))
    .maybeSingle();
  return data || null;
}

/* Что мешает этой сделке. null — ничего. */
async function запретСделки(db, { mint, user, продажа, telegramПривязан }) {
  const т = await правилаТокена(db, mint);
  if (!т) return null;

  if (!продажа && т.fair_start) {
    const прошло = (Date.now() - new Date(т.created_at).getTime()) / 1000;
    // Условие простое: в первую минуту нужен Telegram-аккаунт. Всё, что
    // ходит мимо приложения, его не предъявит.
    if (прошло < ЧЕСТНЫЙ_СТАРТ_СЕК && !telegramПривязан) {
      return { error: "fair_start", left: Math.ceil(ЧЕСТНЫЙ_СТАРТ_СЕК - прошло) };
    }
  }

  if (продажа && т.creator_lock && т.creator_lock !== "none" && user && String(т.owner_id) === String(user.id)) {
    const кривая = Array.isArray(т.curve_cache) ? т.curve_cache[0] : т.curve_cache;
    const собрано = Number(кривая && кривая.real_ton) || 0;
    const цель = Number(кривая && кривая.graduation_ton) || 0;
    if (кривая && кривая.graduated) return null;   // кривая закрыта — замок снят
    // «До биржи» — доля открывается только после закрытия кривой,
    // «по вехам» — после половины пути.
    const порог = т.creator_lock === "graduation" ? цель : цель * 0.5;
    if (цель > 0 && собрано < порог) {
      return { error: "creator_locked", need: порог, have: собрано };
    }
  }

  return null;
}

export default async function handler(req, res) {
  const db = admin();
  const набор = ключи();
  const действие = String((req.query && req.query.action) || "");

  // Отдельным вопросом — включён ли внутренний кошелёк вообще: без ключа
  // площадки заводить его нечем, и приложение не должно его показывать.
  if (действие === "enabled") {
    // Заодно говорим, в какой сети работает кошелёк: без этого «почему
    // не приходит перевод» выясняется гаданием, а не одним запросом.
    const сеть = /devnet/.test(RPC) ? "devnet" : /testnet/.test(RPC) ? "testnet" : "mainnet-beta";
    return res.status(200).json({ enabled: !!(db && набор), cluster: сеть });
  }
  if (!db || !набор) return res.status(503).json({ error: "not_configured" });

  // Расписание сводит излишки на свои адреса и приходит без токена
  // человека — только с общим ключом расписаний.
  if (действие === "sweep") {
    const ключ = (req.headers.authorization || "").replace("Bearer ", "");
    if (!CRON_SECRET || ключ !== CRON_SECRET) return res.status(401).json({ error: "unauthorized" });
    const сделано = await свести(db, набор).catch(() => 0);
    return res.status(200).json({ swept: сделано });
  }

  // Закрытие набравших порог кривых — тоже расписанием: ждать, пока
  // кто-то нажмёт кнопку, значит держать токен на кривой лишние часы.
  if (действие === "graduate") {
    const ключ = (req.headers.authorization || "").replace("Bearer ", "");
    if (!CRON_SECRET || ключ !== CRON_SECRET) return res.status(401).json({ error: "unauthorized" });
    const сделано = await закрытьКривые(db, набор).catch(() => 0);
    return res.status(200).json({ graduated: сделано });
  }

  try {
    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    let строка = await освежитьПривязку(db, await кошелёк(db, user, набор));
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;

    if (действие === "state") {
      res.setHeader("Cache-Control", "no-store");
      const [есть, выведено] = await Promise.all([баланс(строка.address), выведеноЗаСутки(db, user)]);
      return res.status(200).json({
        address: строка.address,
        sol: есть,
        payout: строка.payout_address || null,
        pending: строка.payout_pending || null,
        pendingAt: строка.payout_pending_at || null,
        sweepAbove: строка.sweep_above == null ? null : Number(строка.sweep_above),
        cap: ПОТОЛОК_ХРАНЕНИЯ,
        dailyLeft: Math.max(0, ЛИМИТ_В_СУТКИ - выведено),
        delayHours: ЗАДЕРЖКА_ПРИВЯЗКИ / 3600000,
      });
    }

    /* Курс обмена — до самой сделки.
       Показать «вы получите столько-то» иначе нечем: маршрут и выход
       считает биржа, и её же цифру человек увидит в подтверждении.
       Ничего не подписывает и ничего не тратит, поэтому GET. */
    if (действие === "quote") {
      const вход = String((req.query && req.query.input) || "").trim();
      const выход = String((req.query && req.query.output) || "").trim();
      const сумма = String((req.query && req.query.amount) || "").trim();
      if (!/^\d+$/.test(сумма) || сумма === "0") return res.status(400).json({ error: "bad_amount" });
      const кот = await котировка({
        input: вход, output: выход, amount: сумма,
        slippageBps: Number((req.query && req.query.slippage)) || 150,
      });
      res.setHeader("Cache-Control", "no-store");
      if (!кот) return res.status(200).json({ out: null });
      return res.status(200).json({
        out: кот.outAmount,
        impact: кот.priceImpactPct == null ? null : Number(кот.priceImpactPct),
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const ключЗапроса = String(тело.requestKey || "").slice(0, 64) || null;

    /* Шаг первый привязки: одноразовая строка, которую подпишет кошелёк.
       Она же — защита от того, чтобы подсунуть на подпись что-то другое
       и выдать это за разрешение на вывод. */
    if (действие === "payout-nonce") {
      const адрес = String(тело.address || "").trim();
      if (!адресОк(адрес)) return res.status(400).json({ error: "bad_address" });
      const вызов = crypto.randomBytes(12).toString("hex");
      await db.from("app_wallets")
        .update({ payout_nonce: вызов, payout_nonce_at: new Date().toISOString() })
        .eq("user_id", user.id);
      return res.status(200).json({ message: текстВызова(адрес, вызов) });
    }

    if (действие === "payout-set") {
      const адрес = String(тело.address || "").trim();
      const подпись = String(тело.signature || "").trim();
      if (!адресОк(адрес) || !подпись) return res.status(400).json({ error: "bad_request" });
      if (!строка.payout_nonce || !строка.payout_nonce_at) return res.status(400).json({ error: "no_challenge" });
      if (Date.now() - new Date(строка.payout_nonce_at).getTime() > ЖИЗНЬ_ВЫЗОВА) {
        return res.status(400).json({ error: "challenge_expired" });
      }

      const bs58 = (await import("bs58")).default;
      const годится = проверитьПодписьАдреса(текстВызова(адрес, строка.payout_nonce), подпись, адрес, bs58);
      if (!годится) return res.status(400).json({ error: "bad_signature" });

      // Первую привязку на пустом кошельке держать сутки незачем —
      // красть нечего. Во всех остальных случаях ждём.
      const есть = await баланс(строка.address);
      const сразу = !строка.payout_address && есть < 0.001;
      const поле = сразу
        ? { payout_address: адрес, payout_pending: null, payout_pending_at: null, payout_nonce: null }
        : { payout_pending: адрес, payout_pending_at: new Date().toISOString(), payout_nonce: null };
      await db.from("app_wallets").update(поле).eq("user_id", user.id);
      await db.from("wallet_ops").insert({ user_id: user.id, kind: "payout_bind", amount: 0, address: адрес, ip });

      if (!сразу) {
        await сообщить(db, user.id,
          `🔐 Запрошена смена адреса вывода на <code>${адрес}</code>.\n`
          + `Он заработает через сутки. Если это не вы — откройте кошелёк в приложении и отмените.`);
      }
      return res.status(200).json({ payout: сразу ? адрес : null, pending: сразу ? null : адрес });
    }

    if (действие === "payout-cancel") {
      await db.from("app_wallets")
        .update({ payout_pending: null, payout_pending_at: null })
        .eq("user_id", user.id);
      return res.status(200).json({ ok: true });
    }

    /* Порог автовывода. Ставится только когда есть куда выводить —
       иначе это настройка без последствий. */
    if (действие === "sweep-set") {
      const порог = тело.above == null ? null : Number(тело.above);
      if (порог != null && !(порог > 0)) return res.status(400).json({ error: "bad_amount" });
      if (порог != null && !строка.payout_address) return res.status(400).json({ error: "no_payout" });
      await db.from("app_wallets").update({ sweep_above: порог }).eq("user_id", user.id);
      return res.status(200).json({ sweepAbove: порог });
    }

    /* --- Действия, которые тратят монеты ---------------------------
       Все они устроены одинаково: сервер сам собирает транзакцию под
       адрес внутреннего кошелька, разбор проверяет её на потолок и
       программы, подпись ставится один раз. Байты из браузера сюда не
       приходят вовсе. */

    if (действие === "launch") {
      const имя = String(тело.name || "").trim();
      const тикер = String(тело.ticker || "").trim().toUpperCase();
      const взнос = Math.max(0, Number(тело.buySol) || 0);
      if (!имя || !тикер) return res.status(400).json({ error: "bad_request" });

      const оп = await начать(db, user, { дело: "launch", сумма: взнос, ключЗапроса, ip });
      if (оп.повтор) return res.status(200).json({ signature: оп.signature, repeat: true });

      const хост = req.headers["x-forwarded-host"] || req.headers.host || "";
      const собрано = await собратьЗапуск({
        wallet: строка.address,
        name: имя,
        symbol: тикер,
        base: хост ? `https://${хост}` : "",
        buySol: взнос,
      });
      // Взнос плюс аренда счетов токена и метаданных: дороже запуск не
      // бывает, а значит и уйти больше не может.
      const подпись = await подписатьИОтправить({
        db, user, строка, набор,
        base64: собрано.transaction, дело: "launch",
        максПеревода: (взнос + 0.03) * LAMPORTS,
      });
      await завершить(db, оп.id, подпись);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        ...собрано, transaction: undefined, signature: подпись, creatorWallet: строка.address,
      });
    }

    if (действие === "trade") {
      const продажа = !!тело.sell;
      const сумма = Math.max(0, Number(тело.amount) || 0);
      if (!адресОк(String(тело.mint || "")) || !(сумма > 0)) return res.status(400).json({ error: "bad_request" });

      /* Обещания создателя проверяются до денег, а не после: отказ
         должен приходить раньше, чем что-то ушло в сеть. */
      const запрет = await запретСделки(db, {
        mint: String(тело.mint), user, продажа,
        // Кошелёк заводится вместе с аккаунтом, а аккаунт — по Telegram:
        // раз строка есть, человек пришёл из приложения, а не мимо него.
        telegramПривязан: !!строка,
      });
      if (запрет) return res.status(403).json(запрет);

      const оп = await начать(db, user, { дело: "trade", сумма: продажа ? 0 : сумма, ключЗапроса, ip });
      if (оп.повтор) return res.status(200).json({ signature: оп.signature, repeat: true });

      const собрано = await собратьСделку({
        wallet: строка.address,
        mint: String(тело.mint),
        продажа,
        amount: сумма,
        minOut: тело.minOut,
      });
      const подпись = await подписатьИОтправить({
        db, user, строка, набор,
        base64: собрано.transaction, дело: "trade",
        // При продаже с кошелька уходит только аренда счёта и комиссия.
        максПеревода: (продажа ? 0.01 : сумма + 0.01) * LAMPORTS,
      });
      await завершить(db, оп.id, подпись);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ signature: подпись, curve: собрано.curve });
    }

    if (действие === "swap") {
      const вход = String(тело.input || "").trim();
      const выход = String(тело.output || "").trim();
      const сумма = String(тело.amount || "").trim();
      if (!адресОк(вход) || !адресОк(выход) || !/^\d+$/.test(сумма)) {
        return res.status(400).json({ error: "bad_request" });
      }
      const покупка = вход === SOL_MINT;
      const вSol = покупка ? Number(сумма) / LAMPORTS : 0;

      const оп = await начать(db, user, { дело: "swap", сумма: вSol, ключЗапроса, ip });
      if (оп.повтор) return res.status(200).json({ signature: оп.signature, repeat: true });

      const кот = await котировка({
        input: вход, output: выход, amount: сумма,
        slippageBps: Number(тело.slippage) || 150,
      });
      if (!кот) throw new Error("маршрут не найден");
      const собранная = await свопJupiter({ quote: кот, wallet: строка.address });
      if (!собранная) throw new Error("сделка не собралась");

      const подпись = await подписатьИОтправить({
        db, user, строка, набор,
        base64: собранная, дело: "swap",
        // При покупке уходит сама сумма (она же обёртывается в wSOL) и
        // аренда счетов; при продаже — только аренда с комиссией.
        максПеревода: (вSol + 0.02) * LAMPORTS,
      });
      await завершить(db, оп.id, подпись);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ signature: подпись, out: кот.outAmount });
    }

    if (действие === "withdraw") {
      if (!строка.payout_address) return res.status(400).json({ error: "no_payout" });
      const есть = await баланс(строка.address);
      const сумма = тело.all ? Math.max(0, есть - ЗАПАС_НА_КОМИССИЮ) : Number(тело.amount) || 0;
      if (!(сумма > 0) || сумма > есть) return res.status(400).json({ error: "bad_amount" });

      const выведено = await выведеноЗаСутки(db, user);
      if (выведено + сумма > ЛИМИТ_В_СУТКИ) {
        return res.status(400).json({ error: "daily_limit", left: Math.max(0, ЛИМИТ_В_СУТКИ - выведено) });
      }

      const оп = await начать(db, user, {
        дело: "withdraw", сумма, адрес: строка.payout_address, ключЗапроса, ip,
      });
      if (оп.повтор) return res.status(200).json({ signature: оп.signature, amount: сумма, repeat: true });

      const лямпорты = Math.floor(сумма * LAMPORTS);
      const base64 = await собратьВывод({
        откуда: строка.address, куда: строка.payout_address, лямпорты,
      });
      const подпись = await подписатьИОтправить({
        db, user, строка, набор, base64, дело: "withdraw", максПеревода: лямпорты,
      });
      await завершить(db, оп.id, подпись);
      await сообщить(db, user.id,
        `💸 Вывод ${сумма.toFixed(4)} SOL на <code>${строка.payout_address}</code>.`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ signature: подпись, amount: сумма });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    const код = (err && err.код) || 502;
    console.warn("[wallet-solana]", err && err.message);
    return res.status(код).json({ error: "failed", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
