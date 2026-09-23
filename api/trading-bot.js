/* Бот MintlyTrading — только уведомления.
 *
 * Писать человеку Telegram разрешает лишь после того, как тот сам нажал
 * «Старт» у бота. Бот принимает /start и отмечает в аккаунте, что
 * уведомления подключены; дальше им можно управлять командами:
 *   /start — подключить и поздороваться
 *   /off   — выключить все уведомления
 *   /on    — включить обратно
 *   /status — что сейчас включено
 *   /help  — что умеет бот
 *
 *   POST /api/trading-bot                — вебхук Telegram
 *   GET  /api/trading-bot?action=status  — для приложения (токен Supabase):
 *                                          подключён ли бот и не выключен ли
 *   POST /api/trading-bot?action=setup   — завести вебхук и команды
 *                                          (DEPLOY_SECRET)
 *
 * Переменные окружения: TRADING_BOT_TOKEN, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, DEPLOY_SECRET.
 */

import crypto from "node:crypto";
import { ТОКЕН_ТОРГОВОГО, tgТорговый, отметить, ктоВTelegram, служебнаяБаза, КНОПКА_ПРИЛОЖЕНИЯ, АДРЕС_ПРИЛОЖЕНИЯ, ВИДЫ, проверитьПодпись } from "./_trading.js";

const СЕКРЕТ_ВЫКЛАДКИ = process.env.DEPLOY_SECRET || "";
// Секрет вебхука выводим из токена: отдельная переменная не нужна, а
// чужой, не знающий токена, прислать поддельное обновление не сможет.
const СЕКРЕТ_ВЕБХУКА = ТОКЕН_ТОРГОВОГО
  ? crypto.createHash("sha256").update(`mintly-trading:${ТОКЕН_ТОРГОВОГО}`).digest("hex").slice(0, 48)
  : "";

const КНОПКА = КНОПКА_ПРИЛОЖЕНИЯ;

const ТЕКСТЫ = {
  ru: {
    start: "🔔 <b>Уведомления Mintly подключены</b>\n\nСюда будут приходить:\n• покупки твоих токенов и путь к бирже\n• выход твоего токена на биржу\n• пополнения и выводы кошелька\n• ответы поддержки\n\nВыключить — /off, включить обратно — /on.",
    off: "🔕 Уведомления выключены. Включить обратно — /on.",
    on: "🔔 Уведомления снова включены.",
    statusOn: "🔔 Уведомления включены. Выключить — /off.",
    statusOff: "🔕 Уведомления выключены. Включить — /on.",
    help: "Я присылаю уведомления Mintly.\n\n/on — включить\n/off — выключить\n/status — что сейчас включено",
    noAccount: "Сначала открой Mintly и создай аккаунт — тогда уведомления будут приходить сюда.",
  },
  en: {
    start: "🔔 <b>Mintly notifications are on</b>\n\nYou'll get here:\n• buys of your tokens and progress to listing\n• your token listing on a DEX\n• wallet deposits and withdrawals\n• support replies\n\nTurn off — /off, back on — /on.",
    off: "🔕 Notifications are off. Turn back on — /on.",
    on: "🔔 Notifications are back on.",
    statusOn: "🔔 Notifications are on. Turn off — /off.",
    statusOff: "🔕 Notifications are off. Turn on — /on.",
    help: "I send Mintly notifications.\n\n/on — turn on\n/off — turn off\n/status — current state",
    noAccount: "Open Mintly and create an account first — then notifications will come here.",
  },
};

async function ответить(chatId, текст) {
  return tgТорговый("sendMessage", {
    chat_id: chatId, text: текст, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: КНОПКА,
  });
}

