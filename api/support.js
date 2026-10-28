/* Приём вопросов из приложения.
 *
 * Пишет человек в приложении, а прочитать вопрос должна команда в
 * Telegram — значит, между ними нужен сервер. Он же единственный, кому
 * разрешено писать в переписку: в базе на support_messages нет политики
 * вставки, и обойти этот обработчик, отправив вопрос «в стол», нельзя
 * (см. supabase_support.sql).
 *
 * Кто пишет — решает не тело запроса, а токен сессии Supabase в
 * заголовке: подставить чужой id в json может кто угодно, подделать
 * подписанный токен — нет.
 */

import {
  BOT_TOKEN, SUPABASE_URL, SERVICE_ROLE_KEY, SUPPORT_CHAT_ID, MAX_LEN,
  adminClient, acceptQuestion, tgCall, чатКоманды,
} from "./_support.js";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/* Проверка связи — открыть в браузере:
 *   https://<домен>/api/support?check=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Вопрос идёт через четыре звена: переменные окружения, база, бот и
 * группа. Когда до чата ничего не доходит, по одному молчанию не понять,
 * какое из них подвело, а лазить по журналам Vercel ради этого — долго.
 * Здесь каждое звено дёргается по очереди и отвечает за себя. */
async function check(res) {
  // Чат команды — подключённый командой /support, а без него — из окружения.
  const чат = чатКоманды();
  const итог = {
    переменные: {
      TELEGRAM_BOT_TOKEN: !!BOT_TOKEN,
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_ROLE_KEY,
      SUPPORT_CHAT_ID: SUPPORT_CHAT_ID || false,
    },
    чатКоманды: чат ? (чат === SUPPORT_CHAT_ID ? `${чат} (из SUPPORT_CHAT_ID)` : `${чат} (подключён командой /support)`) : false,
  };
  // Если знак пришлось вернуть — говорим об этом: работать будет и так,
  // но в переменной лучше починить, иначе то же самое всплывёт в других
  // местах.
  if (SUPPORT_CHAT_ID && SUPPORT_CHAT_ID !== String(process.env.SUPPORT_CHAT_ID || "").trim()) {
    итог.замечание = `в SUPPORT_CHAT_ID потерян минус, читаем как ${SUPPORT_CHAT_ID}`;
  }

  if (BOT_TOKEN) {
    const me = await tgCall("getMe");
    итог.бот = me.ok ? `@${me.result.username}` : `не принят Telegram: ${me.description || "?"}`;
  }

  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    const admin = adminClient();
    итог.таблицы = {};
    for (const имя of ["support_messages", "support_relay"]) {
      const { error } = await admin.from(имя).select("*", { head: true, count: "exact" }).limit(1);
      // Нет таблицы — значит, supabase_support.sql ещё не выполнен.
      итог.таблицы[имя] = error ? `нет доступа: ${error.message}` : "есть";
    }
  }

  if (BOT_TOKEN && чат) {
    const сведения = await tgCall("getChat", { chat_id: чат });
    итог.чат = сведения.ok
      ? `${сведения.result.title || сведения.result.username || сведения.result.id} (${сведения.result.type})`
      : `не виден боту: ${сведения.description || "?"}`;
    const проба = await tgCall("sendMessage", {
      chat_id: чат,
      text: "Проверка связи: поддержка настроена, вопросы будут приходить сюда.",
    });
    итог.проверочное_сообщение = проба.ok ? "доставлено" : `не доставлено: ${проба.description || "?"}`;
  } else if (!чат) {
    итог.чат = "чат команды не подключён — отправь /support в группе с ботом";
  }

  итог.готово = итог.проверочное_сообщение === "доставлено"
    && итог.таблицы && итог.таблицы.support_messages === "есть";
  return res.status(200).json(итог);
}

export default async function handler(req, res) {
  // Проверка связи идёт обычной ссылкой в браузере — но только со
  // знанием секрета: она пишет в чат команды.
  if (req.method === "GET") {
    const asked = new URL(req.url, "https://x").searchParams.get("check");
    if (!WEBHOOK_SECRET) return res.status(500).json({ error: "no_webhook_secret" });
    if (asked !== WEBHOOK_SECRET) return res.status(401).json({ error: "bad_secret" });
    return check(res);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "server_not_configured" });
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "no_session" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (err) {
    return res.status(400).json({ error: "bad_json" });
  }
  const text = String(body.body || "").trim();
  if (!text) return res.status(400).json({ error: "empty" });
  if (text.length > MAX_LEN) return res.status(400).json({ error: "too_long" });

  const admin = adminClient();

  const { data: сессия, error: authError } = await admin.auth.getUser(token);
  const user = сессия && сессия.user;
  if (authError || !user) return res.status(401).json({ error: "bad_session" });

  const { data: profile } = await admin
    .from("profiles")
    .select("id, nickname, telegram_id")
    .eq("id", user.id)
    .maybeSingle();
  // Профиля может не быть, если человек вошёл, но не завёл аккаунт.
  // Переписка всё равно привязывается к нему — команде просто нечего
  // будет показать, кроме внутреннего id.
  const кто = profile || { id: user.id, nickname: null, telegram_id: null };

  const итог = await acceptQuestion(admin, { profile: кто, body: text });
  if (!итог.ok) {
    const код = итог.error;
    const статус = код === "too_fast" || код === "too_many" ? 429
      : код === "store_failed" || код === "undelivered" ? 500
      : 400;
    // Причину недоставки отдаём наружу: она видна в консоли браузера и
    // сразу называет виновника — незаданный чат, чужие права, нет бота
    // в группе.
    return res.status(статус).json({ error: код, detail: итог.detail });
  }
  return res.status(200).json({ ok: true, message: итог.message });
}
