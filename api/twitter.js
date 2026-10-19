/* Подтверждение аккаунта в X (бывшем твиттере).
 *
 * Зачем. Ссылку на X можно вписать любую — и вписывают: чужой известный
 * аккаунт под своим токеном стоит дороже любой рекламы. Поэтому ссылка
 * без доказательства ничего не значит, а доказательство здесь одно:
 * человек публикует у себя пост с одноразовым кодом, который знаем
 * только мы двое.
 *
 * Как проверяем без ключей. У X есть открытая ручка oEmbed: по адресу
 * поста она отдаёт автора и текст, и ей не нужны ни ключи, ни вход.
 * Сверяем две вещи — что автор тот, за кого себя выдают, и что в тексте
 * стоит наш код. Этого достаточно: чужой пост с нашим кодом опубликовать
 * нельзя, а свой — можно, и он и есть подпись.
 *
 * Чего здесь нет. Числа подписчиков: без платного доступа его негде
 * взять честно, а рисовать «популярность» на глаз — хуже, чем не
 * рисовать вовсе. Доверие даёт сам факт: аккаунт подтверждён, вот он,
 * перейди и посмотри.
 *
 * Таблица: profiles.x_handle, x_verified_at, x_code, x_code_at
 * (см. supabase_x.sql).
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* Настоящее подключение X, как у Phantom: одна кнопка «Подключить»
   сразу ведёт на сайт X, а не на ручной пост с кодом. Старый путь
   (лента без ключей) ниже остаётся как запасной для тех, у кого
   приложение X ещё не заведено (без X_CLIENT_ID кнопка недоступна).
   PKCE — потому что secret здесь лежит на сервере, а X требует его для
   confidential-клиента в любом случае; verifier добавляет второй слой,
   так что даже перехваченный code без него бесполезен. */
const X_CLIENT_ID = (process.env.X_CLIENT_ID || "").trim();
const X_CLIENT_SECRET = (process.env.X_CLIENT_SECRET || "").trim();
// Ровно этот адрес нужно внести в настройках приложения на
// developer.x.com — X сверяет redirect_uri дословно.
const X_REDIRECT_URI = (process.env.X_REDIRECT_URI || "https://api.mintly.company/api/twitter?action=callback").trim();
// Полчаса на туда-обратно с лишним запасом — потом строка мусор.
const ЖИЗНЬ_STATE_МС = 30 * 60 * 1000;

/* Открытый профиль X: аватар, баннер, имя, описание и цифры. Берём у
   fxtwitter — он отдаёт публичную страницу аккаунта без ключей и без
   лимита бесплатного X API (на нём users/me даётся считанные разы в
   сутки). Десять минут держим в памяти: профиль меняется редко. */
