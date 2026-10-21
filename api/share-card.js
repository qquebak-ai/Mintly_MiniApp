/* Отправка карточки токена в Telegram.
 *
 * Кнопка «Отправить» в приложении должна класть в чат саму картинку с
 * кнопкой «Открыть токен», а не голую ссылку. Для этого у мини-приложений
 * есть shareMessage: бот заранее сохраняет готовое сообщение
 * (savePreparedInlineMessage), а приложение показывает выбор чата. Здесь
 * — первая половина: картинка уходит в хранилище, бот сохраняет
 * сообщение и отдаёт его id.
 *
 * Ссылка в кнопке — только на свой бот: чужой адрес под видом «Открыть
 * токен» отсюда не уйдёт.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_BOT = String(process.env.TG_BOT || "MintlyAppbot").replace(/^@/, "").trim();

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function подписьHTML(текст) {
  const html = текст.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return html.replace(/^Ca: (\S+)$/m, "Ca: <code>$1</code>");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const db = admin();
  if (!db || !BOT_TOKEN) return res.status(503).json({ error: "not_configured" });

  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return res.status(401).json({ error: "unauthorized" });
  const { data: вход } = await db.auth.getUser(токен);
  const user = вход && вход.user;
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const ссылка = String(тело.link || "");
  const подпись = String(тело.caption || "").slice(0, 300);
  const картинка = String(тело.image || "").replace(/^data:image\/jpeg;base64,/, "");
  if (!new RegExp(`^https://t\\.me/${TG_BOT}(/|\\?|$)`, "i").test(ссылка)) return res.status(400).json({ error: "bad_link" });
  if (!картинка || картинка.length > 1_300_000) return res.status(400).json({ error: "bad_image" });

  // Кому сохранить сообщение — Telegram-аккаунту владельца профиля.
  const { data: профиль } = await db.from("profiles").select("telegram_id").eq("id", user.id).maybeSingle();
  const tgId = профиль && Number(профиль.telegram_id);
  if (!tgId) return res.status(400).json({ error: "no_telegram" });

  const путь = `${user.id}/share-${Date.now()}.jpg`;
  const { error: ошибкаЗагрузки } = await db.storage.from("token-assets")
    .upload(путь, Buffer.from(картинка, "base64"), { contentType: "image/jpeg", upsert: false });
  if (ошибкаЗагрузки) return res.status(500).json({ error: "upload_failed" });
  const { data: pub } = db.storage.from("token-assets").getPublicUrl(путь);
  const адрес = pub && pub.publicUrl;

  const ответ = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/savePreparedInlineMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: tgId,
      result: {
        type: "photo",
        id: `share-${Date.now()}`,
        photo_url: адрес,
        thumbnail_url: адрес,
        // Адрес в строке «Ca:» — моноширинным: в Telegram он копируется
        // одним нажатием.
        caption: подпись ? подписьHTML(подпись) : undefined,
        parse_mode: подпись ? "HTML" : undefined,
        reply_markup: { inline_keyboard: [[{ text: "📈 Открыть токен", url: ссылка }]] },
      },
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    }),
  }).then((r) => r.json()).catch(() => null);

  if (!ответ || !ответ.ok || !ответ.result || !ответ.result.id) {
    return res.status(502).json({ error: "telegram_failed", detail: ответ && ответ.description });
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ id: ответ.result.id });
}
