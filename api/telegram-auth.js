// Вход в аккаунт через Telegram — серверная часть.
//
// Мини-приложение присылает сюда строку initData, которую Telegram
// подписывает ключом бота. Проверить эту подпись можно только зная токен
// бота, поэтому проверка живёт на сервере: браузеру токен не отдаётся, а
// подделать initData без него нельзя. Если подпись сходится, мы находим
// (или заводим) пользователя в Supabase по его telegram_id и возвращаем
// одноразовый токен, которым клиент открывает обычную сессию Supabase.
//
// Нужные переменные окружения (Vercel → Project Settings → Environment
// Variables), все три — серверные, без префикса VITE_:
//   TELEGRAM_BOT_TOKEN        — токен бота из @BotFather
//   SUPABASE_URL              — тот же URL, что и во VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY — service_role ключ проекта Supabase
//
// service_role ключ обходит RLS, поэтому он должен быть только здесь и
// никогда не попадать в клиентский код.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import nacl from "tweetnacl";
import bs58 from "bs58";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* Окно, в течение которого initData считается свежей.
 *
 * Час здесь не работал. Строку Telegram выдаёт один раз — при запуске
 * мини-приложения, — и пока оно висит свёрнутым, она не обновляется:
 * человек открыл приложение утром, вернулся к нему днём и получал отказ
 * «invalid_init_data» на совершенно честной подписи (в журнале —
 * stale_init_data на пять с лишним часов). Сутки — то же окно, что
 * Telegram советует в своём примере проверки: утёкшая строка остаётся
 * годной дольше, но вход при этом работает у всех, а не у тех, кто
 * только что запустил приложение. */
const MAX_AUTH_AGE_SEC = 24 * 60 * 60;

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

/* Проверка подписи по документации Telegram: собираем строку из всех
   полей кроме hash (отсортированных по имени), считаем HMAC-SHA256 с
   ключом, который сам получен как HMAC от токена бота, и сверяем с
   присланным hash. Возвращает { user } либо { reason } — по причине
   видно, что именно не сошлось: не тот токен бота, протухшая строка или
   мусор вместо initData. Сам токен наружу, разумеется, не уходит. */