const кешПрофилейX = new Map();
async function профильX(handle) {
  const ключ = String(handle).toLowerCase();
  const было = кешПрофилейX.get(ключ);
  if (было && Date.now() - было.ts < 10 * 60 * 1000) return было.профиль;
  try {
    const r = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(handle)}`, { signal: AbortSignal.timeout(6000) });
    const j = r.ok ? await r.json() : null;
    const u = j && j.user;
    if (!u) return было ? было.профиль : null;
    const профиль = {
      name: u.name || handle,
      // Аватар в полном размере: «_normal» — это 48 точек.
      avatar: u.avatar_url ? String(u.avatar_url).replace("_normal.", "_400x400.") : null,
      banner: u.banner_url || null,
      description: u.description || "",
      location: u.location || "",
      website: (u.website && u.website.url) || null,
      followers: Number(u.followers) || 0,
      following: Number(u.following) || 0,
      tweets: Number(u.tweets) || 0,
      joined: u.joined || null,
      verified: !!(u.verification && u.verification.verified),
    };
    кешПрофилейX.set(ключ, { ts: Date.now(), профиль });
    return профиль;
  } catch {
    return было ? было.профиль : null;
  }
}

async function колбэкX(req, res, db) {
  const { code, state, error: xОтказ } = req.query || {};
  // Не через res.redirect — его здесь нет (см. дополнить() в
  // server/index.mjs, повторяющую только часть Vercel-обвязки).
  /* Не на сайт, а короткая страница «вернитесь в Telegram». X открыт во
     внешнем браузере, и сайт там — это сайт без входа: человек видел
     регистрацию и решал, что всё сломалось. Мини-приложение же осталось
     открытым в Telegram и само переспросит X, когда в него вернутся. */
  const назад = (статус, причина = "") => {
    const удача = статус === "ok";
    if (!удача) console.warn("[twitter] вход X не прошёл:", причина);
    // Причина — мелко внизу: по ней видно, на каком шаге сорвалось,
    // без доступа к журналу сервера.
    const подробно = String(причина || "").replace(/[<>&"]/g, "").slice(0, 160);
    const бот = String(process.env.TG_BOT || "MintlyAppbot").replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
    const заголовок = удача ? "Аккаунт X подключён" : "Не получилось подключить X";
    const текст = удача ? "Вернитесь в Telegram — аккаунт уже виден в Mintly." : "Вернитесь в Telegram и попробуйте ещё раз.";
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mintly</title><style>
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000;color:#F4F3EF;font-family:-apple-system,"Segoe UI",sans-serif;text-align:center;padding:0 24px}
h1{font-size:26px;margin:8px 0 0}p{color:#8D8B86;font-size:16px;margin:0;max-width:300px;line-height:1.45}
a{margin-top:18px;display:block;width:100%;max-width:320px;padding:16px 0;border-radius:16px;background:#F4F3EF;color:#0B0B0F;font-weight:700;font-size:16px;text-decoration:none}
.знак{font-size:46px;color:${удача ? "#2ED47A" : "#FF5C6C"}}</style></head><body>
<div class="знак">${удача ? "✓" : "✕"}</div><h1>${заголовок}</h1><p>${текст}</p>
<a href="tg://resolve?domain=${бот}">Вернуться в Telegram</a>
${удача || !подробно ? "" : `<p style="font-size:12px;color:#5E5D59;margin-top:10px">Причина: ${подробно}</p>`}
<script>setTimeout(function(){location.href="tg://resolve?domain=${бот}"},600)</script>
</body></html>`);
  };
  if (xОтказ) return назад("error", `X отказал: ${xОтказ}`);
  if (!code || !state) return назад("error", "X не вернул код входа");
  try {
    const { data: строка } = await db.from("x_oauth_state").select("*").eq("state", String(state)).maybeSingle();
    if (строка) await db.from("x_oauth_state").delete().eq("state", String(state));
    if (!строка) return назад("error", "запрос входа не найден — нажмите «Подключить» ещё раз");
    if (Date.now() - new Date(строка.created_at).getTime() > ЖИЗНЬ_STATE_МС) return назад("error", "запрос входа устарел");

    /* Обмен кода на токен. Приложение в X бывает двух видов: с секретом
       (Web App — X ждёт заголовок Basic) и публичное (Native App — без
       секрета, его заменяет PKCE). Раньше заголовок слался всегда, и без
       X_CLIENT_SECRET это был пустой Basic — X отвечал 401 «Missing valid
       authorization header». Теперь с секретом — Basic, а если X его не
       принял или секрета нет вовсе, — как публичное приложение. */
    const тело = () => new URLSearchParams({
      grant_type: "authorization_code", code: String(code), redirect_uri: X_REDIRECT_URI,
      code_verifier: строка.code_verifier, client_id: X_CLIENT_ID,
    });
    const обменять = (сСекретом) => fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(сСекретом ? { Authorization: `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64")}` } : {}),
      },
      body: тело(),
    });
    let токенОтвет = await обменять(!!X_CLIENT_SECRET);
    if (токенОтвет.status === 401 && X_CLIENT_SECRET) токенОтвет = await обменять(false);
    const токен = await токенОтвет.json().catch(() => null);
    if (!токенОтвет.ok || !токен || !токен.access_token) {
      return назад("error", `обмен кода: ${токенОтвет.status} ${(токен && (токен.error_description || токен.error)) || ""}`);
    }

    const профильОтвет = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${токен.access_token}` },
    });
    const профиль = await профильОтвет.json().catch(() => null);
    const handle = профиль && профиль.data && профиль.data.username;
    if (!профильОтвет.ok || !имяОк(handle)) {
      return назад("error", `профиль X: ${профильОтвет.status} ${(профиль && (профиль.title || профиль.detail)) || ""}`);
    }

    // Один аккаунт X — один профиль: у чужого его тут же снимаем, иначе
    // второй вход тем же X-аккаунтом остался бы недоступен навсегда.
    await db.from("profiles").update({ x_handle: null, x_verified_at: null }).ilike("x_handle", handle).neq("id", строка.user_id);
    const { error } = await db.from("profiles").update({
      x_handle: handle, x_verified_at: new Date().toISOString(), x_code: null, x_code_at: null,
    }).eq("id", строка.user_id);
    if (error) return назад("error", `база: ${error.message}`);
    return назад("ok");
  } catch (e) {
    return назад("error", `сбой: ${(e && e.message) || e}`);
  }
}

// Сколько живёт код. Полчаса — с запасом на «напишу пост попозже», но не
// настолько долго, чтобы код успел куда-то утечь и пригодиться.
const ЖИЗНЬ_КОДА_МС = 30 * 60 * 1000;

const БУКВЫ = "abcdefghijkmnpqrstuvwxyz23456789";

function новыйКод() {
  let s = "";
  for (let i = 0; i < 6; i++) s += БУКВЫ[Math.floor(Math.random() * БУКВЫ.length)];
  return `mintly-${s}`;
}

const имяОк = (s) => typeof s === "string" && /^[A-Za-z0-9_]{1,15}$/.test(s);

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

/* Адрес поста приводим к виду, который понимает oEmbed. Люди присылают
   что угодно: и x.com, и twitter.com, и со всякими ?s=20 на хвосте. */
function разобратьПост(строка) {
  const s = String(строка || "").trim();
  const m = s.match(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})/i);
  if (!m) return null;
  return { имя: m[1], id: m[2], url: `https://x.com/${m[1]}/status/${m[2]}` };
}

