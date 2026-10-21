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
import { ТОКЕН_ТОРГОВОГО, tgТорговый, отметить, ктоВTelegram, служебнаяБаза, КНОПКА_ПРИЛОЖЕНИЯ, АДРЕС_ПРИЛОЖЕНИЯ, ССЫЛКА_ПРИЛОЖЕНИЯ, ВИДЫ, проверитьПодпись, ключПривязки, разобратьКлюч, забыть } from "./_trading.js";

const СЕКРЕТ_ВЫКЛАДКИ = process.env.DEPLOY_SECRET || "";
// Секрет вебхука выводим из токена: отдельная переменная не нужна, а
// чужой, не знающий токена, прислать поддельное обновление не сможет.
const СЕКРЕТ_ВЕБХУКА = ТОКЕН_ТОРГОВОГО
  ? crypto.createHash("sha256").update(`mintly-trading:${ТОКЕН_ТОРГОВОГО}`).digest("hex").slice(0, 48)
  : "";

const КНОПКА = КНОПКА_ПРИЛОЖЕНИЯ;

// Подписи видов уведомлений — в /status и на кнопках.
const ИМЕНА_ВИДОВ = {
  ru: { trade: "Покупки твоих токенов", listing: "Выход на биржу", wallet: "Пополнения и выводы", support: "Ответы поддержки" },
  en: { trade: "Buys of your tokens", listing: "DEX listing", wallet: "Deposits and withdrawals", support: "Support replies" },
};

const ТЕКСТЫ = {
  ru: {
    linked: "✅ <b>Готово — Telegram привязан к аккаунту Mintly.</b>",
    linkExpired: "Ссылка устарела. Нажми «Подключить уведомления» в Mintly ещё раз — придёт свежая.",
    linkBad: "Ссылка не подошла. Нажми «Подключить уведомления» в Mintly ещё раз.",
    linkTaken: "Этот Telegram уже привязан к другому аккаунту Mintly. Уведомления будут приходить по нему.",
    welcome: "👋 Это бот уведомлений <b>Mintly</b>.\n\nЧтобы подключить его, открой Mintly — в приложении или на сайте — и нажми «Подключить уведомления». Бот сам привяжется к твоему аккаунту.",
    unknown: "Не знаю такую команду. Вот что умею:",
    btnOpen: "⚙️ Настройки уведомлений",
    btnApp: "Открыть Mintly",
    btnOff: "🔕 Выключить",
    btnOn: "🔔 Включить",
    start: "🔔 <b>Уведомления Mintly подключены</b>\n\nСюда будут приходить:\n• покупки твоих токенов и путь к бирже\n• выход твоего токена на биржу\n• пополнения и выводы кошелька\n• ответы поддержки\n\nВыключить — /off, включить обратно — /on.",
    off: "🔕 Уведомления выключены. Включить обратно — /on.",
    on: "🔔 Уведомления снова включены.",
    statusOn: "🔔 Уведомления включены. Выключить — /off.",
    statusOff: "🔕 Уведомления выключены. Включить — /on.",
    help: "Я присылаю уведомления Mintly.\n\n/on — включить\n/off — выключить\n/status — что сейчас включено",
    noAccount: "Сначала открой Mintly и создай аккаунт — тогда уведомления будут приходить сюда.",
  },
  en: {
    linked: "✅ <b>Done — Telegram is linked to your Mintly account.</b>",
    linkExpired: "This link has expired. Tap “Connect notifications” in Mintly again to get a fresh one.",
    linkBad: "This link didn't work. Tap “Connect notifications” in Mintly again.",
    linkTaken: "This Telegram is already linked to another Mintly account. Notifications will follow that account.",
    welcome: "👋 This is the <b>Mintly</b> notifications bot.\n\nTo connect it, open Mintly — in the app or on the website — and tap “Connect notifications”. The bot will link itself to your account.",
    unknown: "I don't know that command. Here's what I can do:",
    btnOpen: "⚙️ Notification settings",
    btnApp: "Open Mintly",
    btnOff: "🔕 Turn off",
    btnOn: "🔔 Turn on",
    start: "🔔 <b>Mintly notifications are on</b>\n\nYou'll get here:\n• buys of your tokens and progress to listing\n• your token listing on a DEX\n• wallet deposits and withdrawals\n• support replies\n\nTurn off — /off, back on — /on.",
    off: "🔕 Notifications are off. Turn back on — /on.",
    on: "🔔 Notifications are back on.",
    statusOn: "🔔 Notifications are on. Turn off — /off.",
    statusOff: "🔕 Notifications are off. Turn on — /on.",
    help: "I send Mintly notifications.\n\n/on — turn on\n/off — turn off\n/status — current state",
    noAccount: "Open Mintly and create an account first — then notifications will come here.",
  },
};