function verifyInitData(initData) {
  if (typeof initData !== "string" || !initData) return { reason: "empty_init_data" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { reason: "no_hash" };
  params.delete("hash");

  const dataCheckString = [...params.keys()]
    .sort()
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hash, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    // Подпись не сошлась — почти всегда это чужой или испорченный
    // TELEGRAM_BOT_TOKEN.
    return { reason: "bad_signature" };
  }

  const authDate = Number(params.get("auth_date") || 0);
  const ageSec = authDate ? Math.floor(Date.now() / 1000) - authDate : null;
  if (!authDate) return { reason: "no_auth_date" };
  if (ageSec > MAX_AUTH_AGE_SEC) return { reason: `stale_init_data (${ageSec}s)` };

  try {
    const user = JSON.parse(params.get("user") || "null");
    if (!user || !user.id) return { reason: "no_user" };
    return { user };
  } catch (err) {
    return { reason: "bad_user_json" };
  }
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
// предлагает: имя из профиля Telegram досталось бы человеку без его
// участия, а поменять его потом нельзя. Правило то же, что и в
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

// Больше строка initData не бывает: подпись, пользователь и служебные
// поля укладываются в пару килобайт. Всё, что длиннее, разбирать незачем.
const MAX_INIT_DATA_LEN = 4096;

// Кто пригласил. В ссылке приглашения после startapp= стоит ref_<id>,
// Telegram передаёт это в start_param. Значение приходит от клиента, то
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

// Метка, оставленная ботом. Ссылку часто открывают не приложением, а
// чатом с ботом — переслали, ткнули с компьютера, нажали «Start». Тогда
// метка достаётся боту (api/telegram-bot.js), он кладёт её сюда, и
// приложение забирает при первом же входе. Метка одноразовая: забрали —
// стёрли, иначе она сработала бы ещё раз после удаления аккаунта.
async function pendingInviter(admin, telegramId, userId) {
  const { data } = await admin
    .from("pending_referrals")
    .select("inviter")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (!data || !data.inviter || data.inviter === userId) return null;
  const { data: inviter } = await admin.from("profiles").select("id").eq("id", data.inviter).maybeSingle();
  return inviter ? data.inviter : null;
}

async function dropPendingInviter(admin, telegramId) {
  const { error } = await admin.from("pending_referrals").delete().eq("telegram_id", telegramId);
  if (error) console.warn("[auth] failed to drop pending referral:", error.message);
}

// Приглашение, закреплённое за телеграм-аккаунтом навсегда. Живёт
// отдельно от профиля и переживает его удаление — иначе приглашения
// накручивались бы в одно действие: удалил аккаунт, прошёл по ссылке
// заново, завёл профиль, и счётчик пригласившего вырос ещё раз.
async function claimedInviter(admin, telegramId) {
  const { data } = await admin
    .from("referral_claims")
    .select("inviter")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return (data && data.inviter) || null;
}

// Закрепляем при первом же засчитанном приглашении. Повторная запись
// молча отбрасывается: первый пригласивший остаётся навсегда.
async function claimInviter(admin, telegramId, inviter) {
  const { error } = await admin
    .from("referral_claims")
    .upsert({ telegram_id: telegramId, inviter }, { onConflict: "telegram_id", ignoreDuplicates: true });
  if (error) console.warn("[auth] failed to claim referral:", error.message);
}

/* Кто пригласил. Порядок важен:
   1. Уже закреплённый за этим телеграмом — он старше любой новой ссылки.
      Заодно возвращает связь тому, кто удалил аккаунт и завёл заново:
      пригласивший у него будет прежний, а не тот, чью ссылку он открыл
      во второй раз.
   2. Метка прямой ссылки на приложение.
   3. Отложенная метка от бота.
   Найденного в пунктах 2–3 сразу закрепляем.
   Отсутствие таблиц не должно ронять вход — тогда работает то, что есть. */
async function resolveInviter(admin, startParam, telegramId, userId) {
  try {
    const claimed = await claimedInviter(admin, telegramId);
    if (claimed) return claimed === userId ? null : claimed;
  } catch (err) {
    console.warn("[auth] referral claims unavailable:", err && err.message);
  }

  let found = await validInviter(admin, startParam, userId);
  if (!found) {
    try {
      found = await pendingInviter(admin, telegramId, userId);
    } catch (err) {
      console.warn("[auth] pending referrals unavailable:", err && err.message);
    }
  }
  if (found) {
    try { await claimInviter(admin, telegramId, found); } catch (err) {
      console.warn("[auth] referral claims unavailable:", err && err.message);
    }
  }
  return found;
}

export default async function handler(req, res) {
  // Вход не только через Telegram: здесь же живут Phantom и заведение
  // профиля после Google или почты. Отдельным файлом их не сделать —
  // на бесплатном тарифе Vercel двенадцать обработчиков, и тринадцатый
  // молча не разворачивается.
  const действие = String((req.query && req.query.action) || "").trim();
  if (действие === "nonce") return выдатьNonce(req, res);
  if (действие === "phantom") return входФантомом(req, res);
  if (действие === "profile") return завестиПрофиль(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (rateLimited(clientKey(req))) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "too_many_requests" });
  }
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "server_not_configured" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (err) {
    return fail(res, 400, "bad_body", err && err.message);
  }
  if (typeof body.initData !== "string" || body.initData.length > MAX_INIT_DATA_LEN) {
    return fail(res, 400, "bad_init_data", "missing or oversized initData");
  }
  const checked = verifyInitData(body.initData);
  if (!checked.user) {
    /* Протухшая подпись — единственная причина, по которой человек может
       что-то сделать сам: приложение надо закрыть целиком и открыть
       заново, тогда Telegram выдаст свежую строку. Поэтому у неё свой
       код — приложению есть что сказать, кроме «попробуй ещё раз». */
    const протухла = String(checked.reason || "").startsWith("stale_init_data");
    return fail(res, 401, протухла ? "stale_init_data" : "invalid_init_data", checked.reason);
  }
  const tgUser = checked.user;
  // Отдельный счётчик на самого пользователя: подпись у него настоящая,
  // но повторять вход сотнями раз в минуту незачем.
  if (rateLimited(`tg:${tgUser.id}`)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "too_many_requests" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Технический адрес: Supabase требует email у пользователя, но письма
  // на него не уходят — вход идёт только по подписи Telegram.
  const email = `tg${tgUser.id}@telegram.local`;

  // Разведка перед входом: приложение спрашивает, заводится ли аккаунт
  // впервые. Если да — на экране входа появляется пустое поле ника, и
  // человек придумывает имя сам. Ничего не создаём и не меняем: только
  // смотрим, есть ли профиль с этим telegram_id.
  if (body.probe === true) {
    const { data: existing, error: probeErr } = await admin
      .from("profiles")
      .select("id")
      .eq("telegram_id", tgUser.id)
      .maybeSingle();
    if (probeErr) return fail(res, 500, "probe_failed", probeErr.message);
    return res.status(200).json({ exists: !!existing });
  }

  // Только привязать приглашение. Нужно тому, кто уже вошёл и открыл
  // приложение по чужой ссылке: входить ему незачем, сессия есть, а
  // метка из ссылки иначе никуда бы не ушла — раньше её отправлял только
  // вход, и приглашение засчитывалось лишь тем, кто заходил впервые.
  // Ничего не создаём: находим профиль по telegram_id из подписанных
  // данных и ставим связь, если её ещё нет.
  if (body.linkReferralOnly === true) {
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("id, invited_by")
      .eq("telegram_id", tgUser.id)
      .maybeSingle();
    if (profErr) return fail(res, 500, "link_lookup_failed", profErr.message);
    if (!prof || prof.invited_by != null) return res.status(200).json({ linked: false });
    const invitedBy = await resolveInviter(admin, body.startParam, tgUser.id, prof.id);
    if (!invitedBy) return res.status(200).json({ linked: false });
    const { error: linkErr } = await admin
      .from("profiles")
      .update({ invited_by: invitedBy })
      .eq("id", prof.id)
      .is("invited_by", null);
    if (linkErr) return fail(res, 500, "link_referral_failed", linkErr.message);
    await dropPendingInviter(admin, tgUser.id);
    return res.status(200).json({ linked: true });
  }

  try {
    // Первый вход — заводим пользователя. Если он уже есть, Supabase
    // ответит ошибкой «already registered», и это нормальный путь.
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        telegram_id: tgUser.id,
        nickname: wantedNickname(body) || "",
        bio: "",
        avatar_url: tgUser.photo_url || null,
        emoji: tgUser.photo_url ? null : "🚀",
        wallet_address: null,
      },
    });
    if (createErr && !/already|exists|registered/i.test(createErr.message || "")) {
      return fail(res, 500, "create_user_failed", createErr.message);
    }

    // generateLink и создаёт одноразовый токен входа, и возвращает самого
    // пользователя — так мы узнаём его id, не перебирая список.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link?.properties?.hashed_token || !link?.user?.id) {
      return fail(res, 500, "link_failed", linkErr && linkErr.message);
    }

    const userId = link.user.id;

    // Адрес вида tg<id>@telegram.local предсказуем: зная чей-то
    // telegram_id, на него можно было зарегистрироваться заранее обычной
    // почтой с паролем — и тогда владелец, впервые войдя через Telegram,
    // попадал бы в чужой, уже подконтрольный аккаунт. Поэтому вход
    // разрешаем только если у найденного пользователя действительно
    // стоит привязка к этому telegram_id (её ставим здесь же при
    // создании) либо если профиль привязан к нему в базе.
    const boundId = link.user.user_metadata && link.user.user_metadata.telegram_id;
    if (boundId != null && String(boundId) !== String(tgUser.id)) {
      return fail(res, 409, "account_conflict", `metadata telegram_id ${boundId} != ${tgUser.id}`);
    }

    // Профиль заводим только если его ещё нет: при повторном входе нельзя
    // затирать никнейм, описание и аватарку, которые человек поменял сам.
    const { data: profile } = await admin.from("profiles").select("id, telegram_id, invited_by").eq("id", userId).maybeSingle();
    if (profile && profile.telegram_id != null && String(profile.telegram_id) !== String(tgUser.id)) {
      return fail(res, 409, "account_conflict", `profile telegram_id ${profile.telegram_id} != ${tgUser.id}`);
    }
    if (boundId == null && profile && profile.telegram_id == null) {
      // Пользователь с таким адресом есть, но ни в метаданных, ни в
      // профиле привязки нет — значит его завели не мы. Молча
      // «доклеивать» её к чужой записи нельзя: это и есть захват.
      return fail(res, 409, "account_conflict", "existing account without telegram binding");
    }
    if (!profile) {
      // Ник обязателен и берётся только с экрана входа. Своего варианта
      // сервер не придумывает: имя выбирается один раз на всю жизнь
      // аккаунта, и назначать его за человека нельзя. Занятый не
      // подменяем тихим «leo_a4f1» — он только что его напечатал и должен
      // узнать, что имя не досталось.
      const nickname = wantedNickname(body);
      if (!nickname) return res.status(400).json({ error: "nickname_required" });
      if (await nicknameTaken(admin, nickname)) {
        return res.status(409).json({ error: "nickname_taken" });
      }

      // Приглашение засчитывается только при первом входе и только если
      // пригласивший действительно есть в базе. Сам себя пригласить
      // нельзя, переписать связь позже — тоже: здесь она ставится один
      // раз и больше не трогается.
      const invitedBy = await resolveInviter(admin, body.startParam, tgUser.id, userId);

      const { error: insertErr } = await admin.from("profiles").upsert({
        id: userId,
        telegram_id: tgUser.id,
        nickname,
        email,
        bio: "",
        avatar_url: tgUser.photo_url || null,
        emoji: tgUser.photo_url ? null : "🚀",
        invited_by: invitedBy,
      }, { onConflict: "id" });
      if (insertErr) {
        // Между проверкой и записью ник мог занять кто-то другой: тогда
        // падает уникальный ключ, и это не сбой сервера, а «имя ушло».
        if (/duplicate|unique|nickname/i.test(insertErr.message || "")) {
          return res.status(409).json({ error: "nickname_taken" });
        }
        return fail(res, 500, "profile_failed", insertErr.message);
      }
      // Метка одноразовая: сработала — убираем, иначе она досталась бы и
      // следующему аккаунту с этим же телеграмом.
      if (invitedBy) await dropPendingInviter(admin, tgUser.id);
    } else if (profile.invited_by == null) {
      // Профиль уже был, но пригласившего у него нет. Засчитываем — иначе
      // ссылка работала бы только для тех, кто вообще ни разу не заходил,
      // а это почти никто. Связь ставится один раз за всю жизнь аккаунта:
      // ниже стоит условие «ещё пусто», и переписать её нельзя.
      const invitedBy = await resolveInviter(admin, body.startParam, tgUser.id, userId);
      if (invitedBy) {
        const { error: linkRefErr } = await admin
          .from("profiles")
          .update({ invited_by: invitedBy })
          .eq("id", userId)
          .is("invited_by", null);
        if (linkRefErr) console.warn("[auth] failed to link referral:", linkRefErr.message);
        else await dropPendingInviter(admin, tgUser.id);
      }
    }

    return res.status(200).json({ token_hash: link.properties.hashed_token });
  } catch (err) {
    return fail(res, 500, "unexpected", err && err.message);
  }
}