async function хозяин(req) {
  const db = служебнаяБаза();
  const заголовок = String((req.headers && req.headers.authorization) || "");
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  if (!db || !токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

export default async function handler(req, res) {
  if (!ТОКЕН_ТОРГОВОГО) return res.status(503).json({ error: "no_trading_bot_token" });
  const действие = String((req.query && req.query.action) || "");

  /* Разовая проверка: почему рассылка молчит. Не трогает ничего чужого —
     только смотрит на переменные окружения и один раз сама вызывает
     /api/notify, как это делает внутренний цикл сервера, и показывает,
     что тот ответил. Тем же секретом, что и «setup». */
  if (действие === "debug") {
    const данный = String((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "").trim();
    if (!СЕКРЕТ_ВЫКЛАДКИ || данный !== СЕКРЕТ_ВЫКЛАДКИ) return res.status(401).json({ error: "bad_secret" });
    const env = {
      TRADING_BOT_TOKEN: !!process.env.TRADING_BOT_TOKEN,
      TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
      CRON_SECRET: !!process.env.CRON_SECRET,
      NOTIFY_LOOP: process.env.NOTIFY_LOOP ?? null,
      NOTIFY_INTERVAL_MS: process.env.NOTIFY_INTERVAL_MS ?? null,
    };
    let notify = null;
    try {
      const mod = await import("./notify.js");
      let код = null; let тело = null;
      const поддельныйRes = {
        status(c) { код = c; return this; },
        json(b) { тело = b; return this; },
      };
      await mod.default(
        { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` } },
        поддельныйRes,
      );
      notify = { код, тело };
    } catch (e) {
      notify = { ошибка: String((e && e.message) || e).slice(0, 300) };
    }
    return res.status(200).json({ env, notify });
  }

  if (действие === "setup") {
    const данный = String((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "").trim();
    if (!СЕКРЕТ_ВЫКЛАДКИ || данный !== СЕКРЕТ_ВЫКЛАДКИ) return res.status(401).json({ error: "bad_secret" });
    const хост = req.headers["x-forwarded-host"] || req.headers.host || "api.mintly.company";
    const вебхук = await tgТорговый("setWebhook", {
      url: `https://${хост}/api/trading-bot`,
      secret_token: СЕКРЕТ_ВЕБХУКА,
      allowed_updates: ["message"],
    });
    await tgТорговый("setMyCommands", { commands: [
      { command: "status", description: "Что сейчас включено" },
      { command: "off", description: "Выключить уведомления" },
      { command: "on", description: "Включить уведомления" },
      { command: "help", description: "Что умеет бот" },
    ] });
    await tgТорговый("setMyDescription", {
      description: "Уведомления Mintly: покупки твоих токенов, выход на биржу, пополнения и выводы кошелька, ответы поддержки.",
    });
    await tgТорговый("setMyShortDescription", { short_description: "Уведомления о твоих токенах и кошельке Mintly" });
    // Кнопка меню у поля ввода — сразу в приложение.
    await tgТорговый("setChatMenuButton", { menu_button: { type: "web_app", text: "Уведомления", web_app: { url: АДРЕС_ПРИЛОЖЕНИЯ } } });
    return res.status(200).json(вебхук || { ok: false });
  }

  /* Для приложения: подключён ли бот. Проверяем не только отметку, но и
     самого Telegram — getChat отвечает, только если человек запускал бота.
     Так отметка сама чинится, если вебхук когда-то не дошёл. */
  if (действие === "status") {
    res.setHeader("Cache-Control", "no-store");
    const user = await хозяин(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const db = служебнаяБаза();
    const { data: профиль } = await db.from("profiles").select("telegram_id").eq("id", user.id).maybeSingle();
    const tgId = профиль && профиль.telegram_id;
    if (!tgId) return res.status(200).json({ connected: false, muted: false });
    const чат = await tgТорговый("getChat", { chat_id: tgId });
    const подключён = !!(чат && чат.ok);
    const мета = user.user_metadata || {};
    if (подключён && !мета.trading_bot) await отметить(tgId, { trading_bot: true }).catch(() => {});
    return res.status(200).json({ connected: подключён, muted: !!мета.trading_mute });
  }

  /* Приложение бота: состояние и переключатели. Вход — подписью этого
     бота (initData), без сессии основного приложения. */
  if (действие === "app" || действие === "set") {
    res.setHeader("Cache-Control", "no-store");
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const tgUser = проверитьПодпись(String(тело.initData || ""));
    if (!tgUser || !tgUser.id) return res.status(401).json({ error: "bad_init_data" });
    const аккаунт = await ктоВTelegram(tgUser.id, { свежо: true });
    if (!аккаунт) return res.status(200).json({ account: false });
    let мета = аккаунт.мета || {};
    if (действие === "set") {
      const правка = {};
      if (typeof тело.muted === "boolean") правка.trading_mute = тело.muted;
      if (тело.types && typeof тело.types === "object") {
        const виды = { ...(мета.trading_types || {}) };
        for (const в of ВИДЫ) if (typeof тело.types[в] === "boolean") виды[в] = тело.types[в];
        правка.trading_types = виды;
      }
      мета = (await отметить(tgUser.id, { trading_bot: true, ...правка })) || мета;
    } else if (!мета.trading_bot) {
      // Открыл приложение бота — значит бот у него есть.
      мета = (await отметить(tgUser.id, { trading_bot: true })) || мета;
    }
    const виды = {};
    for (const в of ВИДЫ) виды[в] = !(мета.trading_types && мета.trading_types[в] === false);
    return res.status(200).json({
      account: true,
      muted: !!мета.trading_mute,
      types: виды,
      log: Array.isArray(мета.trading_log) ? мета.trading_log : [],
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (String(req.headers["x-telegram-bot-api-secret-token"] || "") !== СЕКРЕТ_ВЕБХУКА) {
    return res.status(401).json({ error: "bad_secret" });
  }

  const обновление = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const сообщение = обновление.message;
  // Telegram нужен только быстрый ответ 200 — остальное делаем после.
  res.status(200).json({ ok: true });
  if (!сообщение || !сообщение.from || !сообщение.chat || сообщение.chat.type !== "private") return;

  const кто = сообщение.from.id;
  const язык = String(сообщение.from.language_code || "ru").startsWith("ru") ? "ru" : "en";
  const т = ТЕКСТЫ[язык];
  const команда = String(сообщение.text || "").trim().split(/[\s@]/)[0].toLowerCase();

  try {
    const аккаунт = await ктоВTelegram(кто, { свежо: true });
    if (!аккаунт) { await ответить(кто, т.noAccount); return; }

    if (команда === "/start") {
      await отметить(кто, { trading_bot: true, trading_mute: false });
      await ответить(кто, т.start);
    } else if (команда === "/off") {
      await отметить(кто, { trading_mute: true });
      await ответить(кто, т.off);
    } else if (команда === "/on") {
      await отметить(кто, { trading_bot: true, trading_mute: false });
      await ответить(кто, т.on);
    } else if (команда === "/status") {
      await ответить(кто, аккаунт.мета && аккаунт.мета.trading_mute ? т.statusOff : т.statusOn);
    } else {
      await ответить(кто, т.help);
    }
  } catch (e) {
    console.error("[trading-bot]", e && e.message);
  }
}
