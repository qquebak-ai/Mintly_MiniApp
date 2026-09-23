/* Бот MintlyTrading — только уведомления.
 *
 * Писать человеку Telegram разрешает лишь после того, как тот сам нажал
 * «Старт» у бота. Поэтому здесь одно дело: принять /start, поздороваться
 * и отметить в аккаунте, что уведомления подключены, — приложение по
 * этой отметке перестаёт просить подключить бота.
 *
 *   POST /api/trading-bot                — вебхук Telegram
 *   POST /api/trading-bot?action=setup   — завести вебхук (с DEPLOY_SECRET)
 *
 * Переменные окружения: TRADING_BOT_TOKEN, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, DEPLOY_SECRET.
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ТОКЕН = (process.env.TRADING_BOT_TOKEN || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const СЕКРЕТ_ВЫКЛАДКИ = process.env.DEPLOY_SECRET || "";
// Секрет вебхука выводим из токена: отдельная переменная не нужна, а
// чужой, не знающий токена, прислать поддельное обновление не сможет.
const СЕКРЕТ_ВЕБХУКА = ТОКЕН ? crypto.createHash("sha256").update(`mintly-trading:${ТОКЕН}`).digest("hex").slice(0, 48) : "";

async function телеграм(метод, тело) {
  const r = await fetch(`https://api.telegram.org/bot${ТОКЕН}/${метод}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(тело),
  });
  return r.json().catch(() => null);
}

/* Отметка «бот подключён» — в метаданных пользователя Supabase: новой
   колонки в базе для этого заводить не нужно. */
async function отметить(telegramId) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await db.from("profiles").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!data || !data.id) return;
  const { data: u } = await db.auth.admin.getUserById(data.id);
  const мета = (u && u.user && u.user.user_metadata) || {};
  await db.auth.admin.updateUserById(data.id, { user_metadata: { ...мета, trading_bot: true } });
}

export default async function handler(req, res) {
  if (!ТОКЕН) return res.status(503).json({ error: "no_trading_bot_token" });
  const действие = String((req.query && req.query.action) || "");

  if (действие === "setup") {
    const данный = String((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "").trim();
    if (!СЕКРЕТ_ВЫКЛАДКИ || данный !== СЕКРЕТ_ВЫКЛАДКИ) return res.status(401).json({ error: "bad_secret" });
    const хост = req.headers["x-forwarded-host"] || req.headers.host || "api.mintly.company";
    const ответ = await телеграм("setWebhook", {
      url: `https://${хост}/api/trading-bot`,
      secret_token: СЕКРЕТ_ВЕБХУКА,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    await телеграм("setMyDescription", {
      description: "Уведомления Mintly: сделки по твоим токенам, выход на биржу, пополнения и выводы кошелька.",
    });
    await телеграм("setMyShortDescription", { short_description: "Уведомления о твоих токенах и кошельке Mintly" });
    return res.status(200).json(ответ || { ok: false });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (String(req.headers["x-telegram-bot-api-secret-token"] || "") !== СЕКРЕТ_ВЕБХУКА) {
    return res.status(401).json({ error: "bad_secret" });
  }

  const обновление = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const сообщение = обновление.message;
  const текст = String((сообщение && сообщение.text) || "");
  const кто = сообщение && сообщение.from && сообщение.from.id;
  // Отвечаем Telegram сразу: ему нужен только быстрый 200.
  res.status(200).json({ ok: true });
  if (!кто || !текст.startsWith("/start")) return;

  const ru = String((сообщение.from.language_code || "ru")).startsWith("ru");
  await телеграм("sendMessage", {
    chat_id: кто,
    parse_mode: "HTML",
    text: ru
      ? "🔔 <b>Уведомления Mintly подключены</b>\n\nСюда будут приходить сделки по твоим токенам, выход на биржу, пополнения и выводы кошелька."
      : "🔔 <b>Mintly notifications are on</b>\n\nTrades on your tokens, listings, deposits and withdrawals will show up here.",
  }).catch(() => {});
  await отметить(кто).catch(() => {});
}
