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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });
  const действие = String((req.query && req.query.action) || "");

  const user = await хозяин(req, db);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (действие === "state") {
      const { data } = await db.from("profiles").select("x_handle, x_verified_at").eq("id", user.id).maybeSingle();
      return res.status(200).json({
        handle: (data && data.x_handle) || null,
        verifiedAt: (data && data.x_verified_at) || null,
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
      const пост = разобратьПост(тело.url);
      if (!пост) return res.status(400).json({ error: "bad_url" });

      const { data: строка } = await db
        .from("profiles")
        .select("x_code, x_code_at")
        .eq("id", user.id)
        .maybeSingle();
      const код = строка && строка.x_code;
      const когда = строка && строка.x_code_at ? new Date(строка.x_code_at).getTime() : 0;
      if (!код) return res.status(400).json({ error: "no_code" });
      if (Date.now() - когда > ЖИЗНЬ_КОДА_МС) return res.status(400).json({ error: "code_expired" });

      const ответ = await oembed(пост.url);
      if (!ответ || !ответ.author_url) return res.status(502).json({ error: "x_silent" });

      const авторИзОтвета = String(ответ.author_url).split("/").filter(Boolean).pop() || "";
      if (!имяОк(авторИзОтвета)) return res.status(502).json({ error: "x_silent" });
      // Автор поста и есть подтверждаемый аккаунт: в адресе одно имя, в
      // ответе X — другое, значит прислали чужой пост.
      if (авторИзОтвета.toLowerCase() !== пост.имя.toLowerCase()) {
        return res.status(400).json({ error: "wrong_author" });
      }
      if (!текстБезРазметки(ответ.html).includes(код.toLowerCase())) {
        return res.status(400).json({ error: "no_code_in_post" });
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
