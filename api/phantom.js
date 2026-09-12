/* Мост между приложением и кошельком Phantom.
 *
 * Как это работает. Phantom в Telegram не встраивается: он открывается
 * своим приложением по ссылке и, закончив, уходит на адрес возврата.
 * Вернуться прямо в мини-приложение он не умеет — Telegram открывается
 * по своей схеме, и параметры до окна приложения не доезжают.
 *
 * Поэтому возврат идёт сюда. Обработчик складывает ответ Phantom в базу
 * под коротким ключом, который приложение придумало ещё до перехода, и
 * показывает человеку страницу «возвращайся в Telegram». Само окно
 * приложения всё это время открыто и просто опрашивает этот же
 * обработчик, пока ответ не появится.
 *
 * Расшифровать ответ может только приложение: ключевая пара для обмена
 * рождается в браузере, сюда попадает лишь зашифрованный кусок. Даже с
 * доступом к базе прочитать сессию нельзя.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ключ сессии придумывает приложение. Разрешаем только безопасные
// символы: строка уходит и в адресную строку Phantom, и в базу.
const ключОк = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(s);

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/* Текст, пришедший снаружи, экранируем перед вставкой в страницу.
   Причину отказа пишет кошелёк, а приходит она параметром адреса —
   значит, её может подставить кто угодно, дав человеку ссылку. Без
   экранирования туда встал бы тег со скриптом, и он выполнился бы на
   нашем домене со всем, что у страницы есть. */
const вТекст = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

// Страница возврата. Ничего не спрашивает и ничего не умеет — её задача
// сказать человеку, что дело сделано, и не мешать ему закрыть вкладку.
function страницаВозврата(ошибка, подробности = "") {
  return `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mintly</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#000; color:#fff; font-family:system-ui,-apple-system,sans-serif; padding:24px; }
  .box { max-width:320px; text-align:center; }
  h1 { font-size:20px; margin:0 0 10px; }
  p { font-size:14.5px; line-height:1.5; color:#8B93A1; margin:0; }
  .err { color:#FF6B35; }
  /* Текст отказа как есть: без него причина остаётся неизвестной и
     чинить приходится вслепую. */
  .tech { margin-top:14px; font-size:12.5px; color:#5C626C; word-break:break-word; }
</style></head>
<body><div class="box">
  <h1>${ошибка ? "Не получилось" : "Готово"}</h1>
  <p class="${ошибка ? "err" : ""}">${ошибка
    ? "Кошелёк отказал в подтверждении. Вернись в Mintly и попробуй ещё раз."
    : "Возвращайся в Mintly — приложение уже приняло ответ кошелька."}</p>
  ${подробности ? `<p class="tech">${вТекст(подробности)}</p>` : ""}
</div></body></html>`;
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(500).json({ error: "not_configured" });

  const действие = String((req.query && req.query.action) || "");
  const id = String((req.query && req.query.id) || "");
  if (!ключОк(id)) return res.status(400).json({ error: "bad_id" });

  // Возврат из кошелька. Phantom кладёт ответ в адресную строку, забирать
  // оттуда нужно всё: состав отличается у подключения и у подписи.
  if (действие === "callback") {
    const параметры = {};
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === "action" || k === "id") continue;
      параметры[k] = String(v);
    }
    const ошибка = !!(параметры.errorCode || параметры.errorMessage);
    const { error } = await db.from("phantom_sessions").upsert({
      id,
      params: параметры,
      created_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) console.warn("[phantom] не удалось записать сессию:", error.message);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const подробности = ошибка
      ? [параметры.errorCode, параметры.errorMessage].filter(Boolean).join(" · ").slice(0, 300)
      : "";
    return res.status(200).send(страницаВозврата(ошибка, подробности));
  }

  // Опрос из приложения: пришёл ли ответ.
  if (действие === "poll") {
    const { data, error } = await db
      .from("phantom_sessions")
      .select("params, created_at")
      .eq("id", id)
      .maybeSingle();
    res.setHeader("Cache-Control", "no-store");
    if (error) return res.status(500).json({ error: "read_failed" });
    if (!data) return res.status(200).json({ ready: false });
    // Ответ одноразовый: прочитали — убрали. Иначе следующая сделка с
    // тем же ключом сразу увидела бы старый ответ и решила, что кошелёк
    // уже подтвердил её.
    await db.from("phantom_sessions").delete().eq("id", id);
    return res.status(200).json({ ready: true, params: data.params || {} });
  }

  return res.status(400).json({ error: "unknown_action" });
}
