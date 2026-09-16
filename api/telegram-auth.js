// Вход в аккаунт — серверная часть.
//
// Аккаунт заводится почтой: письмо с кодом присылает сам Supabase Auth, а
// сюда клиент приходит уже с сессией — за профилем. Профиль создаётся
// только здесь, потому что таблица profiles закрыта политиками и писать в
// неё может лишь service_role, и здесь же заново проверяется возраст:
// форма в браузере ничего не гарантирует.
//
// Вход через Telegram убран. Он открывал аккаунт по подписи initData, то
// есть в обход и почты, и проверки возраста — оставить его значило бы
// оставить чёрный ход.
//
// Нужные переменные окружения (все серверные, без префикса VITE_):
//   SUPABASE_URL              — тот же URL, что и во VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY — service_role ключ проекта Supabase
//
// service_role ключ обходит RLS, поэтому он должен быть только здесь и
// никогда не попадать в клиентский код.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Подробности ошибки уходят в ответ только когда это явно включено
// переменной окружения. По умолчанию наружу идёт лишь код: сообщения
// Supabase и внутренние причины — это разведданные для чужого, а
// «bad_signature (bot token len 46)» и вовсе рассказывал о длине
// секрета.
const EXPOSE_DETAIL = process.env.AUTH_DEBUG === "1";
function fail(res, status, error, detail) {
  if (detail) console.error(`[telegram-auth] ${error}:`, detail);
  return res.status(status).json(EXPOSE_DETAIL && detail ? { error, detail: String(detail) } : { error });
}

// Занят ли ник. Сравнение без учёта регистра: два «Leo» и «leo» рядом
// путали бы людей сильнее, чем отказ при регистрации.
async function nicknameTaken(admin, nickname) {
  // Подчёркивание — подстановочный знак ILIKE, а в никнеймах оно
  // разрешено: без экранирования «user_1» совпадал бы с «userA1».
  const pattern = nickname.replace(/[%_\\]/g, "\\$&");
  const { data } = await admin.from("profiles").select("nickname").ilike("nickname", pattern).maybeSingle();
  return !!data;
}

// Ник, выбранный человеком на экране входа. Своего варианта сервер не
// предлагает: имя выбирается один раз на всю жизнь аккаунта, и назначать
// его за человека нельзя. Правило то же, что и в
// приложении: латиница, цифры, точка и подчёркивание, 2–20 знаков,
// первая буква. Проверяем и здесь — форма в браузере ничего не гарантирует.
const NICKNAME_RE = /^[A-Za-z][A-Za-z0-9_.]{1,19}$/;
function wantedNickname(body) {
  const raw = typeof body.nickname === "string" ? body.nickname.trim() : "";
  return NICKNAME_RE.test(raw) ? raw : null;
}

// Простое ограничение частоты. Каждый вызов ходит в админский API
// Supabase и способен завести пользователя, поэтому дверь не должна быть
// бесконечной. Память общая на экземпляр функции: при нескольких
// экземплярах предел мягче номинального, но поток запросов с одного
// адреса всё равно упирается в потолок.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 20;
const rateHits = new Map(); // ключ -> массив меток времени

function rateLimited(key) {
  const now = Date.now();
  const hits = (rateHits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  rateHits.set(key, hits);
  // Подчищаем чужие протухшие записи, иначе карта растёт без предела.
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) rateHits.delete(k);
    }
  }
  return hits.length > RATE_MAX;
}

function clientKey(req) {
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : String(fwd || "")).split(",")[0].trim();
  return ip || req.socket?.remoteAddress || "unknown";
}

// Кто пригласил. В ссылке приглашения стоит ref_<id> — в start_param у
// мини-приложения или в ?ref= у сайта. Значение приходит от клиента, то
// есть подделать его может кто угодно — поэтому оно только читается как
// подсказка: id обязан быть настоящим uuid, чужим (не самим собой) и
// существующим, а записывается связь единожды, при создании профиля.
const REF_PREFIX = "ref_";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Пригласивший из ссылки: он должен существовать и не быть самим
// приглашённым. Чужой или выдуманный идентификатор просто отбрасываем.
async function validInviter(admin, startParam, userId) {
  const invitedBy = inviterFromStartParam(startParam);
  if (!invitedBy || invitedBy === userId) return null;
  const { data: inviter } = await admin.from("profiles").select("id").eq("id", invitedBy).maybeSingle();
  return inviter ? invitedBy : null;
}

function inviterFromStartParam(startParam) {
  if (typeof startParam !== "string" || !startParam.startsWith(REF_PREFIX)) return null;
  const id = startParam.slice(REF_PREFIX.length).trim();
  return UUID_RE.test(id) ? id : null;
}

