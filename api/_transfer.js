/* Переводы между людьми Mintly — по нику.
 *
 * Друга знают по нику, а не по адресу кошелька, и адрес из сорока восьми
 * знаков — верный способ ошибиться одной буквой и потерять деньги.
 * Перевод по нику идёт той же дорогой, что и вывод (api/wallet-*.js,
 * action=withdraw): та же подпись сервером, тот же второй ключ, тот же
 * предел за сутки — только адрес получателя сервер берёт сам, из
 * кошелька человека в приложении. В журнал ложатся две строки: «перевод»
 * у отправителя и «получено» у получателя, — по ним история показывает
 * ник, а не адрес.
 */

// Правило ника то же, что при входе (api/telegram-auth.js).
export const НИК = /^[A-Za-z][A-Za-z0-9_.]{3,19}$/;

const экранировать = (с) => String(с).replace(/[%_\\]/g, "\\$&");

/* Человек по нику. Ник неизменяем и уникален без учёта регистра
   (supabase_nickname_lock.sql), поэтому ищем ilike без подстановок. */
export async function человекПоНику(db, ник) {
  const чистый = String(ник || "").trim().replace(/^@/, "");
  if (!НИК.test(чистый)) return null;
  const { data } = await db.from("profiles").select("id, nickname, avatar_url").ilike("nickname", экранировать(чистый)).limit(2);
  // Двух совпадений быть не может; если всё же есть — не угадываем.
  return data && data.length === 1 ? data[0] : null;
}

export async function человекПоИд(db, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return null;
  const { data } = await db.from("profiles").select("id, nickname, avatar_url").eq("id", id).maybeSingle();
  return data && data.nickname ? data : null;
}

/* Поиск по нику — не перебор базы: сорок вопросов в минуту хватает
   любому, кто ищет друга, а словарный перебор упирается в предел. */
const поиски = new Map(); // user_id -> [метки]
export function поискРазрешён(userId) {
  const сейчас = Date.now();
  const было = (поиски.get(userId) || []).filter((м) => сейчас - м < 60_000);
  if (было.length >= 40) return false;
  было.push(сейчас);
  поиски.set(userId, было);
  if (поиски.size > 5000) поиски.clear();
  return true;
}

/* Строка «получено» у получателя. Ключ запроса — тот же, что кладёт
   наблюдатель EVM за пополнением (api/_evmWatch.js): кто бы ни успел
   первым, строка одна, а вид у неё — перевод от человека. */
export async function записатьПолучение(db, { получатель, сеть, сумма, откуда, подпись, ключ }) {
  const строка = {
    user_id: получатель, chain: сеть, kind: "transfer_in", amount: сумма,
    address: откуда, signature: подпись || null, request_key: String(ключ).slice(0, 64),
  };
  const { error } = await db.from("wallet_ops").insert(строка);
  if (error) {
    await db.from("wallet_ops").update({ kind: "transfer_in", address: откуда })
      .eq("user_id", получатель).eq("request_key", строка.request_key).then(() => {}, () => {});
  }
}

export async function сообщитьПолучателю(db, получатель, { отКого, сумма, монета }) {
  try {
    const { data } = await db.from("profiles").select("telegram_id").eq("id", получатель).maybeSingle();
    if (!data || !data.telegram_id) return;
    const { уведомить } = await import("./_trading.js");
    const число = Number(сумма) >= 1 ? Number(сумма).toFixed(2) : String(Number(Number(сумма).toPrecision(3)));
    await уведомить(data.telegram_id, `💸 <b>@${отКого}</b> прислал ${число} ${монета}`, "wallet");
  } catch { /* бот молчит — перевод всё равно дошёл */ }
}
