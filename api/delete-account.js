/* Удаление аккаунта — целиком, вместе с учётной записью.
 *
 * Из браузера стереть можно только свои строки в таблицах, и то по
 * разрешениям: сама учётная запись в auth.users анонимному ключу не
 * доступна. Она и оставалась после «удалить аккаунт» — человек уходил,
 * веря, что его нет, а в базе висели и запись, и почта, и телеграм-id, по
 * которым вход узнавал его снова.
 *
 * Поэтому удаляет сервер своим ключом: сначала всё, что человек нажил
 * (кошельки, сделки, комментарии, приглашения, аватарки), потом саму
 * учётную запись. Внешние ключи в базе стоят с каскадом, и один
 * deleteUser убрал бы почти всё сам, — но «почти» здесь мало: таблица без
 * каскада промолчит, а строки останутся. Поэтому перечисляем явно.
 *
 * Кто удаляет — решает не тело запроса, а токен сессии в заголовке:
 * подставить чужой id в json может кто угодно, подделать подписанный
 * токен — нет.
 *
 * Переменные окружения (серверные, без префикса VITE_):
 *   SUPABASE_URL              — тот же адрес, что и во VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role ключ проекта Supabase
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* Что удаляем и какой колонкой оно держится за человека.
 *
 * Порядок сверху вниз: сначала листья, потом то, на что они ссылаются, —
 * иначе внешний ключ не даст убрать строку, за которую ещё кто-то
 * держится. Токены идут перед профилем, потому что комментарии и чат
 * висят на токенах.
 *
 * Отсутствующая таблица — не беда: часть SQL мог быть ещё не выполнен, а
 * удалению это не мешает. Такой отказ пропускаем, остальные копим и
 * отдаём в ответе. */
const СВОЁ = [
  ["wallet_ops", "user_id"],
  ["treasury_swaps", "user_id"],
  ["trades", "user_id"],
  ["token_comments", "user_id"],
  ["token_chat", "user_id"],
  ["holder_notify", "user_id"],
  ["achievements_done", "user_id"],
  ["address_book", "owner_id"],
  ["referral_payout", "user_id"],
  ["referral_claims", "inviter"],
  ["pending_referrals", "inviter"],
  ["support_relay", "user_id"],
  ["support_messages", "user_id"],
  ["app_seeds", "user_id"],
  ["app_wallets", "user_id"],
  ["tokens", "owner_id"],
  ["profiles", "id"],
];

// Нет такой таблицы или колонки — база отвечает этими кодами. Для нас
// это «удалять нечего», а не поломка.
const НЕТ_ТАБЛИЦЫ = new Set(["42P01", "42703", "PGRST205", "PGRST204"]);

async function убратьКартинки(admin, id) {
  // Аватарки и логотипы лежат в папке с именем человека. Складов два:
  // куда попала картинка, зависит от того, какой из них был доступен в
  // тот день (см. загрузку логотипа в приложении).
  for (const склад of ["avatars", "token-assets"]) {
    try {
      const { data, error } = await admin.storage.from(склад).list(id, { limit: 1000 });
      if (error || !data || !data.length) continue;
      await admin.storage.from(склад).remove(data.map((ф) => `${id}/${ф.name}`));
    } catch {
      // Склада может не быть вовсе — тогда и убирать нечего.
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "server_not_configured" });
  }

  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  if (!токен) return res.status(401).json({ error: "no_session" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: сессия, error: authErr } = await admin.auth.getUser(токен);
  const человек = сессия && сессия.user;
  if (authErr || !человек) return res.status(401).json({ error: "bad_session" });
  const id = человек.id;

  const беды = [];
  for (const [таблица, колонка] of СВОЁ) {
    const { error } = await admin.from(таблица).delete().eq(колонка, id);
    if (error && !НЕТ_ТАБЛИЦЫ.has(error.code)) {
      console.error(`[delete-account] ${таблица}.${колонка}:`, error.message);
      беды.push(`${таблица}: ${error.message}`);
    }
  }
  // Подписки держатся двумя концами — и тем, и другим.
  for (const колонка of ["follower_id", "following_id"]) {
    const { error } = await admin.from("follows").delete().eq(колонка, id);
    if (error && !НЕТ_ТАБЛИЦЫ.has(error.code)) беды.push(`follows: ${error.message}`);
  }
  // Кого он привёл — остаётся с ними, но без ссылки на него.
  await admin.from("profiles").update({ invited_by: null }).eq("invited_by", id);

  await убратьКартинки(admin, id);

  const { error: удалить } = await admin.auth.admin.deleteUser(id);
  if (удалить) {
    console.error("[delete-account] auth.users:", удалить.message);
    return res.status(500).json({ error: "delete_failed", detail: удалить.message.slice(0, 200) });
  }

  // Учётной записи больше нет — значит аккаунта нет нигде. Недоделки по
  // отдельным таблицам возвращаем, чтобы их было видно в журнале, но
  // удаление состоялось.
  return res.status(200).json({ ok: true, ...(беды.length ? { warnings: беды.slice(0, 8) } : {}) });
}