export default async function handler(req, res) {
  /* Три действия в одном файле: одноразовая строка для Phantom, вход
     Phantom-ом и заведение профиля. Отдельными файлами их не сделать — на
     бесплатном тарифе Vercel двенадцать обработчиков, и тринадцатый молча
     не разворачивается. */
  const действие = String((req.query && req.query.action) || "").trim();
  if (действие === "nonce") return выдатьNonce(req, res);
  if (действие === "phantom") return входФантомом(req, res);
  if (действие === "profile") return завестиПрофиль(req, res);

  /* Вход по подписи Telegram жил здесь и убран: он заводил аккаунт в обход
     почты и проверки возраста. Отвечаем 410, а не 404 — у кого-то могло
     остаться открытым старое приложение, и «этого больше нет» понятнее,
     чем «не найдено». */
  return res.status(410).json({ error: "telegram_auth_removed" });
}

/* ------------------------------------------------------------------
   ВХОД

   • Почта и Google — обычный Supabase Auth, он делает всё сам; серверу
     остаётся завести профиль с ником и датой рождения, потому что
     таблица profiles закрыта политиками и писать в неё может только
     service_role.

   • Phantom — вход подписью кошелька. Сервер выдаёт одноразовую строку,
     кошелёк её подписывает, сервер проверяет подпись и открывает сессию.
     Пароля здесь нет вовсе: ключ от аккаунта — сам кошелёк.
------------------------------------------------------------------- */

// Строка для подписи живёт минуту: этого хватает дойти до кошелька и
// вернуться, а перехваченная позже уже ничего не открывает.
const NONCE_TTL_SEC = 60;

/* Одноразовая строка не хранится в базе: она подписана самим сервером.
   Проверить её можно тем же ключом, а подделать — нет. */
function подписатьNonce(nonce, exp) {
  return crypto.createHmac("sha256", SERVICE_ROLE_KEY).update(`${nonce}.${exp}`).digest("hex").slice(0, 32);
}

function выдатьNonce(req, res) {
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: "server_not_configured" });
  const nonce = crypto.randomBytes(18).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + NONCE_TTL_SEC;
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    nonce, exp, sig: подписатьNonce(nonce, exp),
    // Текст видит человек в окне кошелька — по нему он и решает, стоит
    // ли подписывать. «Случайные байты» подписывают не глядя, а это
    // ровно то, чем пользуются мошенники.
    message: `Mintly: вход в аккаунт\nОдноразовый код: ${nonce}\nДействителен минуту.`,
  });
}

async function входФантомом(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: "server_not_configured" });
  if (rateLimited(clientKey(req))) return res.status(429).json({ error: "too_many_requests" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (err) {
    return fail(res, 400, "bad_body", err && err.message);
  }

  const адрес = String(body.address || "").trim();
  const nonce = String(body.nonce || "").trim();
  const exp = Number(body.exp) || 0;
  const sig = String(body.sig || "").trim();
  const подпись = String(body.signature || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(адрес)) return fail(res, 400, "bad_address");
  if (!nonce || !подпись) return fail(res, 400, "bad_request");
  if (exp < Math.floor(Date.now() / 1000)) return fail(res, 400, "nonce_expired");
  if (подписатьNonce(nonce, exp) !== sig) return fail(res, 400, "bad_nonce");

  // Подпись проверяется по тому же тексту, что человек видел в кошельке.
  const текст = `Mintly: вход в аккаунт\nОдноразовый код: ${nonce}\nДействителен минуту.`;
  let сходится = false;
  try {
    сходится = nacl.sign.detached.verify(
      new TextEncoder().encode(текст),
      bs58.decode(подпись),
      bs58.decode(адрес),
    );
  } catch (err) {
    return fail(res, 400, "bad_signature", err && err.message);
  }
  if (!сходится) return fail(res, 401, "bad_signature");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = `sol${адрес.toLowerCase()}@phantom.local`;

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { wallet_address: адрес, nickname: "", bio: "", emoji: "🚀" },
  });
  if (createErr && !/already|exists|registered/i.test(createErr.message || "")) {
    return fail(res, 500, "create_user_failed", createErr.message);
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link?.properties?.hashed_token) {
    return fail(res, 500, "link_failed", linkErr && linkErr.message);
  }

  // Адрес вида sol<ключ>@phantom.local предсказуем, поэтому пускаем
  // только если у найденного пользователя действительно стоит этот
  // кошелёк: иначе на такой адрес можно было бы зарегистрироваться
  // заранее обычной почтой и ждать владельца.
  const привязан = link.user && link.user.user_metadata && link.user.user_metadata.wallet_address;
  if (привязан && String(привязан) !== адрес) return fail(res, 409, "account_conflict");

  return res.status(200).json({ token_hash: link.properties.hashed_token, address: адрес });
}