async function ответить(chatId, текст, клавиатура = КНОПКА) {
  return tgТорговый("sendMessage", {
    chat_id: chatId, text: текст, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: клавиатура,
  });
}

/* Под каждым ответом — то, что можно сделать прямо сейчас: открыть
   настройки уведомлений и одним нажатием выключить или включить их.
   Раньше бот отвечал одним и тем же текстом, и что-то поменять можно
   было только набором команды. */
function клавиатура(т, мета) {
  const выкл = !!(мета && мета.trading_mute);
  return { inline_keyboard: [
    [{ text: т.btnOpen, web_app: { url: АДРЕС_ПРИЛОЖЕНИЯ } }],
    [{ text: выкл ? т.btnOn : т.btnOff, callback_data: выкл ? "m:on" : "m:off" }, { text: т.btnApp, url: ССЫЛКА_ПРИЛОЖЕНИЯ }],
  ] };
}

function состояние(язык, мета) {
  const т = ТЕКСТЫ[язык];
  if (мета && мета.trading_mute) return т.statusOff;
  const имена = ИМЕНА_ВИДОВ[язык];
  const строки = ВИДЫ.map((в) => `${мета && мета.trading_types && мета.trading_types[в] === false ? "▫️" : "✅"} ${имена[в]}`);
  return `${т.statusOn}\n\n${строки.join("\n")}`;
}

/* Привязка по ключу из ссылки: Telegram этого человека становится
   адресом уведомлений его аккаунта. Аккаунту, у которого Telegram уже
   свой, чужой не подставляем. */
