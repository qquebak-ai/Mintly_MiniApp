/* Галочка «проверенное лицо» у X-аккаунта.
 *
 * Выдаёт её человек, а не робот: владелец X по желанию заполняет заявку
 * (имя, ссылка-подтверждение, комментарий), заявка уходит админам в бота
 * с кнопками «Выдать» и «Отказать». Админы — Telegram id из ADMIN_TG_IDS
 * через запятую. Выдать или снять можно и командой: /verify @ник,
 * /unverify @ник.
 *
 * Признак лежит в profiles.x_person_verified; браузер его не перепишет —
 * колонку держит триггер guard_profile_columns (supabase_x_verify.sql).
 * Заявки — в x_verification_requests.
 */
import { createClient } from "@supabase/supabase-js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export function админы() {
  return new Set(String(process.env.ADMIN_TG_IDS || "").split(/[\s,]+/).map((с) => с.trim()).filter((с) => /^\d+$/.test(с)));
}
export const этоАдмин = (tgId) => админы().has(String(tgId));

export function база() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export async function телеграм(метод, тело) {
  if (!BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${метод}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(тело || {}),
    });
    return await r.json();
  } catch { return null; }
}

const экран = (т) => String(т || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Новая заявка — каждому админу сообщение с кнопками. */
export async function разослатьЗаявку(заявка) {
  const текст = [
    "🪪 <b>Заявка на галочку проверенного лица</b>",
    "",
    `X: <a href="https://x.com/${экран(заявка.handle)}">@${экран(заявка.handle)}</a>`,
    `Имя: ${экран(заявка.full_name)}`,
    `Подтверждение: ${экран(заявка.proof_url)}`,
    заявка.note ? `Комментарий: ${экран(заявка.note)}` : null,
  ].filter((с) => с != null).join("\n");
  const кнопки = { inline_keyboard: [[
    { text: "✅ Выдать", callback_data: `xv:ok:${заявка.id}` },
    { text: "❌ Отказать", callback_data: `xv:no:${заявка.id}` },
  ]] };
  await Promise.all([...админы()].map((id) => телеграм("sendMessage", {
    chat_id: Number(id), text: текст, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: кнопки,
  })));
}

/* Выдать или снять по нику X. Возвращает, сколько профилей затронуто. */
export async function отметить(db, handle, да) {
  const { data, error } = await db.from("profiles")
    .update({ x_person_verified: !!да, x_person_verified_at: да ? new Date().toISOString() : null })
    .ilike("x_handle", String(handle).replace(/^@/, ""))
    .select("id, telegram_id");
  if (error) throw new Error(error.message);
  return data || [];
}

async function сообщитьВладельцу(профили, да) {
  const текст = да
    ? "✅ Галочка проверенного лица выдана — теперь она видна рядом с твоим X в Mintly."
    : "Заявку на галочку проверенного лица пока отклонили. Можно подать снова с другим подтверждением.";
  await Promise.all((профили || []).filter((п) => п.telegram_id).map((п) => телеграм("sendMessage", { chat_id: Number(п.telegram_id), text: текст })));
}

/* Кнопка под заявкой в боте. */
export async function кнопкаЗаявки(cb) {
  const [, решение, id] = String(cb.data || "").split(":");
  const ответ = (text) => телеграм("answerCallbackQuery", { callback_query_id: cb.id, text, show_alert: false });
  if (!этоАдмин(cb.from && cb.from.id)) return ответ("Только для админов");
  const db = база();
  const { data: заявка } = await db.from("x_verification_requests").select("*").eq("id", id).maybeSingle();
  if (!заявка) return ответ("Заявка не найдена");
  if (заявка.status !== "pending") return ответ(заявка.status === "approved" ? "Уже выдано" : "Уже отклонено");
  const да = решение === "ok";
  try {
    const профили = да ? await отметить(db, заявка.handle, true) : [];
    await db.from("x_verification_requests").update({ status: да ? "approved" : "rejected", decided_at: new Date().toISOString(), decided_by: String(cb.from.id) }).eq("id", id);
    if (!да) {
      const { data: владелец } = await db.from("profiles").select("id, telegram_id").eq("id", заявка.user_id).limit(1);
      await сообщитьВладельцу(владелец, false);
    } else await сообщитьВладельцу(профили, true);
  } catch (e) {
    return ответ(`Не получилось: ${String(e && e.message || e).slice(0, 150)}`);
  }
  if (cb.message) {
    await телеграм("editMessageReplyMarkup", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [[{ text: да ? "✅ Выдано" : "❌ Отклонено", callback_data: "xv:done" }]] } });
  }
  return ответ(да ? "Галочка выдана" : "Отклонено");
}

/* /verify @ник и /unverify @ник — без заявки, сразу. */
export async function командаАдмина(message, да, хвост) {
  const chat = message.chat.id;
  if (!этоАдмин(message.from && message.from.id)) return телеграм("sendMessage", { chat_id: chat, text: "Команда только для админов." });
  const handle = String(хвост || "").trim().replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "").split(/[/?\s]/)[0];
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return телеграм("sendMessage", { chat_id: chat, text: `Напиши так: /${да ? "verify" : "unverify"} @ник_в_X` });
  try {
    const профили = await отметить(база(), handle, да);
    if (!профили.length) return телеграм("sendMessage", { chat_id: chat, text: `@${handle} не привязан ни к одному аккаунту Mintly.` });
    if (да) await сообщитьВладельцу(профили, true);
    return телеграм("sendMessage", { chat_id: chat, text: да ? `✅ @${handle}: галочка выдана.` : `@${handle}: галочка снята.` });
  } catch (e) {
    return телеграм("sendMessage", { chat_id: chat, text: `Не получилось: ${String(e && e.message || e).slice(0, 200)}` });
  }
}