/* Сколько лет по дате рождения. По календарю, а не делением дней на 365:
   в день восемнадцатилетия вход уже открыт, и сутки ошибки здесь — это
   отказ живому человеку. Возвращает null, если дата бессмысленная. */
const ДАТА_RE = /^\d{4}-\d{2}-\d{2}$/;
function летСРождения(строка) {
  const с = String(строка || "").slice(0, 10);
  if (!ДАТА_RE.test(с)) return null;
  const д = new Date(`${с}T00:00:00Z`);
  if (Number.isNaN(д.getTime())) return null;
  const сейчас = new Date();
  let лет = сейчас.getUTCFullYear() - д.getUTCFullYear();
  const мес = сейчас.getUTCMonth() - д.getUTCMonth();
  if (мес < 0 || (мес === 0 && сейчас.getUTCDate() < д.getUTCDate())) лет -= 1;
  // Из будущего и «полтора века» — это опечатка, а не возраст.
  if (лет < 0 || лет > 120) return null;
  return лет;
}

const ВЗРОСЛЫЙ_С = 18;

/* Профиль после входа по почте (или через Google и Phantom). Клиент под
   своей сессией сказать «заведи мне профиль» не может: таблица закрыта
   политиками, и пишет в неё только service_role. Поэтому — сюда, с
   токеном сессии в заголовке.

   Здесь же проверяется возраст: форма в браузере ничего не гарантирует, а
   пускать младше восемнадцати туда, где торгуют на деньги, нельзя. */
async function завестиПрофиль(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return res.status(500).json({ error: "server_not_configured" });
  if (rateLimited(clientKey(req))) return res.status(429).json({ error: "too_many_requests" });

  const заголовок = String(req.headers.authorization || "");
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  if (!токен) return res.status(401).json({ error: "no_session" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (err) {
    return fail(res, 400, "bad_body", err && err.message);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: кто, error: ктоErr } = await admin.auth.getUser(токен);
  if (ктоErr || !кто || !кто.user) return res.status(401).json({ error: "bad_session" });
  const userId = кто.user.id;

  const { data: есть } = await admin.from("profiles").select("id, nickname").eq("id", userId).maybeSingle();
  if (есть) return res.status(200).json({ created: false, nickname: есть.nickname });

  const nickname = wantedNickname(body);
  if (!nickname) return res.status(400).json({ error: "nickname_required" });

  /* Возраст. Профиля ещё нет, значит аккаунт заводится сейчас — и если
     человеку меньше восемнадцати, не заводится вовсе: пользователя из
     auth удаляем, чтобы за отказом не оставалась живая сессия, которой
     можно дойти до кошелька. */
  const лет = летСРождения(body.birthDate);
  if (лет == null) return res.status(400).json({ error: "birth_date_required" });
  if (лет < ВЗРОСЛЫЙ_С) {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) console.warn("[auth] не удалось убрать несовершеннолетнего:", delErr.message);
    return res.status(403).json({ error: "too_young" });
  }

  if (await nicknameTaken(admin, nickname)) return res.status(409).json({ error: "nickname_taken" });

  // Кто пригласил — метка из ссылки. Доверять ей нельзя: проверяем, что
  // такой человек есть и что это не сам приглашённый.
  const invitedBy = await validInviter(admin, body.startParam, userId);

  const мета = кто.user.user_metadata || {};
  const { error: insertErr } = await admin.from("profiles").upsert({
    id: userId,
    nickname,
    email: кто.user.email || null,
    bio: "",
    avatar_url: мета.avatar_url || мета.picture || null,
    emoji: мета.avatar_url || мета.picture ? null : "🚀",
    wallet_address: мета.wallet_address || null,
    invited_by: invitedBy,
  }, { onConflict: "id" });
  if (insertErr) {
    if (/duplicate|unique|nickname/i.test(insertErr.message || "")) {
      return res.status(409).json({ error: "nickname_taken" });
    }
    return fail(res, 500, "profile_failed", insertErr.message);
  }

  /* Дата рождения — в отдельную таблицу: профили читают все, а она
     чужих глаз не касается. Профиль уже создан, и падать из-за неё
     нельзя: человек внутри, а отсутствие строки значит лишь «возраст
     подтверждён не был». */
  const { error: датаErr } = await admin
    .from("profile_birth")
    .upsert({ id: userId, birth_date: String(body.birthDate).slice(0, 10) }, { onConflict: "id" });
  if (датаErr) console.warn("[auth] не записалась дата рождения:", датаErr.message);

  return res.status(200).json({ created: true, nickname });
}