const текстБезРазметки = (html) => String(html || "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, " ")
  .toLowerCase();

async function oembed(url) {
  const стоп = new AbortController();
  const срок = setTimeout(() => стоп.abort(), 7000);
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?omit_script=1&hide_thread=1&url=${encodeURIComponent(url)}`,
      { signal: стоп.signal, headers: { accept: "application/json" }, redirect: "follow" },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(срок);
  }
}

/* Лента профиля без ключей.
 *
 * У X есть открытая страница для встраивания ленты — та самая, из
 * которой сайты делают виджет «последние твиты». Она отдаёт готовый JSON
 * внутри страницы, и в нём лежат последние сто постов с автором и
 * текстом. Ключей не просит, входа тоже.
 *
 * Ради неё всё и затевалось: человеку больше не нужно искать свой пост,
 * копировать его адрес и вставлять к нам. Он публикует пост и
 * возвращается — остальное делаем мы.
 */
async function лентаПрофиля(имя) {
  const стоп = new AbortController();
  const срок = setTimeout(() => стоп.abort(), 9000);
  try {
    const res = await fetch(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(имя)}`,
      {
        signal: стоп.signal,
        redirect: "follow",
        headers: {
          // Без внятного клиента страница отдаёт заглушку.
          "user-agent": "Mozilla/5.0 (compatible; MintlyBot/1.0)",
          accept: "text/html",
        },
      },
    );
    if (!res.ok) return null;
    const html = await res.text();
    const кусок = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!кусок) return null;
    const j = JSON.parse(кусок[1]);
    const записи = (j && j.props && j.props.pageProps && j.props.pageProps.timeline && j.props.pageProps.timeline.entries) || [];
    const посты = [];
    for (const з of записи) {
      const твит = з && з.content && з.content.tweet;
      if (!твит) continue;
      посты.push({
        автор: String((твит.user && твит.user.screen_name) || ""),
        текст: String(твит.full_text || твит.text || ""),
        id: String(твит.id_str || твит.id || ""),
      });
    }
    return посты;
  } catch {
    return null;
  } finally {
    clearTimeout(срок);
  }
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });
  const действие = String((req.query && req.query.action) || "");

  // Колбэк — переход по ссылке с самого X, не запрос из приложения:
  // своего входа при нём нет вовсе, кто есть кто узнаём по state.
  if (действие === "callback") return колбэкX(req, res, db);

  const user = await хозяин(req, db);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (действие === "start") {
      if (!X_CLIENT_ID) return res.status(503).json({ error: "x_oauth_disabled" });
      const state = crypto.randomBytes(16).toString("hex");
      const verifier = crypto.randomBytes(32).toString("base64url");
      const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
      const { error } = await db.from("x_oauth_state").insert({ state, user_id: user.id, code_verifier: verifier });
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      const параметры = new URLSearchParams({
        response_type: "code", client_id: X_CLIENT_ID, redirect_uri: X_REDIRECT_URI,
        scope: "users.read tweet.read", state, code_challenge: challenge, code_challenge_method: "S256",
      });
      return res.status(200).json({ url: `https://twitter.com/i/oauth2/authorize?${параметры}` });
    }

    if (действие === "state") {
      const { data } = await db.from("profiles").select("x_handle, x_verified_at").eq("id", user.id).maybeSingle();
      const handle = (data && data.x_handle) || null;
      return res.status(200).json({
        handle,
        verifiedAt: (data && data.x_verified_at) || null,
        profile: handle ? await профильX(handle) : null,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    if (действие === "code") {
      const код = новыйКод();
      const { error } = await db
        .from("profiles")
        .update({ x_code: код, x_code_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      return res.status(200).json({ code: код });
    }

    if (действие === "verify") {
      /* Два пути к одному и тому же. Обычный — по нику: человек назвал
         аккаунт, опубликовал пост, а найти его в ленте уже наша забота.
         Запасной — по ссылке на пост: он выручает, когда лента закрыта
         или X отдаёт её с задержкой. */
      const поНику = !тело.url && имяОк(String(тело.handle || "").replace(/^@/, ""));
      const пост = поНику ? null : разобратьПост(тело.url);
      if (!поНику && !пост) return res.status(400).json({ error: "bad_url" });

      const { data: строка } = await db
        .from("profiles")
        .select("x_code, x_code_at")
        .eq("id", user.id)
        .maybeSingle();
      const код = строка && строка.x_code;
      const когда = строка && строка.x_code_at ? new Date(строка.x_code_at).getTime() : 0;
      if (!код) return res.status(400).json({ error: "no_code" });
      if (Date.now() - когда > ЖИЗНЬ_КОДА_МС) return res.status(400).json({ error: "code_expired" });

      let авторИзОтвета = "";
      if (поНику) {
        const имя = String(тело.handle || "").replace(/^@/, "");
        const посты = await лентаПрофиля(имя);
        if (!посты) return res.status(502).json({ error: "x_silent" });
        /* Лента открылась, но она пуста. Чаще всего это опечатка в
           имени — у живого аккаунта постов хотя бы один есть, — реже
           закрытый профиль: его лента наружу не отдаётся вовсе. */
        if (!посты.length) return res.status(404).json({ error: "no_account" });
        const свой = посты.find((п) => п.автор.toLowerCase() === имя.toLowerCase()
          && п.текст.toLowerCase().includes(код.toLowerCase()));
        // Лента открылась, но поста с кодом в ней нет: либо ещё не
        // опубликован, либо X не успел его показать.
        if (!свой) return res.status(404).json({ error: "no_post_yet" });
        авторИзОтвета = свой.автор;
      } else {
        const ответ = await oembed(пост.url);
        if (!ответ || !ответ.author_url) return res.status(502).json({ error: "x_silent" });

        авторИзОтвета = String(ответ.author_url).split("/").filter(Boolean).pop() || "";
        if (!имяОк(авторИзОтвета)) return res.status(502).json({ error: "x_silent" });
        // Автор поста и есть подтверждаемый аккаунт: в адресе одно имя, в
        // ответе X — другое, значит прислали чужой пост.
        if (авторИзОтвета.toLowerCase() !== пост.имя.toLowerCase()) {
          return res.status(400).json({ error: "wrong_author" });
        }
        if (!текстБезРазметки(ответ.html).includes(код.toLowerCase())) {
          return res.status(400).json({ error: "no_code_in_post" });
        }
      }

      // Один аккаунт — один человек: иначе подтверждение теряет смысл,
      // достаточно было бы раз опубликовать пост и раздать его ссылку.
      const { data: занято } = await db
        .from("profiles")
        .select("id")
        .ilike("x_handle", авторИзОтвета)
        .neq("id", user.id)
        .maybeSingle();
      if (занято) return res.status(409).json({ error: "taken" });

      const { error } = await db
        .from("profiles")
        .update({
          x_handle: авторИзОтвета,
          x_verified_at: new Date().toISOString(),
          x_code: null,
          x_code_at: null,
        })
        .eq("id", user.id);
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      return res.status(200).json({ handle: авторИзОтвета });
    }

    if (действие === "unlink") {
      const { error } = await db
        .from("profiles")
        .update({ x_handle: null, x_verified_at: null, x_code: null, x_code_at: null })
        .eq("id", user.id);
      if (error) return res.status(500).json({ error: "db", detail: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    return res.status(500).json({ error: "internal", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
