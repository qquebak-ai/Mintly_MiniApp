/* Второй ключ на сервере — подтверждение почтой перед выводом.
 *
 * Раньше код с почты спрашивало только приложение: тот, кто получил
 * чужую сессию, звал /withdraw напрямую и обходил проверку целиком.
 * Теперь её делает сервер. Подтверждение кодом Supabase выдаёт новую
 * сессию, и в её токене (поле amr) записан способ входа «otp» со
 * временем. Если у человека включена почта для 2ФА, вывод и смена
 * адреса вывода проходят только с токеном, где такое подтверждение было
 * не раньше чем ПОДТВЕРЖДЕНИЕ_СВЕЖЕЕ_С назад.
 *
 * Подпись токена здесь не проверяется — её уже проверил getUser() до
 * этого; здесь только читается содержимое.
 */

const ПОДТВЕРЖДЕНИЕ_СВЕЖЕЕ_С = 15 * 60;

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

/* null — можно; иначе код отказа для ответа. */
export async function нуженВторойКлюч(req, db, user) {
  const { data } = await db.from("profiles").select("mail_2fa").eq("id", user.id).maybeSingle();
  if (!data || !data.mail_2fa) return null;
  const т = содержимоеТокена(req);
  const сейчас = Math.floor(Date.now() / 1000);
  const свежий = Array.isArray(т && т.amr) && т.amr.some((з) => з && з.method === "otp"
    && Number(з.timestamp) > 0 && сейчас - Number(з.timestamp) <= ПОДТВЕРЖДЕНИЕ_СВЕЖЕЕ_С);
  return свежий ? null : "need_2fa";
}
