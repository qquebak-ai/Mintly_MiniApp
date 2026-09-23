/* Бот уведомлений MintlyTrading — общая часть.
 *
 * Все уведомления приложения идут только этим ботом, и все отправители
 * (сделки по своим токенам, кошелёк, поддержка) ходят сюда: здесь одна
 * проверка «человек выключил уведомления» и одна кнопка «Открыть Mintly».
 *
 * Выключение хранится в метаданных пользователя Supabase (trading_mute):
 * отдельной таблицы для одного флага заводить незачем. Чтобы не спрашивать
 * базу на каждое письмо, ответ держим минуту в памяти.
 *
 * Переменные окружения: TRADING_BOT_TOKEN, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, TG_BOT, TG_APP.
 */

import { createClient } from "@supabase/supabase-js";

export const ТОКЕН_ТОРГОВОГО = (process.env.TRADING_BOT_TOKEN || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ОСНОВНОЙ_БОТ = String(process.env.TG_BOT || "MintlyAppbot").replace(/^@/, "").trim();
const ПРИЛОЖЕНИЕ = String(process.env.TG_APP || "Mintly").trim();
// Кнопка ведёт в приложение основного бота: мини-приложение, открытое
// из чужого бота, не прошло бы вход.
export const ССЫЛКА_ПРИЛОЖЕНИЯ = `https://t.me/${ОСНОВНОЙ_БОТ}/${ПРИЛОЖЕНИЕ}`;

let база = null;
export function служебнаяБаза() {
  if (!база && SUPABASE_URL && SERVICE_ROLE_KEY) {
    база = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return база;
}

export async function tgТорговый(метод, тело) {
  if (!ТОКЕН_ТОРГОВОГО) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${ТОКЕН_ТОРГОВОГО}/${метод}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(тело),
    });
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

// Профиль по Telegram и его метаданные — с минутной памятью.
const память = new Map(); // telegramId -> { ts, userId, мета }
export async function ктоВTelegram(telegramId, { свежо = false } = {}) {
  const ключ = String(telegramId);
  const было = память.get(ключ);
  if (!свежо && было && Date.now() - было.ts < 60000) return было;
  const db = служебнаяБаза();
  if (!db) return null;
  const { data } = await db.from("profiles").select("id").eq("telegram_id", telegramId).maybeSingle();
  if (!data || !data.id) return null;
  const { data: u } = await db.auth.admin.getUserById(data.id);
  const запись = { ts: Date.now(), userId: data.id, мета: (u && u.user && u.user.user_metadata) || {} };
  память.set(ключ, запись);
  return запись;
}

// Дописать метаданные человеку, не затирая остальные поля.
export async function отметить(telegramId, поля) {
  const db = служебнаяБаза();
  const кто = await ктоВTelegram(telegramId, { свежо: true });
  if (!db || !кто) return null;
  const мета = { ...кто.мета, ...поля };
  await db.auth.admin.updateUserById(кто.userId, { user_metadata: мета });
  память.set(String(telegramId), { ...кто, ts: Date.now(), мета });
  return мета;
}

/* Одно уведомление. Выключил — молчим; бот не запущен или заблокирован —
   Telegram откажет, и это нормальный исход, а не сбой. */
export async function уведомить(chatId, текст) {
  if (!ТОКЕН_ТОРГОВОГО || !chatId) return false;
  try {
    const кто = await ктоВTelegram(chatId);
    if (кто && кто.мета && кто.мета.trading_mute) return false;
  } catch { /* не узнали — лучше сказать, чем промолчать */ }
  const ответ = await tgТорговый("sendMessage", {
    chat_id: chatId,
    text: текст,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "Открыть Mintly", url: ССЫЛКА_ПРИЛОЖЕНИЯ }]] },
  });
  return !!(ответ && ответ.ok);
}
