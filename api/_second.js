/* Второй ключ на сервере — подтверждение почтой перед выводом.
 *
 * Раньше сервер верил полю amr в токене: «otp не старше пятнадцати
 * минут». Только Supabase пишет туда otp при ЛЮБОМ входе одноразовой
 * ссылкой — а так входят все: Telegram, виджет на сайте, X, Phantom.
 * Свежий вход через Telegram проходил «второй ключ» сам, без письма, и
 * с ним же триггер базы разрешал выключить подтверждение почтой.
 *
 * Теперь код с почты проверяет сам сервер (api/second-key.js) и выдаёт
 * короткий билет, подписанный своим секретом. Вывод и смена адреса
 * вывода проходят только с этим билетом в заголовке X-Second-Key — если
 * у человека есть настоящая почта (или включена защита почтой). Билет
 * живёт пятнадцать минут и годится только своему владельцу.
 */

import crypto from "node:crypto";

const ЖИЗНЬ_БИЛЕТА_С = 15 * 60;
// Повторный показ фразы и подобное — только из входа не старше этого.
const СВЕЖИЙ_ВХОД_С = 30 * 60;

function секрет() {
  return String(process.env.SECOND_KEY_SECRET || process.env.APP_WALLET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
}

function подпись(строка) {
  return crypto.createHmac("sha256", секрет()).update(`mintly-second:${строка}`).digest("base64url");
}

export function выдатьБилет(userId) {
  const до = Math.floor(Date.now() / 1000) + ЖИЗНЬ_БИЛЕТА_С;
  const тело = `${userId}.${до}`;
  return { ticket: `${тело}.${подпись(тело)}`, expiresAt: до };
}

function билетГоден(req, userId) {
  if (!секрет()) return false;
  const сырой = String((req.headers && (req.headers["x-second-key"] || req.headers["X-Second-Key"])) || "").trim();
  const части = сырой.split(".");
  if (части.length !== 3) return false;
  const [кто, до, присланная] = части;
  if (кто !== String(userId)) return false;
  if (!(Number(до) > Math.floor(Date.now() / 1000))) return false;
  const своя = Buffer.from(подпись(`${кто}.${до}`));
  const чужая = Buffer.from(присланная);
  return своя.length === чужая.length && crypto.timingSafeEqual(своя, чужая);
}

// Технические адреса вида tg<id>@telegram.local — не почта: писем на
// них не бывает, и требовать оттуда код нельзя.
export function настоящаяПочта(user) {
  const м = String((user && user.email) || "");
  return !!м && !/\.local$/i.test(м) && !!(user && user.email_confirmed_at) ? м : "";
}

function содержимоеТокена(req) {
  const заголовок = String((req.headers && req.headers.authorization) || "");
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  const часть = токен.split(".")[1];
  if (!часть) return null;
  try {
    return JSON.parse(Buffer.from(часть.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/* Вход свежий, если самый поздний способ входа в токене моложе
   получаса. Подпись токена здесь не проверяется — её уже проверил
   getUser(); при обновлении сессии amr переносится со старым временем,
   поэтому украденный токен обновления свежим входом не станет. */
export function свежийВход(req, сек = СВЕЖИЙ_ВХОД_С) {
  const т = содержимоеТокена(req);
  const сейчас = Math.floor(Date.now() / 1000);
  const последний = Array.isArray(т && т.amr)
    ? Math.max(0, ...т.amr.map((з) => Number(з && з.timestamp) || 0))
    : 0;
  return последний > 0 && сейчас - последний <= сек;
}

/* null — можно; иначе код отказа для ответа. */
export async function нуженВторойКлюч(req, db, user) {
  const почта = настоящаяПочта(user);
  let включена = false;
  try {
    const { data } = await db.from("profiles").select("mail_2fa").eq("id", user.id).maybeSingle();
    включена = !!(data && data.mail_2fa);
  } catch { /* колонки может не быть — решаем по почте */ }
  // Ни почты, ни защиты: второго ключа у человека нет, и закрывать ему
  // вывод нечем подтвердить.
  if (!почта && !включена) return null;
  // Защита включена, а настоящей почты нет: код слать некуда. Пускаем
  // только из свежего входа — это всё, что можно спросить.
  if (!почта) return свежийВход(req) ? null : "need_fresh_login";
  return билетГоден(req, user.id) ? null : "need_2fa";
}
