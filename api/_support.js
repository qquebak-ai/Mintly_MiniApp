/* Общая часть поддержки. Вопросы принимает только приложение
 * (api/support.js); бот носит обратную половину — ответы команды.
 *
 * Файл начинается с подчёркивания, поэтому Vercel не делает из него
 * отдельный адрес: это библиотека, а не обработчик.
 *
 * Переменные окружения (Vercel → Project Settings → Environment
 * Variables), все серверные, без префикса VITE_:
 *   TELEGRAM_BOT_TOKEN        — токен бота из @BotFather
 *   SUPABASE_URL              — тот же адрес, что и во VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role ключ проекта Supabase
 *   SUPPORT_CHAT_ID           — куда складывать вопросы: чат команды
 *                               (узнать его id — команда /id в этом чате)
 *   APP_URL                   — адрес приложения для кнопки в ответе
 */

import { createClient } from "@supabase/supabase-js";

export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
/* Номер служебного чата.
 *
 * У супергрупп он отрицательный и начинается со «100…»: -1004453921574.
 * Минус теряется при копировании постоянно — а Telegram на такой номер
 * отвечает сухим «chat not found», ничего не поясняя, и виновника ищут
 * часами. Положительным числом вида 100xxxxxxxxx чат быть не может: у
 * людей номера короче и без этой приставки, поэтому знак возвращаем
 * сами. */
export function normalizeChatId(raw) {
  const v = String(raw == null ? "" : raw).trim();
  return /^100\d{9,}$/.test(v) ? `-${v}` : v;
}

export const SUPPORT_CHAT_ID = normalizeChatId(process.env.SUPPORT_CHAT_ID);
export const APP_URL = process.env.APP_URL || "https://mintly.company";

// Пределы для одного человека. Не про защиту базы, а про живого
// сотрудника на том конце: без них один расстроенный человек за минуту
// накидает сотню строк, и в чате команды потеряются все остальные.
export const MAX_LEN = 2000;
export const MIN_GAP_MS = 12000;
export const DAY_LIMIT = 40;

export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function tgCall(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json().catch(() => ({ ok: false }));
}

// Когда ответ не нужен: сбой доставки не должен ронять обработчик.
export async function tg(method, body) {
  try { return await tgCall(method, body); } catch (err) {
    console.warn("[support] telegram call failed:", method, err && err.message);
    return { ok: false };
  }
}

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Принять вопрос от человека.
 *
 * Вход один — раздел поддержки в приложении. Записать в базу и
 * переслать команде порознь нельзя: сообщение, попавшее только в базу,
 * никто не прочитает, а попавшее только в чат — не покажется человеку в
 * приложении, и он напишет второй раз.
 *
 * Возвращает { ok } либо { ok: false, error } с кодом, который вызывающая
 * сторона переводит в понятный текст. */
export async function acceptQuestion(admin, { profile, body }) {
  const text = String(body || "").trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > MAX_LEN) return { ok: false, error: "too_long" };

  // Частота считается по базе, а не по памяти обработчика: он живёт
  // ровно один запрос, и любой счётчик внутри него обнуляется сам собой.
  const сутки = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: свежие } = await admin
    .from("support_messages")
    .select("created_at")
    .eq("user_id", profile.id)
    .eq("from_admin", false)
    .gte("created_at", сутки)
    .order("created_at", { ascending: false });

  const было = свежие || [];
  if (было.length >= DAY_LIMIT) return { ok: false, error: "too_many" };
  if (было.length && Date.now() - new Date(было[0].created_at).getTime() < MIN_GAP_MS) {
    return { ok: false, error: "too_fast" };
  }

  const { data: сообщение, error } = await admin
    .from("support_messages")
    .insert({ user_id: profile.id, from_admin: false, body: text })
    .select("id, body, from_admin, created_at")
    .single();
  if (error) return { ok: false, error: "store_failed", detail: error.message };

  const доставка = await forwardToTeam(admin, { profile, text, first: было.length === 0 });
  if (!доставка.ok) {
    // Вопрос, которого никто не прочитает, хуже неотправленного: человек
    // будет ждать ответа, а его никто не увидит. Убираем запись — тогда
    // «попробуй ещё раз» действительно имеет смысл, а не плодит копии.
    await admin.from("support_messages").delete().eq("id", сообщение.id);
    return { ok: false, error: "undelivered", detail: доставка.detail };
  }
  return { ok: true, message: сообщение };
}

/* Переслать вопрос в служебный чат и запомнить, кому отвечать.
 *
 * Шапка нужна не для красоты: отвечающий видит ник, ссылку на человека в
 * Telegram и внутренний id — этого хватает, чтобы найти профиль, не
 * переспрашивая. */
async function forwardToTeam(admin, { profile, text, first }) {
  if (!SUPPORT_CHAT_ID) {
    console.error("[support] SUPPORT_CHAT_ID не задан — вопросы отправлять некуда");
    return { ok: false, detail: "SUPPORT_CHAT_ID не задан" };
  }
  const кто = esc(profile.nickname || "без ника");
  const ссылка = profile.telegram_id
    ? `<a href="tg://user?id=${profile.telegram_id}">написать напрямую</a>`
    : "";
  // Источник у вопросов теперь один: раздел поддержки в приложении. В
  // переписке с ботом их не принимают — там вопрос не к чему привязать.
  const шапка = `🆘 <b>${кто}</b>${first ? " · первое обращение" : ""}\n<code>${esc(profile.id)}</code>${ссылка ? ` · ${ссылка}` : ""}`;

  const ответ = await tg("sendMessage", {
    chat_id: SUPPORT_CHAT_ID,
    text: `${шапка}\n\n${esc(text)}\n\n<i>Ответить — реплаем на это сообщение.</i>`,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  const id = ответ && ответ.result && ответ.result.message_id;
  if (!id) {
    // Причину Telegram пишет словами — она и нужна тому, кто настраивает:
    // «chat not found» и «not enough rights» лечатся по-разному.
    const причина = (ответ && (ответ.description || ответ.error)) || "Telegram не принял сообщение";
    console.error("[support] вопрос не доставлен в чат команды:", причина);
    return { ok: false, detail: причина };
  }
  // Метка живёт вместе с сообщением в чате: реплай по нему и приведёт
  // обратно к нужной переписке.
  await admin
    .from("support_relay")
    .upsert({ admin_message_id: id, user_id: profile.id }, { onConflict: "admin_message_id" });
  return { ok: true };
}

/* Ответ команды человеку: в базу — чтобы был виден в приложении, и в
 * личку — чтобы дошёл, пока приложение закрыто. */
export async function deliverAnswer(admin, { userId, telegramId, text, adminName }) {
  const чистый = String(text || "").trim().slice(0, MAX_LEN);
  if (!чистый) return { ok: false, error: "empty" };

  const { error } = await admin.from("support_messages").insert({
    user_id: userId,
    from_admin: true,
    body: чистый,
    admin_name: adminName || null,
  });
  if (error) return { ok: false, error: "store_failed", detail: error.message };

  // Ответ человеку — уведомление, а они идут только ботом MintlyTrading.
  let доставлено = false;
  if (telegramId) {
    const { уведомить } = await import("./_trading.js");
    доставлено = await уведомить(telegramId, `💬 <b>Поддержка Mintly</b>\n\n${esc(чистый)}`, "support");
  }
  // Недоставленная личка — не сбой: человек мог не начинать диалог с
  // ботом или заблокировать его. В приложении ответ он всё равно увидит.
  return { ok: true, delivered: доставлено };
}