async function привязать(кто, ключ, язык) {
  const т = ТЕКСТЫ[язык];
  const р = разобратьКлюч(ключ);
  if (!р) return { текст: т.linkBad };
  if (р.просрочен) return { текст: т.linkExpired };
  const db = служебнаяБаза();
  const { data: занят } = await db.from("profiles").select("id").eq("telegram_id", кто).limit(1);
  if (занят && занят.length && занят[0].id !== р.userId) return { текст: т.linkTaken, дальше: true };
  const { data: свой } = await db.from("profiles").select("telegram_id").eq("id", р.userId).maybeSingle();
  if (!свой) return { текст: т.linkBad };
  if (свой.telegram_id && String(свой.telegram_id) !== String(кто)) return { текст: т.linkTaken, дальше: true };
  if (!свой.telegram_id) await db.from("profiles").update({ telegram_id: кто }).eq("id", р.userId).is("telegram_id", null);
  забыть(кто);
  return { ок: true };
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

let имяБота = "";

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
      allowed_updates: ["message", "callback_query"],
    });
    await tgТорговый("setMyCommands", { commands: [
      { command: "start", description: "Подключить уведомления" },
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

  /* Ссылка подключения для приложения и сайта: открывает бота сразу с
     ключом привязки этого аккаунта. */
  if (действие === "link") {
    res.setHeader("Cache-Control", "no-store");
    const user = await хозяин(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (!имяБота) {
      const я = await tgТорговый("getMe", {});
      имяБота = (я && я.ok && я.result && я.result.username) || process.env.TRADING_BOT_USERNAME || "MintlyTrading_bot";
    }
    return res.status(200).json({ url: `https://t.me/${имяБота}?start=${ключПривязки(user.id)}` });
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
  // Telegram нужен только быстрый ответ 200 — остальное делаем после.
  res.status(200).json({ ok: true });

  /* Кнопки под сообщением: выключить / включить одним нажатием. */
  const нажатие = обновление.callback_query;
  if (нажатие && нажатие.from) {
    const кто = нажатие.from.id;
    const язык = String(нажатие.from.language_code || "ru").startsWith("ru") ? "ru" : "en";
    const т = ТЕКСТЫ[язык];
    try {
      const выкл = нажатие.data === "m:off";
      const мета = (нажатие.data === "m:off" || нажатие.data === "m:on")
        ? await отметить(кто, { trading_bot: true, trading_mute: выкл }) : null;
      await tgТорговый("answerCallbackQuery", { callback_query_id: нажатие.id, text: мета ? (выкл ? т.off : т.on).replace(/<[^>]+>/g, "") : "" });
      if (мета && нажатие.message) {
        await tgТорговый("editMessageText", {
          chat_id: нажатие.message.chat.id, message_id: нажатие.message.message_id,
          text: состояние(язык, мета), parse_mode: "HTML", reply_markup: клавиатура(т, мета),
        });
      }
    } catch (e) {
      console.error("[trading-bot] кнопка", e && e.message);
    }
    return;
  }

  const сообщение = обновление.message;
  if (!сообщение || !сообщение.from || !сообщение.chat || сообщение.chat.type !== "private") return;

  const кто = сообщение.from.id;
  const язык = String(сообщение.from.language_code || "ru").startsWith("ru") ? "ru" : "en";
  const т = ТЕКСТЫ[язык];
  const [сырая, параметр = ""] = String(сообщение.text || "").trim().split(/\s+/);
  const команда = сырая.split("@")[0].toLowerCase();

  try {
    // /start с ключом из Mintly — привязка аккаунта.
    let привязано = false;
    if (команда === "/start" && параметр.startsWith("l")) {
      const итог = await привязать(кто, параметр, язык);
      if (итог.ок) привязано = true;
      else {
        // Ключ не подошёл — говорим почему; занятый Telegram при этом
        // работает дальше со своим аккаунтом.
        await ответить(кто, итог.текст, { inline_keyboard: [[{ text: т.btnApp, url: ССЫЛКА_ПРИЛОЖЕНИЯ }]] });
        if (!итог.дальше) return;
      }
    }

    const аккаунт = await ктоВTelegram(кто, { свежо: true });
    if (!аккаунт) { await ответить(кто, т.welcome, { inline_keyboard: [[{ text: т.btnApp, url: ССЫЛКА_ПРИЛОЖЕНИЯ }]] }); return; }

    let мета = аккаунт.мета || {};
    if (команда === "/start") {
      мета = (await отметить(кто, { trading_bot: true, trading_mute: false })) || мета;
      await ответить(кто, `${привязано ? `${т.linked}\n\n` : ""}${т.start}`, клавиатура(т, мета));
    } else if (команда === "/off") {
      мета = (await отметить(кто, { trading_mute: true })) || мета;
      await ответить(кто, т.off, клавиатура(т, мета));
    } else if (команда === "/on") {
      мета = (await отметить(кто, { trading_bot: true, trading_mute: false })) || мета;
      await ответить(кто, т.on, клавиатура(т, мета));
    } else if (команда === "/status") {
      await ответить(кто, состояние(язык, мета), клавиатура(т, мета));
    } else if (команда === "/help") {
      await ответить(кто, т.help, клавиатура(т, мета));
    } else {
      // Не команда и не известная команда — подсказка, а не приветствие
      // заново: раньше на что угодно бот отвечал «подключены».
      await ответить(кто, `${т.unknown}\n\n${т.help}`, клавиатура(т, мета));
    }
  } catch (e) {
    console.error("[trading-bot]", e && e.message);
  }
}