/* ------------------------------------------------------------------
   ВХОД БЕЗ TELEGRAM

   На сайте Telegram нет, а войти надо. Способов три:

   • Google и почта — обычный Supabase Auth, он делает всё сам; серверу
     остаётся завести профиль с ником, потому что таблица profiles
     закрыта политиками и писать в неё может только service_role.

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

/* Профиль после входа через Google, почту или Phantom. Клиент под своей
   сессией сказать «заведи мне профиль» не может: таблица закрыта
   политиками, и пишет в неё только service_role. Поэтому — сюда, с
   токеном сессии в заголовке. */
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
  if (await nicknameTaken(admin, nickname)) return res.status(409).json({ error: "nickname_taken" });

  const мета = кто.user.user_metadata || {};
  const { error: insertErr } = await admin.from("profiles").upsert({
    id: userId,
    nickname,
    email: кто.user.email || null,
    bio: "",
    avatar_url: мета.avatar_url || мета.picture || null,
    emoji: мета.avatar_url || мета.picture ? null : "🚀",
    wallet_address: мета.wallet_address || null,
  }, { onConflict: "id" });
  if (insertErr) {
    if (/duplicate|unique|nickname/i.test(insertErr.message || "")) {
      return res.status(409).json({ error: "nickname_taken" });
    }
    return fail(res, 500, "profile_failed", insertErr.message);
  }
  return res.status(200).json({ created: true, nickname });
}
