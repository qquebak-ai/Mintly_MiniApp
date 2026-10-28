/* Обработчик сообщений основного бота. Делает четыре дела.
 *
 * Первое — приглашения. Метка должна доходить и тогда, когда человек
 * попадает сначала в чат с ботом, а не сразу в приложение. Такое бывает
 * постоянно — ссылку пересылают, её открывают с компьютера, жмут «Start»
 * в чате. В этом случае Telegram отдаёт метку из ссылки боту в виде
 * «/start ref_<id>», а приложение о ней не узнаёт вовсе: там метка
 * приходит только при переходе по прямой ссылке на само приложение.
 * Поэтому бот кладёт метку в отдельную таблицу — «этот телеграм-аккаунт
 * пришёл от такого-то». Когда человек заведёт профиль, вход возьмёт её
 * оттуда. Метка живёт до первого использования.
 *
 * Второе — токены. Бот отвечает на команды в любом чате, куда его
 * добавили («/token PRSM», «/top»), и работает подсказкой в чужих
 * чатах, где его нет вовсе: «@бот PRSM» собирает карточку с ценой,
 * капитализацией, мини-графиком и путём до биржи — в любой из пяти сетей
 * приложения (TON, Solana, BNB Chain, Base, Ethereum) и по ленте рынка.
 *
 * Третье — сделки и кошелёк в личке: покупка на сумму в монете сети и
 * продажа долей идут кошельком приложения через его же обработчик
 * (api/_botTrade.js), «/wallet» показывает остатки во всех сетях.
 *
 * Четвёртое — поддержка в одну сторону. Вопросы принимает только
 * приложение, раздел «Поддержка»: в переписке с ботом их не собрать по
 * человеку, а без привязки к аккаунту ответ некуда вернуть. Бот носит
 * обратную половину — ответ команды, отправленный реплаем в служебном
 * чате, доходит человеку и в личку, и в приложение (см. api/_support.js
 * и supabase_support.sql).
 *
 * Подключение — один раз, открыв в браузере:
 *   https://<домен>/api/telegram-bot?setup=<TELEGRAM_WEBHOOK_SECRET>
 * Сервер сам ставит вебхук и визитку бота: описание, команды, кнопку меню
 * (api/_botProfile.js). У @BotFather остаётся то, чего Bot API не умеет:
 *   /setinline → бот → «тикер или адрес токена» — без этого подсказки
 *     «@бот PRSM» в чужих чатах не работают;
 *   /mybots → бот → Bot Settings → Configure Mini App → адрес приложения —
 *     главное мини-приложение, по нему открываются ссылки ?startapp.
 *
 * Чтобы заработала поддержка, нужен ещё служебный чат:
 *   1. Завести группу и добавить туда бота.
 *   2. Сделать бота администратором группы — иначе Telegram не покажет
 *      ему обычные сообщения, и ответы команды до людей не дойдут.
 *      (Второй способ: @BotFather → /setprivacy → Disable.)
 *   3. Отправить в группе «/id» — бот ответит числом.
 *   4. Положить это число в переменную окружения SUPPORT_CHAT_ID.
 */

import crypto from "node:crypto";
import { SUPPORT_CHAT_ID, adminClient, deliverAnswer } from "./_support.js";
import { searchAll, cardFor, cardByRef, свежийГрафик, findTokens, trendingExternal, looksLikeAddress, ВСЁ_ПРОБНОЕ, ИМЯ_СЕТИ, цепочкаТокена } from "./_market.js";
import { кошелёкПоTelegram } from "./_wallet.js";
import { СУММЫ, сделкаИзЧата, кошелькиЧеловека, кошелёкСети, остатокТокена, запасНаГаз, токеныЧеловека } from "./_botTrade.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Секрет из setWebhook. Telegram присылает его заголовком с каждым
// обновлением — так видно, что запрос действительно от Telegram, а не от
// того, кто просто узнал адрес.
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

// Адрес самого приложения. Кнопки в личке открывают его напрямую, поэтому
// короткое имя мини-приложения в BotFather для них не требуется.
const APP_URL = process.env.APP_URL || "https://mintly.company";

/* Откуда Telegram будет забирать картинки.
 *
 * По умолчанию — то, что записано в переменных. Но однажды площадка
 * переехала на новый домен, а переменная осталась старой, и баннеры
 * молча перестали приходить: Telegram шёл по мёртвому адресу и отвечал
 * отказом, которого никто не видел. Поэтому адрес берём из самого
 * запроса — вебхук приходит ровно на тот домен, где живёт сайт, и
 * ошибиться тут уже нечем. */
let АДРЕС_КАРТИНОК = APP_URL;

function запомнитьАдрес(req) {
  const хост = String((req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(хост)) АДРЕС_КАРТИНОК = `https://${хост}`;
}

// Значок для подсказок, у которых нет своей картинки: без него Telegram
// рисует серый квадрат с первой буквой заголовка, и подсказка выглядит
// поломанной.
// Версия в адресе — чтобы Telegram не держал в кеше значок со старым лого.
const ЗНАЧОК = `${APP_URL}/icon.png?v=3`;
// Имя бота нужно самим сообщениям: в группах кнопка «открыть» ведёт не в
// приложение, а в личку с ботом — web_app-кнопки Telegram пускает только
// туда.
const TG_BOT = String(process.env.TG_BOT || "MintlyCobot").replace(/^@/, "").trim();

// Ссылка в личку с ботом с меткой запуска: метку бот получает всегда, в
// отличие от ссылки на мини-приложение, которой нужна настройка в BotFather.
const ссылкаБота = (метка) => `https://t.me/${TG_BOT}?start=${метка}`;
// Экран приложения для web_app-кнопки: приложение читает ?open= и сразу
// открывает нужный раздел (src/App.tsx).
const экранПриложения = (куда) => `${APP_URL}?open=${куда}`;

// В тестовых сетях деньги ненастоящие — говорим об этом прямо: без этой
// строки пробную монету покупают всерьёз.
const ПОДСКАЗКА_СЕТИ = ВСЁ_ПРОБНОЕ
  ? "\n\n🧪 Сейчас Mintly в тестовых сетях: монеты здесь бесплатные и ничего не стоят."
  : "";

const REF_PREFIX = "ref_";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOKEN_PREFIX = "tok_";
function tokenFromPayload(payload) {
  if (typeof payload !== "string" || !payload.startsWith(TOKEN_PREFIX)) return null;
  const id = payload.slice(TOKEN_PREFIX.length).trim();
  return UUID_RE.test(id) ? id : null;
}

function inviterFromPayload(payload) {
  if (typeof payload !== "string" || !payload.startsWith(REF_PREFIX)) return null;
  const id = payload.slice(REF_PREFIX.length).trim();
  return UUID_RE.test(id) ? id : null;
}

async function tgCall(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function tg(method, body) {
  try {
    await tgCall(method, body);
  } catch (err) {
    console.warn("[bot] telegram call failed:", method, err && err.message);
  }
}

/* Ответ команды. Приходит реплаем в служебном чате — по сообщению, на
   которое отвечают, и находится нужная переписка. */
async function handleTeamReply(message) {
  const текст = typeof message.text === "string" ? message.text.trim() : "";
  const цель = message.reply_to_message;
  // Не реплай — значит, команда переговаривается между собой: в такой
  // разговор лезть нечего.
  if (!текст || текст.startsWith("/") || !цель) return;

  const admin = adminClient();
  const { data: связь } = await admin
    .from("support_relay")
    .select("user_id")
    .eq("admin_message_id", цель.message_id)
    .maybeSingle();

  if (!связь) {
    await tg("sendMessage", {
      chat_id: message.chat.id,
      reply_to_message_id: message.message_id,
      text: "Не вижу, кому это адресовано. Отвечать нужно реплаем на пересланный вопрос.",
    });
    return;
  }

  const { data: профиль } = await admin
    .from("profiles")
    .select("id, nickname, telegram_id")
    .eq("id", связь.user_id)
    .maybeSingle();

  const итог = await deliverAnswer(admin, {
    userId: связь.user_id,
    telegramId: профиль && профиль.telegram_id,
    text: текст,
    adminName: (message.from && (message.from.first_name || message.from.username)) || null,
  });

  await tg("sendMessage", {
    chat_id: message.chat.id,
    reply_to_message_id: message.message_id,
    text: !итог.ok
      ? "Ответ не сохранился, попробуй ещё раз."
      : итог.delivered
        ? "✓ Отправлено"
        : "✓ Сохранено в приложении. В личку не дошло: человек не начинал диалог с ботом или заблокировал его.",
  });
}

/* Метка запуска для ссылки «t.me/бот?start=…».
 *
 * Telegram пускает в неё только буквы, цифры, «_» и «-»: ни точки, ни
 * «~» там быть не может — с ними команда до бота просто не доходит, и
 * человек попадает в пустой чат. Поэтому сумма едет целым числом
 * миллионных и стоит перед ключом: в адресе токена «_» встречается сам
 * по себе, и разделитель в конце было бы не отличить. Миллионные, а не
 * сотые — суммы в ETH и BNB мельче сотой.
 */
function меткаПокупки(ref, сумма) {
  const доли = Math.max(0, Math.round(Number(сумма) * 1e6));
  const ключ = String(ref || "").replace(":", "_");
  return доли > 0 ? `buy_m${доли}_${ключ}` : `buy_${ключ}`;
}

// Превью над карточкой — сам график: его видно сразу, без единого касания.
function превью(card, свежий = false) {
  return card && card.chart
    ? { url: свежий ? свежийГрафик(card.chart) : card.chart, prefer_large_media: true, show_above_text: true }
    : { is_disabled: true };
}

// Число монет — без хвоста нулей, но не мельче, чем нужно сумме сети.
function монет(v) {
  const n = Number(v) || 0;
  if (n >= 100) return n.toFixed(2).replace(/\.?0+$/, "");
  if (n >= 1) return n.toFixed(3).replace(/\.?0+$/, "");
  return n.toFixed(6).replace(/\.?0+$/, "") || "0";
}
const штук = (v) => {
  const n = Number(v) || 0;
  return n >= 1000 ? Math.round(n).toLocaleString("ru-RU") : n.toFixed(2).replace(/\.?0+$/, "");
};

// Тикер приходит из чужой ленты: там встречается и «<», и «&», а
// сообщение уходит с parse_mode HTML.
const экранHTML = (с) => String(с || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Кнопка «открыть в приложении». В личке — web_app прямо в приложение,
   в чужом чате такая кнопка запрещена, и туда идёт ссылка на бота: он
   покажет карточку и откроет приложение уже сам. */
function кнопкаПриложения(card, своё, текст = "📈 Открыть в Mintly") {
  return своё ? { text: текст, web_app: { url: card.link } } : { text: текст, url: card.botLink };
}

/* Кнопки под карточкой токена.
 *
 * Кнопка web_app живёт только в сообщениях, которые бот отправляет сам
 * в личной переписке с собой. В подсказке её быть не может: сообщение
 * уходит от имени человека, и Telegram отбивает такой ответ целиком —
 * снаружи это выглядит как «ничего не нашлось». Поэтому во всё, что
 * рождается из подсказки или в группе, идёт обычная ссылка на бота.
 *
 * В личке под своим токеном — сразу сделка: суммы покупки в монете его
 * сети и доли продажи. Сделка идёт кошельком приложения, второе касание
 * — подтверждение с остатком на экране. */
function tokenButtons(card, своё) {
  // «Обновить» перерисовывает и текст, и картинку прямо в чате: цена
  // живёт своей жизнью, а сообщение, отправленное час назад, врёт.
  // В callback_data влезает 64 байта, поэтому там только вид и ключ.
  const обновить = card.ref ? [{ text: "🔄 Обновить", callback_data: `r:${card.ref}` }] : [];
  if (!card.торгуется || !card.ref) {
    return { inline_keyboard: [[кнопкаПриложения(card, своё), ...обновить]] };
  }
  if (!своё) {
    // В чужом чате торговать негде: остаток и списание — это разговор с
    // одним человеком, а не строка посреди общей переписки.
    return { inline_keyboard: [[
      { text: "💸 Торговать", url: ссылкаБота(меткаПокупки(card.ref, 0)) },
      ...обновить,
    ]] };
  }
  const суммы = (СУММЫ[card.chain] || []).map((n) => ({ text: `🟢 ${n} ${card.монета}`, callback_data: `k:${card.ref}:${n}` }));
  const доли = [25, 50, 100].map((n) => ({ text: n === 100 ? "🔴 Всё" : `🔴 ${n}%`, callback_data: `d:${card.ref}:${n}` }));
  return { inline_keyboard: [
    суммы.slice(0, 2),
    суммы.slice(2),
    доли,
    [{ text: "💼 Кошелёк", callback_data: "w:" }, ...обновить],
    [кнопкаПриложения(card, true)],
  ] };
}

async function отправитьКарточку(chatId, card, своё, { ответНа, приписка = "" } = {}) {
  await tg("sendMessage", {
    chat_id: chatId,
    reply_to_message_id: ответНа,
    text: приписка ? `${card.text}\n\n${приписка}` : card.text,
    parse_mode: "HTML",
    link_preview_options: превью(card),
    reply_markup: tokenButtons(card, своё),
  });
}

/* Что показать вместо покупки, когда назвали тикер.
 *
 * Список совпавших токенов с адресами: под одним тикером их бывает
 * несколько, и выбрать должен человек, а не первая строка выдачи.
 * Каждый — своей кнопкой, за ней стоит конкретный токен, а не текст.
 */
async function выборПоТикеру(chatId, запрос) {
  let найдено = [];
  try { найдено = (await searchAll(запрос, 5)).filter((t) => !t.external); } catch (err) { найдено = []; }
  if (!найдено.length) {
    await tg("sendMessage", { chat_id: chatId, text: `Токена Mintly с таким тикером нет. Проверь тикер или пришли адрес токена.${ПОДСКАЗКА_СЕТИ}` });
    return;
  }
  const строки = найдено.map((t, i) => `${i + 1}. <b>$${экранHTML(String(t.ticker || "?").toUpperCase())}</b> · ${ИМЯ_СЕТИ[цепочкаТокена(t)]} — <code>${экранHTML(t.address || "—")}</code>`);
  await tg("sendMessage", {
    chat_id: chatId,
    text: [
      `Тикер <b>${экранHTML(String(запрос).toUpperCase())}</b> может носить любой токен — сделка идёт только по конкретному адресу.`,
      "",
      ...строки,
      "",
      "Выбери нужный кнопкой ниже или пришли адрес: <code>/buy АДРЕС СУММА</code>",
    ].join("\n"),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: найдено.map((t) => [{
      text: `$${String(t.ticker || "?").toUpperCase()} · ${ИМЯ_СЕТИ[цепочкаТокена(t)]} · ${String(t.address || "").slice(0, 6)}…`,
      callback_data: `o:t:${t.id}`,
    }]) },
  });
}

/* Экран сделки: сколько спишется и что останется — до того, как деньги
   уйдут. Деньги списываются мгновенно, и промахнуться пальцем по сумме
   человек не должен, поэтому сделка всегда в два касания: выбор и
   подтверждение. Возвращает строку для всплывающей подсказки. */
async function экранСделки(chatId, telegramId, card, покупка, число) {
  const профиль = await кошелёкПоTelegram(telegramId);
  if (!профиль || !профиль.id) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "Аккаунта Mintly у этого Telegram ещё нет. Открой приложение — аккаунт и кошелёк заведутся за минуту.",
      reply_markup: { inline_keyboard: [[{ text: "📱 Открыть Mintly", web_app: { url: APP_URL } }]] },
    });
    return "Сначала открой Mintly";
  }

  const строки = [];
  if (покупка) {
    const к = await кошелёкСети(профиль.id, card.chain);
    if (!к) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "Кошелёк ещё не создан. Открой «Кошелёк» в приложении — он заведётся сразу во всех сетях.",
        reply_markup: { inline_keyboard: [[{ text: "💼 Создать кошелёк", web_app: { url: экранПриложения("wallet") } }]] },
      });
      return "Сначала создай кошелёк";
    }
    const нужно = число + запасНаГаз(card.chain);
    if (к.есть != null && к.есть < нужно) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: [
          "💸 <b>Не хватает на кошельке</b>",
          "",
          `Нужно ${монет(нужно)} ${card.монета} с газом, есть ${монет(к.есть)} ${card.монета}.`,
          "",
          `Пополни кошелёк ${ИМЯ_СЕТИ[card.chain]} — переведи на адрес:`,
          `<code>${экранHTML(к.адрес)}</code>`,
        ].join("\n"),
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "💼 Открыть кошелёк", web_app: { url: экранПриложения("wallet") } }]] },
      });
      return "Пополни кошелёк — адрес прислал";
    }
    строки.push(
      `💳 <b>Покупка $${card.ticker}</b> · ${ИМЯ_СЕТИ[card.chain]}`,
      "",
      `Спишется: <b>${монет(число)} ${card.монета}</b> + газ сети`,
      к.есть != null ? `На кошельке: ${монет(к.есть)} ${card.монета}` : null,
      card.цена > 0 ? `Примерно получишь: ${штук(число / card.цена)} $${card.ticker}` : null,
    );
  } else {
    const есть = await остатокТокена(профиль.id, card).catch(() => 0);
    if (!(есть > 0)) return `На кошельке нет $${card.ticker}`;
    const продаём = число >= 100 ? есть : (есть * число) / 100;
    строки.push(
      `📉 <b>Продажа $${card.ticker}</b> · ${ИМЯ_СЕТИ[card.chain]}`,
      "",
      `Продаём: <b>${штук(продаём)} $${card.ticker}</b> (${число >= 100 ? "всё" : `${число}%`})`,
      card.цена > 0 ? `Примерно получишь: ${монет(продаём * card.цена)} ${card.монета}` : null,
    );
  }
  строки.push("", "Сделка идёт кошельком приложения. Скорость обычная — без наценки.");

  // Одноразовая метка: повторное нажатие той же кнопки не станет второй
  // сделкой, а новая сделка — это новая кнопка (api/_botTrade.js).
  const метка = crypto.randomBytes(4).toString("hex");
  await tg("sendMessage", {
    chat_id: chatId,
    text: строки.filter((с) => с != null).join("\n"),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[
      покупка
        ? { text: `✅ Купить · ${монет(число)} ${card.монета}`, callback_data: `K:${card.ref}:${число}:${метка}` }
        : { text: `✅ Продать · ${число >= 100 ? "всё" : `${число}%`}`, callback_data: `D:${card.ref}:${число}:${метка}` },
      { text: "← Назад", callback_data: `x:${card.ref}` },
    ]] },
  });
  return "";
}

/* Сделка по подтверждению. Экран подтверждения сразу превращается в
   «уходит в сеть» — кнопка исчезает, и второго нажатия по ней уже не
   будет, — а потом в итог с причиной, если сеть отказала. */
async function провестиИзЧата(cb, card, покупка, число, метка) {
  const кто = cb.from && cb.from.id;
  const чат = cb.message ? cb.message.chat.id : кто;
  const профиль = await кошелёкПоTelegram(кто);
  if (!профиль || !профиль.id) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Сначала открой Mintly — аккаунт и кошелёк заведутся за минуту", show_alert: true });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Отправляю…" });
  const место = cb.message ? { chat_id: чат, message_id: cb.message.message_id } : null;
  if (место) await tg("editMessageText", { ...место, text: "⏳ Сделка уходит в сеть…" });

  const итог = await сделкаИзЧата({ userId: профиль.id, card, покупка, сумма: покупка ? число : 0, доля: покупка ? 0 : число, метка });
  const текст = итог.ok
    ? [
      итог.повтор ? "↩️ Эта сделка уже прошла" : покупка ? "✅ <b>Куплено</b>" : "✅ <b>Продано</b>",
      "",
      покупка
        ? `$${card.ticker} · ${монет(итог.монет)} ${card.монета}${итог.штук > 0 ? ` → ≈ ${штук(итог.штук)} $${card.ticker}` : ""}`
        : `$${card.ticker} · ${штук(итог.штук)} шт.${итог.монет > 0 ? ` → ≈ ${монет(итог.монет)} ${card.монета}` : ""}`,
      // В TON перевод подтверждается сетью через несколько секунд, и
      // кошелёк покажет его чуть позже — говорим об этом, чтобы пустой
      // остаток сразу после сделки не читался как потеря.
      card.chain === "ton" ? "Сеть TON подтвердит перевод за несколько секунд." : null,
      итог.ссылка ? `<a href="${итог.ссылка}">Посмотреть в обозревателе</a>` : null,
    ].filter((с) => с != null).join("\n")
    : `⚠️ Не вышло: ${экранHTML(итог.текст)}`;
  const кнопки = { inline_keyboard: [[
    { text: "← К токену", callback_data: `x:${card.ref}` },
    итог.нетКошелька
      ? { text: "💼 Создать кошелёк", web_app: { url: экранПриложения("wallet") } }
      : { text: "💼 Кошелёк", callback_data: "w:" },
  ]] };
  const тело = { text: текст, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: кнопки };
  const правка = место ? await tgCall("editMessageText", { ...место, ...тело }).catch(() => null) : null;
  if (!правка || !правка.ok) await tg("sendMessage", { chat_id: чат, ...тело });
}

/* Покупка командой: /buy АДРЕС 0.1 — адрес токена, потом сумма в монете
   его сети.

   По тикеру покупку не начинаем: тикер никто не занимает, и под одним
   и тем же названием живёт сколько угодно токенов — деньги ушли бы в
   чужой. По тикеру показываем совпадения с адресами, а дальше человек
   выбирает кнопкой. Без суммы показываем карточку с суммами, а не отказ:
   человек мог просто не знать формата. */
async function handleBuyCommand(message, хвост) {
  const { запрос, сумма } = разобратьПокупку(String(хвост || "").trim().split(/\s+/));
  const своё = message.chat.type === "private";

  if (!запрос) {
    await tg("sendMessage", {
      chat_id: message.chat.id,
      text: "Что покупаем? <code>/buy АДРЕС СУММА</code>\nСумма — в монете сети токена: GRAM, SOL, BNB или ETH.\n\nПо тикеру — сперва поиск: <code>/token PRSM</code>",
      parse_mode: "HTML",
    });
    return;
  }

  if (!looksLikeAddress(запрос)) {
    await выборПоТикеру(message.chat.id, запрос);
    return;
  }

  const найдено = (await searchAll(запрос, 3).catch(() => [])).filter((t) => !t.external);
  if (!найдено.length) {
    await tg("sendMessage", { chat_id: message.chat.id, text: `Токена Mintly с таким адресом нет.${ПОДСКАЗКА_СЕТИ}` });
    return;
  }
  const card = await cardFor(найдено[0]);

  if (!своё) {
    // В группе сделок нет — только карточка со ссылкой к боту, где сумма
    // уже вписана.
    await tg("sendMessage", {
      chat_id: message.chat.id,
      text: card.text,
      parse_mode: "HTML",
      link_preview_options: превью(card),
      reply_markup: { inline_keyboard: [[{
        text: сумма > 0 ? `💸 Купить на ${монет(сумма)} ${card.монета}` : "💸 Торговать",
        url: ссылкаБота(меткаПокупки(card.ref, сумма)),
      }]] },
    });
    return;
  }
  if (!card.торгуется) {
    await отправитьКарточку(message.chat.id, card, true, { приписка: "Этот токен сейчас торгуется только в приложении." });
    return;
  }
  if (!(сумма > 0)) {
    await отправитьКарточку(message.chat.id, card, true, { приписка: `Сколько берём? Выбери сумму или напиши: <code>/buy ${экранHTML(запрос)} ${СУММЫ[card.chain][1]}</code>` });
    return;
  }
  await экранСделки(message.chat.id, message.from.id, card, true, сумма);
}

/* Продажа командой: /sell PRSM 50%, /sell PRSM all или /sell АДРЕС 25. */
async function handleSellCommand(message, хвост) {
  const части = String(хвост || "").trim().split(/\s+/).filter(Boolean);
  const запрос = части[0] || "";
  if (!запрос) {
    await tg("sendMessage", {
      chat_id: message.chat.id,
      text: "Что продаём? <code>/sell PRSM 50%</code> или <code>/sell PRSM all</code> — доля от того, что лежит в кошельке.",
      parse_mode: "HTML",
    });
    return;
  }
  if (message.chat.type !== "private") {
    await tg("sendMessage", {
      chat_id: message.chat.id,
      text: "Продажа — в личке с ботом: остаток и списание не для общей переписки.",
      reply_markup: { inline_keyboard: [[{ text: "📉 Продать у бота", url: ссылкаБота("sell") }]] },
    });
    return;
  }
  const строка = (await searchAll(запрос, 3).catch(() => [])).find((t) => !t.external);
  if (!строка) {
    await tg("sendMessage", { chat_id: message.chat.id, text: "Продать отсюда можно токен Mintly — такого не нашлось. Остальное — в приложении." });
    return;
  }
  const card = await cardFor(строка);
  if (!card.торгуется) {
    await отправитьКарточку(message.chat.id, card, true, { приписка: "Этот токен сейчас торгуется только в приложении." });
    return;
  }
  const слово = String(части[1] || "all").toLowerCase().replace("%", "");
  const доля = ["all", "всё", "все", "max"].includes(слово) ? 100 : Math.min(100, Math.max(0, Number(слово.replace(",", ".")) || 0));
  if (!(доля > 0)) {
    await tg("sendMessage", { chat_id: message.chat.id, text: "Сколько продаём? Доля в процентах или «all»: /sell PRSM 50%" });
    return;
  }
  const подсказка = await экранСделки(message.chat.id, message.from.id, card, false, доля);
  if (подсказка) await tg("sendMessage", { chat_id: message.chat.id, text: `${подсказка}.` });
}

/* Нажатия кнопок под сообщениями. Работают и для сообщения из
   подсказки (у него нет чата — только inline_message_id), и для
   обычного ответа на команду. */
async function handleCallback(cb) {
  const данные = String(cb.data || "");

  // Заявка на галочку проверенного лица: «Выдать» / «Отказать» у админа.
  if (данные.startsWith("xv:")) {
    if (данные === "xv:done") { await tg("answerCallbackQuery", { callback_query_id: cb.id }); return; }
    const { кнопкаЗаявки } = await import("./_xverify.js");
    await кнопкаЗаявки(cb);
    return;
  }

  // Кнопки главного меню: у них своих токенов нет, только действие.
  const куда = cb.message ? cb.message.chat.id : cb.from.id;
  if (данные === "w:") {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    await handleWallet(куда, cb.from.id);
    return;
  }
  if (данные === "top:") {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    await handleTop({ chat: { id: куда }, message_id: undefined });
    return;
  }
  if (данные === "new:") {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    await handleNew({ chat: { id: куда, type: cb.message ? cb.message.chat.type : "private" }, message_id: undefined });
    return;
  }

  /* Виды: r — обновить, x — вернуть карточку на место, o — карточку
     отдельным сообщением, k/d — выбор суммы или доли, K/D — подтверждение
     (с одноразовой меткой в конце). b, q и s — кнопки прежних версий:
     они ещё живут в старых сообщениях, поэтому ведут на новые экраны. */
  const m = данные.match(/^([rbxoqskKdD]):([pt]):([^:]+)(?::(\d+(?:\.\d+)?))?(?::([0-9a-f]{6,16}))?$/);
  if (!m) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }
  let действие = m[1];
  const число = Number(m[4]) || 0;
  const метка = m[5] || null;
  if (действие === "q") действие = "k";
  if (действие === "s") действие = "d";
  if (действие === "b") действие = "x";

  let card = null;
  try { card = await cardByRef(m[2], m[3]); } catch (err) { card = null; }
  if (!card) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Не получилось открыть — источник не ответил" });
    return;
  }

  const своё = !!(cb.message && cb.message.chat && cb.message.chat.type === "private");

  if ("kdKD".includes(действие)) {
    // Сделки — только в личке: там бот знает, чей это кошелёк, и никто
    // посторонний не видит остатка.
    if (!своё) {
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Сделки — в личке с ботом", show_alert: true });
      return;
    }
    if (!card.торгуется) {
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Этот токен сейчас торгуется только в приложении", show_alert: true });
      return;
    }
    const покупка = действие === "k" || действие === "K";
    const доля = покупка ? число : Math.min(100, число || 100);
    if (покупка && !(число > 0)) {
      await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Не получилось собрать покупку" });
      return;
    }
    // Подтверждение без метки — кнопка старой версии: переспросим, а не
    // проведём вслепую.
    if ((действие === "K" || действие === "D") && метка) {
      await провестиИзЧата(cb, card, покупка, покупка ? число : доля, метка);
      return;
    }
    const подсказка = await экранСделки(куда, cb.from.id, card, покупка, покупка ? число : доля);
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: подсказка || "", show_alert: !!подсказка && !покупка });
    return;
  }

  if (действие === "o") {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    await отправитьКарточку(куда, card, своё);
    return;
  }

  // «Назад» и «Обновить» перерисовывают сообщение на месте: текст,
  // картинку и кнопки.
  const тело = {
    text: card.text,
    parse_mode: "HTML",
    link_preview_options: превью(card, true),
    reply_markup: tokenButtons(card, своё),
  };
  if (cb.inline_message_id) тело.inline_message_id = cb.inline_message_id;
  else if (cb.message) {
    тело.chat_id = cb.message.chat.id;
    тело.message_id = cb.message.message_id;
  } else {
    await tg("answerCallbackQuery", { callback_query_id: cb.id });
    return;
  }

  const ответ = await tgCall("editMessageText", тело);
  // «Ничего не изменилось» — не сбой: за минуту цена могла не дрогнуть.
  const без = !ответ.ok && String(ответ.description || "").includes("not modified");
  await tg("answerCallbackQuery", {
    callback_query_id: cb.id,
    text: действие === "x" ? "" : ответ.ok ? "Обновлено" : без ? "Без изменений" : "Не получилось обновить",
  });
}

/* Разбор «что покупаем и на сколько».
 *
 * Порядок задуман один — сперва токен, потом сумма: «buy PRSM 5», «buy
 * EQ… 5». Но пальцем в чате легко набрать наоборот, и отвечать на это
 * непониманием глупо: число здесь может быть только суммой, а всё
 * остальное — тикером или адресом.
 */
function разобратьПокупку(части) {
  const слова = (части || []).map((s) => String(s).trim()).filter(Boolean);
  let запрос = "";
  let сумма = 0;
  for (const w of слова) {
    const n = Number(w.replace(",", "."));
    const этоЧисло = Number.isFinite(n) && n > 0 && !looksLikeAddress(w);
    if (этоЧисло && !сумма) { сумма = n; continue; }
    if (!запрос) запрос = w;
  }
  return { запрос, сумма };
}

/* Покупка через упоминание: «@бот buy АДРЕС 0.1».
 *
 * В чужом чате сделки нет: кнопка ведёт в личку к боту, где сумма уже
 * вписана, а подтверждает её тот, кто нажал, своим кошельком приложения.
 */
async function inlineBuy(query, части) {
  const { запрос, сумма } = разобратьПокупку(части);

  if (!запрос || !looksLikeAddress(запрос)) {
    // Тикер к покупке не принимаем: занять его может кто угодно, и деньги
    // ушли бы в чужой токен. Отправляем искать — там карточки с адресами
    // и кнопка «Торговать» у каждой.
    await tg("answerInlineQuery", {
      inline_query_id: query.id,
      cache_time: 30,
      results: [{
        type: "article",
        id: запрос ? "buy-need-address" : "buy-help",
        title: запрос ? "Для покупки нужен адрес токена" : "Покупка: укажи адрес токена и сумму",
        description: запрос ? `Тикер могут носить разные токены. Найди нужный: @${TG_BOT} ${запрос}` : `@${TG_BOT} buy АДРЕС СУММА`,
        thumbnail_url: ЗНАЧОК,
        input_message_content: {
          message_text: [
            `<code>@${TG_BOT} buy АДРЕС 0.1</code> — адрес токена и сумма в монете его сети`,
            "",
            "По тикеру покупка не идёт: одно и то же название носит сколько угодно токенов.",
            `Найти нужный: <code>@${TG_BOT} ${экранHTML(запрос || "PRSM")}</code> — и купить кнопкой в его карточке.`,
          ].join("\n"),
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        },
      }],
    });
    return;
  }

  let найдено = [];
  try { найдено = (await searchAll(запрос, 3)).filter((t) => !t.external); } catch (err) { найдено = []; }
  if (!найдено.length) {
    await tg("answerInlineQuery", { inline_query_id: query.id, cache_time: 20, results: [] });
    return;
  }
  const card = await cardFor(найдено[0]);
  await tg("answerInlineQuery", {
    inline_query_id: query.id,
    cache_time: 15,
    results: [{
      type: "article",
      id: `buy-${сумма || 0}`,
      title: сумма > 0 ? `Купить $${card.ticker} на ${монет(сумма)} ${card.монета}` : `Купить $${card.ticker}`,
      description: "Подтвердить — в личке с ботом",
      thumbnail_url: card.thumb || ЗНАЧОК,
      input_message_content: {
        message_text: card.text,
        parse_mode: "HTML",
        link_preview_options: превью(card),
      },
      reply_markup: { inline_keyboard: [[
        {
          text: сумма > 0 ? `💸 Купить на ${монет(сумма)} ${card.монета}` : "💸 Торговать",
          url: ссылкаБота(меткаПокупки(card.ref, сумма)),
        },
        { text: "🔄 Обновить", callback_data: `r:${card.ref}` },
      ]] },
    }],
  });
}

// Справка для подсказки в чужом чате — та же, что /help, но про чаты.
function справкаПодсказки() {
  return [
    "<b>Mintly в любом чате</b>",
    "",
    `<code>@${TG_BOT} PRSM</code> — карточка токена: цена, капа, путь до биржи и график`,
    `<code>@${TG_BOT} АДРЕС</code> — то же по адресу токена в любой сети`,
    `<code>@${TG_BOT} new</code> — свежие запуски в Mintly`,
    `<code>@${TG_BOT} top</code> — что торгуют прямо сейчас`,
    `<code>@${TG_BOT} buy АДРЕС 0.1</code> — кнопка покупки, подтверждение у бота в личке`,
    "",
    "Ищет токены Mintly в TON, Solana, BNB Chain, Base и Ethereum и всё, что есть в ленте приложения.",
  ].join("\n") + ПОДСКАЗКА_СЕТИ;
}

/* Подсказка в любом чате: «@бот PRSM» или «@бот АДРЕС».
   Пустой запрос показывает свежие запуски Mintly, а за ними — то, что
   торгуют прямо сейчас в ленте рынка. */
async function handleInline(query) {
  const текст = String(query.query || "").trim();

  // В переписке двух людей бота нет, и команды со слэшем туда не
  // доходят — Telegram их ему не передаёт. Поэтому те же слова
  // понимаются и здесь: «@бот top» работает как «/top».
  const слово = текст.toLowerCase();
  if (слово === "help" || слово === "помощь" || слово === "?") {
    await tg("answerInlineQuery", {
      inline_query_id: query.id,
      cache_time: 300,
      results: [{
        type: "article",
        id: "help",
        title: "Что умеет бот",
        description: "Тикер или адрес токена — и в чат уходит его карточка",
        thumbnail_url: ЗНАЧОК,
        input_message_content: { message_text: справкаПодсказки(), parse_mode: "HTML", link_preview_options: { is_disabled: true } },
        reply_markup: { inline_keyboard: [[{ text: "📱 Открыть Mintly", url: ссылкаБота("open") }]] },
      }],
    });
    return;
  }

  // Команды через упоминание: «@бот buy АДРЕС 0.1». Со слэшем они доходят
  // только туда, где бот есть, а упоминание работает в любом чате.
  const слова = текст.split(/\s+/).filter(Boolean);
  const первое = (слова[0] || "").toLowerCase();

  if (первое === "buy" || первое === "купить") {
    await inlineBuy(query, слова.slice(1));
    return;
  }
  if (["sell", "продать", "wallet", "кошелёк", "кошелек"].includes(первое)) {
    // И продажа, и кошелёк — это личное: адрес и остаток нельзя
    // выкладывать в чужой чат. Такие запросы уводим в личку с ботом.
    const продажа = первое === "sell" || первое === "продать";
    await tg("answerInlineQuery", {
      inline_query_id: query.id,
      cache_time: 5,
      is_personal: true,
      results: [],
      button: {
        text: продажа ? "Продажа — открыть у бота" : "Кошелёк — открыть у бота",
        start_parameter: продажа ? "sell" : "wallet",
      },
    });
    return;
  }

  // «top» — то же, что пустой запрос: свежее своё и рынок; «new» — только своё.
  const толькоСвоё = слово === "new" || слово === "новые";
  const запрос = (слово === "top" || слово === "топ" || толькоСвоё) ? "" : текст;

  let найдено = [];
  try {
    найдено = await searchAll(запрос, 8);
    if (!запрос && !толькоСвоё && найдено.length < 8) {
      найдено = [...найдено, ...await trendingExternal(8 - найдено.length).catch(() => [])];
    }
  } catch (err) {
    console.warn("[bot] inline search failed:", err && err.message);
  }

  // Первые три собираем со сводкой — и все три разом: каждая — это поход
  // в цепочку, а ответить Telegram нужно быстро. Остальные показываем
  // строкой, цифры человек увидит, когда выберет.
  const подробности = await Promise.all(
    найдено.slice(0, 3).map((т) => cardFor(т).catch(() => null)),
  );

  const карточки = [];
  for (const [i, токен] of найдено.entries()) {
    // Сводка идёт в цепочку и на биржу — любая из них может не
    // ответить. Молчать всем списком из-за одного токена нельзя:
    // тогда в чате пусто, будто ничего не нашлось.
    const подробно = i < 3 ? подробности[i] : null;
    if (подробно) {
      карточки.push(подробно);
      continue;
    }
    const цепь = токен.external ? (токен.chain === "solana" ? "solana" : "ton") : цепочкаТокена(токен);
    const метка = токен.external ? `pool_${токен.pool_address}` : `tok_${токен.id}`;
    карточки.push({
      ref: токен.external ? `p:${токен.pool_address}` : `t:${токен.id}`,
      title: `$${String(токен.ticker || "").toUpperCase()} — ${токен.name || ""}`,
      description: `${ИМЯ_СЕТИ[цепь]} · открыть карточку`,
      text: `${токен.emoji || (токен.external ? "🪙" : "🚀")} <b>${экранHTML(токен.name || "")}</b> · $${экранHTML(String(токен.ticker || "").toUpperCase())}\n\n⛓ ${ИМЯ_СЕТИ[цепь]}`,
      link: `${APP_URL}?${токен.external ? `pool=${токен.pool_address}` : `token=${токен.id}`}`,
      botLink: ссылкаБота(метка),
      // Без сводки неизвестно, открыта ли кривая, — торговать позовём из
      // лички, где карточка соберётся целиком.
      торгуется: !токен.external,
      thumb: токен.logo_url || null,
    });
  }

  const results = карточки.map((c, i) => ({
    type: "article",
    id: String(i),
    title: c.title,
    description: c.description,
    thumbnail_url: c.thumb || ЗНАЧОК,
    input_message_content: {
      message_text: c.text,
      parse_mode: "HTML",
      // График едет отдельной картинкой поверх текста: так его видно
      // сразу, без единого касания. Ссылку задаём явно — в самом тексте
      // её нет, и искать первую попавшуюся Telegram не должен.
      link_preview_options: превью(c),
    },
    reply_markup: tokenButtons(c, false),
  }));

  await tg("answerInlineQuery", {
    inline_query_id: query.id,
    results,
    // Кэш короткий: цена меняется с каждой сделкой, и вчерашняя
    // подсказка врала бы прямо в чужом чате.
    cache_time: 20,
    is_personal: false,
    button: !results.length
      ? { text: "Ничего не нашлось — открыть Mintly", web_app: { url: APP_URL } }
      : undefined,
  });
}

/* Монета из сообщения.
 *
 * Реплай на любой мем в чате командой /mint — и бот собирает из него
 * черновик запуска: имя из первых слов, тикер из них же, описание —
 * текст целиком, картинка — фотография сообщения. Дальше человек
 * открывает приложение по кнопке, видит форму уже заполненной и
 * правит, что хочет.
 *
 * Черновик живёт в базе, а не в ссылке: подпись к фото бывает длиннее,
 * чем весь допустимый параметр запуска, да и картинку туда не положишь.
 */
const СТОП_СЛОВА = new Set(["это", "как", "что", "the", "and", "for", "его", "она", "они", "мне", "нас", "вот", "так"]);

function тикерИзТекста(текст) {
  const слова = String(текст || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((с) => с.length > 2 && !СТОП_СЛОВА.has(с.toLowerCase()));
  const основа = (слова[0] || "MEME").toUpperCase();
  // Кириллицу переводим в латиницу: тикер должен читаться в любом
  // кошельке и на любой бирже.
  const карта = { А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "E", Ж: "J", З: "Z", И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "CH", Ш: "SH", Щ: "SCH", Ъ: "", Ы: "Y", Ь: "", Э: "E", Ю: "YU", Я: "YA" };
  const латиницей = [...основа].map((б) => (карта[б] !== undefined ? карта[б] : б)).join("");
  return латиницей.replace(/[^A-Z0-9]/g, "").slice(0, 8) || "MEME";
}

function имяИзТекста(текст) {
  const строка = String(текст || "").replace(/\s+/g, " ").trim();
  if (!строка) return "Мем из чата";
  const слова = строка.split(" ").slice(0, 4).join(" ");
  return слова.slice(0, 32);
}

/* Картинку кладём к себе: ссылка Telegram на файл живёт час и несёт в
   себе токен бота — отдавать её наружу нельзя. */
async function картинкуВХранилище(fileId) {
  const db = adminClient();
  if (!fileId || !db) return null;
  try {
    const файл = await tgCall("getFile", { file_id: fileId });
    const путьTG = файл && файл.result && файл.result.file_path;
    if (!путьTG) return null;
    const ответ = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${путьTG}`);
    if (!ответ.ok) return null;
    const байты = Buffer.from(await ответ.arrayBuffer());
    const имя = `drafts/${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from("avatars").upload(имя, байты, { contentType: "image/jpeg", upsert: true });
    if (error) return null;
    const { data } = db.storage.from("avatars").getPublicUrl(имя);
    return (data && data.publicUrl) || null;
  } catch {
    return null;
  }
}

// Кнопка к черновику: в личке — сразу форма в приложении, в группе —
// через личку с ботом (web_app-кнопки там запрещены).
function кнопкаЧерновика(id, своё) {
  if (!id) return своё ? { text: "🚀 Запустить монету", web_app: { url: экранПриложения("create") } } : { text: "🚀 Запустить монету", url: ссылкаБота("open") };
  return своё
    ? { text: "🚀 Запустить монету", web_app: { url: `${APP_URL}?draft=${id}` } }
    : { text: "🚀 Запустить монету", url: ссылкаБота(`draft_${id}`) };
}

async function handleMintCommand(message, хвост) {
  const chatId = message.chat.id;
  const исходное = message.reply_to_message;
  const текст = (хвост && хвост.trim())
    || (исходное && (исходное.text || исходное.caption))
    || "";

  if (!исходное && !текст) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "Ответь этой командой на любое сообщение — соберу из него монету. Или напиши: /mint название монеты.",
    });
    return;
  }

  const фото = исходное && Array.isArray(исходное.photo) && исходное.photo.length
    ? исходное.photo[исходное.photo.length - 1].file_id
    : null;
  const лого = await картинкуВХранилище(фото);

  const черновик = {
    name: имяИзТекста(текст),
    ticker: тикерИзТекста(текст),
    description: String(текст || "").slice(0, 400),
    logo_url: лого,
    author_tg: String(message.from.id),
    chat_id: String(chatId),
    source_message_id: исходное ? исходное.message_id : message.message_id,
  };

  const db = adminClient();
  let id = null;
  if (db) {
    const { data, error } = await db.from("launch_drafts").insert(черновик).select("id").single();
    if (!error && data && data.id) id = data.id;
  }

  await tg("sendMessage", {
    chat_id: chatId,
    reply_to_message_id: исходное ? исходное.message_id : undefined,
    parse_mode: "HTML",
    text: [
      "<b>Монета из этого сообщения</b>",
      "",
      `Название: <b>${экранHTML(черновик.name)}</b>`,
      `Тикер: <b>$${экранHTML(черновик.ticker)}</b>`,
      лого ? "Картинка: из сообщения" : "Картинку добавишь в приложении",
      "",
      "Открой Mintly — форма уже заполнена: выбери сеть и нажми «Запустить».",
    ].join("\n"),
    reply_markup: { inline_keyboard: [[кнопкаЧерновика(id, message.chat.type === "private")]] },
  });
}

/* Команда в чате или в личке: /token PRSM, /p АДРЕС. Найденное можно
   передать готовым — так поиск из простого сообщения в личке не ходит в
   базу дважды. */
async function handleTokenCommand(message, запрос, готовое = null) {
  const chat = message.chat || {};
  // Личка с ботом — единственное место, где Telegram пускает кнопку,
  // открывающую мини-приложение прямо из сообщения, и где идёт сделка.
  const своё = chat.type === "private";
  const текст = String(запрос || "").trim();

  if (!текст) {
    await tg("sendMessage", {
      chat_id: chat.id,
      reply_to_message_id: message.message_id,
      text: `Напиши тикер или адрес: <code>/token PRSM</code>\nИли прямо в любом чате: <code>@${TG_BOT} PRSM</code>`,
      parse_mode: "HTML",
    });
    return;
  }

  const найдено = готовое || await searchAll(текст, 5).catch(() => []);
  if (!найдено.length) {
    await tg("sendMessage", {
      chat_id: chat.id,
      reply_to_message_id: message.message_id,
      text: `Ничего не нашлось — ни среди токенов Mintly, ни в ленте рынка. Проверь тикер или пришли адрес токена.${ПОДСКАЗКА_СЕТИ}`,
    });
    return;
  }

  const card = await cardFor(найдено[0]);
  // Нашлось несколько — остальные перечисляем строкой, чтобы человек не
  // гадал, тот ли токен ему показали.
  const ещё = найдено.slice(1, 5).map((t) => `$${экранHTML(String(t.ticker || "").toUpperCase())}`).join(" · ");
  await отправитьКарточку(chat.id, card, своё, { ответНа: message.message_id, приписка: ещё ? `Также нашлось: ${ещё}` : "" });
}

const деньгиКоротко = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

function давно(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const мин = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (мин < 1) return "только что";
  if (мин < 60) return `${мин} мин назад`;
  const ч = Math.floor(мин / 60);
  if (ч < 24) return `${ч} ч назад`;
  return `${Math.floor(ч / 24)} дн назад`;
}

/* Свежие запуски в Mintly — во всех сетях разом. Каждый — своей кнопкой:
   нажал, и карточка приходит отдельным сообщением, а список остаётся. */
async function handleNew(message) {
  const chat = message.chat || {};
  let свежие = [];
  try { свежие = await findTokens("", 8); } catch (err) { свежие = []; }
  if (!свежие.length) {
    await tg("sendMessage", {
      chat_id: chat.id,
      text: `Пока ни одного запуска. Будь первым — токен запускается за минуту.${ПОДСКАЗКА_СЕТИ}`,
      reply_markup: { inline_keyboard: [[chat.type === "private"
        ? { text: "🚀 Запустить токен", web_app: { url: экранПриложения("create") } }
        : { text: "🚀 Запустить токен", url: ссылкаБота("open") }]] },
    });
    return;
  }
  const строки = свежие.map((t, i) => `${i + 1}. <b>$${экранHTML(String(t.ticker || "?").toUpperCase())}</b> · ${ИМЯ_СЕТИ[цепочкаТокена(t)]} — ${давно(t.created_at)}`);
  await tg("sendMessage", {
    chat_id: chat.id,
    reply_to_message_id: message.message_id,
    text: ["🆕 <b>Свежие запуски в Mintly</b>", "", ...строки].join("\n") + ПОДСКАЗКА_СЕТИ,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: свежие.map((t) => [{
      text: `$${String(t.ticker || "?").toUpperCase()} · ${ИМЯ_СЕТИ[цепочкаТокена(t)]}`,
      callback_data: `o:t:${t.id}`,
    }]) },
  });
}

/* Топ — картинкой и списком, оба из одного места.
 *
 * Раньше в списке были свои токены, а потом чем придётся добитая лента
 * бирж: порядок ни о чём не говорил, и «топ» им был только по названию.
 * Теперь и картинка, и подпись собираются из одной пятёрки по обороту за
 * сутки, поэтому расходиться им негде — что нарисовано, то и написано. */
async function handleTop(message) {
  const chat = message.chat || {};
  let строки = [];
  try {
    const { топСтроки } = await import("./_topcard.js");
    строки = await топСтроки(adminClient());
  } catch (err) {
    console.warn("[bot] топ не собрался:", err && err.message);
  }
  if (!строки.length) {
    await tg("sendMessage", { chat_id: chat.id, text: "Лента рынка сейчас пустая — загляни через минуту." });
    return;
  }

  const текст = [
    "🔥 <b>Мемкоины в тренде</b>",
    "",
    ...строки.map((т, i) => {
      const знак = т.движение >= 0 ? "+" : "";
      const сеть = т.сеть === "solana" ? "Solana" : "TON";
      return `${i + 1}. <b>$${экранHTML(т.тикер)}</b> · ${сеть} — ${знак}${т.движение.toFixed(1)}% · ${деньгиКоротко(т.объём)} за сутки`;
    }),
    "",
    "🔎 Подробнее о токене: <code>/token ТИКЕР</code>",
  ].join("\n");

  const кнопки = { inline_keyboard: [[{ text: "🆕 Свежие в Mintly", callback_data: "new:" }, { text: "📱 Открыть Mintly", url: ссылкаБота("open") }]] };

  // Картинка рисуется заново под эту самую пятёрку, поэтому слепок
  // (file_id) ей не подходит: он вернул бы вчерашний список.
  try {
    const { картинкаТопа } = await import("./_topcard.js");
    const байты = await картинкаТопа(строки, АДРЕС_КАРТИНОК);
    if (байты) {
      const ответ = await tgПоФайлу("sendPhoto", {
        chat_id: chat.id,
        caption: текст,
        parse_mode: "HTML",
        reply_markup: кнопки,
      }, байты, "top.png");
      if (ответ && ответ.ok) return;
      console.warn("[bot] топ картинкой не ушёл:", ответ && ответ.description);
    }
  } catch (err) {
    console.warn("[bot] топ картинкой не ушёл:", err && err.message);
  }

  // Запасной путь — текстом.
  await tg("sendMessage", {
    chat_id: chat.id,
    reply_to_message_id: message.message_id,
    text: текст,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: кнопки,
  });
}

/* Команды кнопками под полем ввода.
 *
 * В <code> они только копировались в буфер — дальше человек должен был
 * сам вставить и отправить. Обычная клавиатура отправляет свой текст
 * сообщением сразу, поэтому команды в ней и живут; в тексте они остаются
 * без разметки, и Telegram делает их ссылками сам.
 *
 * Подсказку (@бот PRSM) так не отправить: она не сообщение, а запрос в
 * поле ввода, и Telegram умеет только подставить её туда — этим занята
 * отдельная кнопка «Найти токен» под приветствием. */
function командныеКнопки(своё) {
  return {
    keyboard: [
      [{ text: "/new" }, { text: "/top" }],
      [{ text: "/wallet" }, { text: "/help" }],
    ],
    resize_keyboard: true,
    // В группе клавиатура появляется только у того, кто спросил: в общей
    // переписке чужие кнопки под полем ввода — это мусор.
    selective: !своё,
  };
}

async function handleHelp(message) {
  const chat = message.chat || {};
  const своё = chat.type === "private";
  await tg("sendMessage", {
    chat_id: chat.id,
    // В группе клавиатура с selective привязывается к ответу — без него
    // Telegram не поймёт, кому её показывать.
    reply_to_message_id: своё ? undefined : message.message_id,
    text: [
      "<b>Что умеет бот</b>",
      "",
      "В любом чате — добавлять бота туда не нужно:",
      `<code>@${TG_BOT} PRSM</code> — карточка токена: цена, капа, путь до биржи и график`,
      `<code>@${TG_BOT} new</code> — свежие запуски · <code>@${TG_BOT} top</code> — в тренде`,
      "",
      "В личке с ботом:",
      "/token PRSM — карточка по тикеру или адресу, с кнопками сделки",
      "/buy АДРЕС 0.1 — купить на сумму в монете сети токена",
      "/sell PRSM 50% — продать долю (или all)",
      "/wallet — кошелёк приложения во всех сетях",
      "/new — свежие запуски · /top — мемкоины в тренде",
      "/mint — ответом на сообщение: монета из него",
      "",
      "Можно и без команд: пришли тикер или адрес — покажу токен.",
      "Сделки идут кошельком приложения — тем же, что в «Кошельке» Mintly. Запуск токена, вывод, обмен и биржа — в приложении.",
    ].join("\n") + ПОДСКАЗКА_СЕТИ,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: командныеКнопки(своё),
  });
}

/* Кнопки под приветствием. Отдельной команды меню больше нет: всё, что
   человек делает в переписке, начинается с /start — и это ровно те же
   кнопки, что раньше открывались вторым шагом. */
function menuButtons() {
  return {
    inline_keyboard: [
      [{ text: "🔍 Найти токен", switch_inline_query_current_chat: "" }],
      [{ text: "💼 Кошелёк", callback_data: "w:" }, { text: "🔥 В тренде", callback_data: "top:" }],
      [{ text: "🆕 Новые запуски", callback_data: "new:" }, { text: "🚀 Создать токен", web_app: { url: экранПриложения("create") } }],
      [{ text: "📱 Открыть Mintly", web_app: { url: APP_URL } }],
    ],
  };
}

/* Кошелёк — кошелёк приложения во всех сетях: TON, Solana и общий адрес
   EVM с остатками в BNB Chain, Base и Ethereum. Раньше здесь был адрес
   внешнего TON-кошелька из профиля и привязка руками — кошелёк
   приложения давно свой, и тот экран показывал не те деньги. */
async function handleWallet(chatId, telegramId) {
  const профиль = await кошелёкПоTelegram(telegramId);
  if (!профиль || !профиль.id) {
    await картинкойСТекстом(chatId, "wallet.png", [
      "<b>💼 Кошелёк Mintly</b>",
      "",
      "Аккаунта Mintly у этого Telegram ещё нет.",
      "",
      "Открой приложение — аккаунт и кошелёк заведутся за минуту, сразу во всех сетях: TON, Solana, BNB Chain, Base и Ethereum.",
    ].join("\n"), { inline_keyboard: [[{ text: "📱 Открыть Mintly", web_app: { url: APP_URL } }]] });
    return;
  }

  const [к, токены] = await Promise.all([
    кошелькиЧеловека(профиль.id).catch(() => ({ пусто: true })),
    токеныЧеловека(профиль.id).catch(() => []),
  ]);
  if (к.пусто) {
    await картинкойСТекстом(chatId, "wallet.png", [
      "<b>💼 Кошелёк Mintly</b>",
      "",
      "Кошелёк ещё не создан.",
      "",
      "Открой «Кошелёк» в приложении — он заведётся сразу во всех сетях, со своей секретной фразой. Ключей бот не спрашивает и не видит.",
    ].join("\n"), { inline_keyboard: [[{ text: "💼 Создать кошелёк", web_app: { url: экранПриложения("wallet") } }]] });
    return;
  }

  // Остаток, которого сеть не отдала, — прочерк: ноль читался бы как «пусто».
  const сумма = (v, монета, знаков) => (v == null ? `— ${монета}` : `${Number(v).toFixed(знаков)} ${монета}`);
  const строки = ["<b>💼 Кошелёк Mintly</b>"];
  if (к.ton) {
    строки.push("", `💎 <b>TON</b> · ${сумма(к.ton.баланс, "GRAM", 3)}`, `<code>${экранHTML(к.ton.address)}</code>`);
  }
  if (к.solana) {
    строки.push("", `◎ <b>Solana</b> · ${сумма(к.solana.баланс, "SOL", 4)}`, `<code>${экранHTML(к.solana.address)}</code>`);
  }
  if (к.evm) {
    const с = к.evm.сети || {};
    строки.push(
      "",
      "⬡ <b>EVM</b> — один адрес на три сети",
      `<code>${экранHTML(к.evm.address)}</code>`,
      `BNB Chain · ${сумма(с.bsc, "BNB", 4)}`,
      `Base · ${сумма(с.base, "ETH", 5)}`,
      `Ethereum · ${сумма(с.eth, "ETH", 5)}`,
    );
  }
  строки.push("", "🪙 <b>Токены</b>");
  if (токены.length) {
    for (const т of токены) строки.push(`• $${экранHTML(т.ticker || "?")} — ${штук(т.штук)} · ${ИМЯ_СЕТИ[т.chain]}`);
  } else {
    строки.push("Пока нет — купи первый: пришли тикер или адрес токена.");
  }
  строки.push("", "Пополнить — переведи на адрес нужной сети. Вывод, обмен между сетями и история — в приложении.");

  await картинкойСТекстом(chatId, "wallet.png", строки.join("\n") + ПОДСКАЗКА_СЕТИ, {
    inline_keyboard: [
      [{ text: "🔄 Обновить", callback_data: "w:" }, { text: "💼 Открыть кошелёк", web_app: { url: экранПриложения("wallet") } }],
    ],
  });
}

/* Сообщение с картинкой сверху.
 *
 * У подписи под фотографией предел в тысячу с небольшим знаков, а
 * кошелёк с десятком жетонов в него не всегда влезает. Тогда шлём двумя
 * сообщениями: картинку и текст под ней — выглядит так же, а обрезать
 * список токенов не приходится. Не отдал Telegram картинку — остаётся
 * текст: без баннера кошелёк читается, без текста нет. */
async function картинкойСТекстом(chatId, файл, текст, клавиатура) {
  const ПРЕДЕЛ_ПОДПИСИ = 1024;
  const снимок = await снимокФайла(файл);

  const послать = async (тело) => {
    if (!снимок) return false;
    try {
      const ответ = снимок.id
        ? await tgCall("sendPhoto", { ...тело, photo: снимок.id })
        : await tgПоФайлу("sendPhoto", тело, снимок.байты, файл);
      if (ответ && ответ.ok) {
        запомнитьСнимок(файл, ответ);
        return true;
      }
      console.warn("[bot] sendPhoto отказ:", файл, ответ && ответ.description);
      // Запомненный слепок мог протухнуть (картинку перерисовали, бота
      // перезапустили): забываем и на следующий раз загрузим заново.
      снимки.delete(файл);
    } catch (err) {
      console.warn("[bot] sendPhoto не дошёл:", файл, err && err.message);
    }
    return false;
  };

  if (текст.length <= ПРЕДЕЛ_ПОДПИСИ) {
    const вышло = await послать({ chat_id: chatId, caption: текст, parse_mode: "HTML", reply_markup: клавиатура });
    if (вышло) return;
  } else {
    await послать({ chat_id: chatId });
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: текст,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: клавиатура,
  });
}

/* Картинки бот загружает сам, а не даёт Telegram ссылку.
 *
 * Со ссылкой всё зависит от того, дойдёт ли Telegram до нашего домена и
 * тем ли он окажется: переезд на новый адрес однажды уже оставил бота
 * без баннеров, и заметить это было нечем. Отправка файлом убирает
 * посредника целиком.
 *
 * Первая отправка загружает байты, дальше Telegram отдаёт слепок
 * (file_id) — по нему то же фото уходит мгновенно и без трафика. Слепок
 * у каждого бота свой: после смены бота память процесса начинается
 * заново, и первая отправка снова идёт файлом. */
const снимки = new Map();

async function снимокФайла(имя) {
  const готовый = снимки.get(имя);
  if (готовый && готовый.id) return готовый;
  try {
    const ответ = await fetch(`${АДРЕС_КАРТИНОК}/${имя}`);
    if (!ответ.ok) {
      console.warn("[bot] картинка не отдалась:", имя, ответ.status);
      return null;
    }
    return { байты: Buffer.from(await ответ.arrayBuffer()) };
  } catch (err) {
    console.warn("[bot] картинка не забралась:", имя, err && err.message);
    return null;
  }
}

function запомнитьСнимок(имя, ответ) {
  const фото = ответ && ответ.result && ответ.result.photo;
  if (!Array.isArray(фото) || !фото.length) return;
  снимки.set(имя, { id: фото[фото.length - 1].file_id });
}

/* Отправка файлом: multipart вместо json. */
async function tgПоФайлу(method, поля, байты, имя) {
  const форма = new FormData();
  for (const [ключ, значение] of Object.entries(поля)) {
    if (значение == null) continue;
    форма.append(ключ, typeof значение === "object" ? JSON.stringify(значение) : String(значение));
  }
  форма.append("photo", new Blob([байты], { type: "image/png" }), имя);
  const ответ = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { method: "POST", body: форма });
  return ответ.json();
}

/* «/wallet UQ…» — привязка внешнего кошелька из прежних версий. Деньги
   давно живут в кошельке приложения, и чужой адрес здесь ничего не
   включает — объясняем это вместо молчаливого «сохранено». */
async function handleWalletSet(message) {
  await tg("sendMessage", {
    chat_id: message.chat.id,
    text: "Привязывать внешний кошелёк больше не нужно: у Mintly свой кошелёк во всех сетях — пополни его со своего адреса. Посмотреть адреса и остатки — /wallet.",
  });
}

const ПРИВЕТСТВИЕ = [
  "Добро пожаловать в Mintly 👋",
  "",
  "Мемкоины в пяти сетях — TON, Solana, BNB Chain, Base и Ethereum — прямо в Telegram.",
  "",
  "🚀 Свой токен за минуту",
  "💸 Покупка и продажа в пару касаний — здесь, в чате, или в приложении",
  "💼 Один кошелёк сразу во всех сетях",
  "⚡️ 0% с покупок и продаж",
  "🎁 Монеты за друзей и достижения",
  "",
  `Найди токен кнопкой ниже или напиши в любом чате @${TG_BOT} и тикер.`,
].join("\n") + ПОДСКАЗКА_СЕТИ;

async function welcome(chatId) {
  // Кнопка открывает приложение прямо из чата, минуя короткое имя
  // мини-приложения: если оно не задано в BotFather, ссылка вида
  // t.me/бот/приложение просто открывает бота, и человек упирается в
  // тупик. Метка ему в кнопке уже не нужна — она лежит в базе и будет
  // взята при создании профиля.
  //
  // Первым идёт баннер: простая картинка со знаком и парой обещаний, без
  // графиков и цифр — в ленте чата её показывают шириной с пузырь, и всё
  // сложное там ужимается до нечитаемого. Не ушла картинка — приветствие
  // всё равно доходит текстом.
  await картинкойСТекстом(chatId, "start.png", ПРИВЕТСТВИЕ, menuButtons());
}

/* Подключение обработчика к боту — со стороны сервера. Ту же операцию
   можно сделать вручную запросом к Telegram, но там приходится
   переносить токен бота руками, а он длинный и его легко испортить при
   копировании: лишний пробел или обрезанный хвост дают невнятное «Not
   Found». Здесь токен уже есть в окружении, поэтому достаточно открыть
   адрес со своим секретом:
     https://<домен>/api/telegram-bot?setup=<TELEGRAM_WEBHOOK_SECRET>
   Заодно ставится визитка бота — описание, команды и кнопка меню: после
   смены бота они пустые, и человек видел голый профиль. В ответ приходит
   имя бота, состояние подключения и то, чего Bot API сделать не может. */
async function setup(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = `https://${host}/api/telegram-bot`;
  try {
    const me = await tgCall("getMe");
    if (!me.ok) {
      return res.status(502).json({
        error: "bad_bot_token",
        подсказка: "TELEGRAM_BOT_TOKEN в переменных окружения не принят Telegram",
        ответ: me,
      });
    }
    const set = await tgCall("setWebhook", {
      url,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message", "inline_query", "callback_query"],
    });
    const { оформитьБота } = await import("./_botProfile.js");
    const визитка = await оформитьБота(tgCall, { бот: me.result.username, адрес: APP_URL }).catch((e) => ({ ошибка: e && e.message }));
    const info = await tgCall("getWebhookInfo");
    const осталось = [];
    if (!me.result.supports_inline_queries) осталось.push("@BotFather → /setinline → выбрать бота → «тикер или адрес токена»");
    if (!me.result.has_main_web_app) осталось.push(`@BotFather → /mybots → бот → Bot Settings → Configure Mini App → ${APP_URL}`);
    return res.status(set.ok ? 200 : 502).json({
      бот: me.result.username,
      подключено: !!set.ok,
      адрес: url,
      визитка,
      осталось,
      состояние: info.result || info,
    });
  } catch (err) {
    return res.status(500).json({ error: "setup_failed", detail: err && err.message });
  }
}

// Сети, из которых приходят вебхуки (core.telegram.org/bots/webhooks).
// Адрес клиента ставит server/index.mjs по X-Real-IP от nginx.
function изСетиTelegram(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim().replace(/^::ffff:/, "");
  const ч = ip.split(".").map(Number);
  if (ч.length !== 4 || ч.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const n = ((ч[0] * 256 + ч[1]) * 256 + ч[2]) * 256 + ч[3];
  const в = (a, b, c, маска) => Math.floor(n / 2 ** (32 - маска)) === Math.floor((((a * 256 + b) * 256 + c) * 256) / 2 ** (32 - маска));
  return в(149, 154, 160, 20) || в(91, 108, 4, 22);
}

// Похоже ли сообщение в личке на тикер или адрес: тогда это поиск, а не
// разговор. Длинные фразы и вопросы уводим в поддержку.
function похожеНаТокен(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 64) return false;
  return looksLikeAddress(t) || /^\$?[\p{L}\p{N}_-]{1,20}$/u.test(t);
}

export default async function handler(req, res) {
  запомнитьАдрес(req);

  // Настройка идёт обычной ссылкой в браузере, поэтому GET здесь
  // разрешён — но только со знанием секрета.
  if (req.method === "GET") {
    const параметры = new URL(req.url, "https://x").searchParams;
    // Проверка поиска: видно, что нашлось у себя, что на рынке и чем
    // источник ответил. Без этого пустой список в чате не отличить от
    // отказа источника.
    if (параметры.get("probe")) {
      if (!WEBHOOK_SECRET || параметры.get("probe") !== WEBHOOK_SECRET) return res.status(401).json({ error: "bad_secret" });
      const q = параметры.get("q") || "";
      const { findExternal, gtLast } = await import("./_market.js");
      let свои = [];
      let ошибкаСвоих = null;
      try { свои = await findTokens(q, 8); } catch (err) { ошибкаСвоих = err && err.message; }
      let чужие = [];
      let ошибкаЧужих = null;
      try { чужие = q ? await findExternal(q, 5) : await trendingExternal(5); } catch (err) { ошибкаЧужих = err && err.message; }
      return res.status(200).json({
        запрос: q,
        свои: свои.map((t) => `${t.ticker} · ${t.chain || "ton"} · ${t.network}`),
        ошибкаСвоих,
        рынок: чужие.map((t) => `${t.ticker} ${t.name} · ${t.chain}`),
        ошибкаЧужих,
        последнийЗапросКБирже: gtLast,
      });
    }
    const asked = параметры.get("setup");
    if (!WEBHOOK_SECRET) return res.status(500).json({ error: "no_webhook_secret" });
    if (asked !== WEBHOOK_SECRET) return res.status(401).json({ error: "bad_secret" });
    if (!BOT_TOKEN) return res.status(500).json({ error: "server_not_configured" });
    return setup(req, res);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  /* Без секрета Telegram ничем не подписывает обновления, и раньше их
     тогда принимали от кого угодно: подделанное сообщение «от» любого
     человека проходило как настоящее. Нет секрета — пускаем только
     адреса, с которых Telegram шлёт вебхуки. */
  if (WEBHOOK_SECRET ? req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET : !изСетиTelegram(req)) {
    return res.status(401).json({ error: "bad_secret" });
  }
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "server_not_configured" });
  }

  let update;
  try {
    update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (err) {
    // Ответ всегда успешный: на ошибку Telegram будет слать это же
    // обновление снова и снова.
    return res.status(200).json({ ok: true });
  }

  // Нажали кнопку под сообщением.
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return res.status(200).json({ ok: true });
  }

  // Подсказка из чужого чата: бота там нет, есть только упоминание.
  if (update.inline_query) {
    await handleInline(update.inline_query);
    return res.status(200).json({ ok: true });
  }

  // Правки чужих сообщений разбирать нечего: ответ уже ушёл, а вопрос
  // уже в чате команды.
  const message = update.message;
  const text = message && typeof message.text === "string" ? message.text.trim() : "";
  const from = message && message.from;
  const chat = (message && message.chat) || {};
  if (!from || !message) return res.status(200).json({ ok: true });

  // Узнать id чата. Нужно ровно один раз — чтобы задать SUPPORT_CHAT_ID,
  // — но работать должно в любом чате, в том числе до того, как эта
  // переменная задана.
  if (text === "/id" || text.startsWith("/id@")) {
    await tg("sendMessage", { chat_id: chat.id, text: `id этого чата: ${chat.id}` });
    return res.status(200).json({ ok: true });
  }

  // Команды про токены работают везде: и в личке, и в группе, куда
  // бота добавили. Суффикс «@имя_бота» Telegram дописывает сам, когда в
  // группе несколько ботов.
  const команда = text.match(/^\/([a-zа-яё_]+)(?:@([\w_]+))?(?:\s+([\s\S]*))?$/i);
  if (команда) {
    const имя = команда[1].toLowerCase();
    const кому = команда[2];
    // Команда, адресованная другому боту, — не наше дело.
    if (!кому || кому.toLowerCase() === TG_BOT.toLowerCase()) {
      const хвост = команда[3] || "";
      if (имя === "token" || имя === "t" || имя === "price" || имя === "p") {
        await handleTokenCommand(message, хвост);
        return res.status(200).json({ ok: true });
      }
      if (имя === "buy" || имя === "b") {
        await handleBuyCommand(message, хвост);
        return res.status(200).json({ ok: true });
      }
      if (имя === "sell" || имя === "s") {
        await handleSellCommand(message, хвост);
        return res.status(200).json({ ok: true });
      }
      if (имя === "wallet" || имя === "w") {
        if (хвост.trim()) await handleWalletSet(message);
        // Остатки и адреса — не для общей переписки: в группе зовём в личку.
        else if (chat.type !== "private") {
          await tg("sendMessage", {
            chat_id: chat.id,
            reply_to_message_id: message.message_id,
            text: "Кошелёк — в личке с ботом: адреса и остатки не для общей переписки.",
            reply_markup: { inline_keyboard: [[{ text: "💼 Открыть у бота", url: ссылкаБота("wallet") }]] },
          });
        } else await handleWallet(chat.id, from.id);
        return res.status(200).json({ ok: true });
      }
      if (имя === "new" || имя === "новые") {
        await handleNew(message);
        return res.status(200).json({ ok: true });
      }
      if (имя === "mint" || имя === "монета" || имя === "m") {
        await handleMintCommand(message, команда[3] || "");
        return res.status(200).json({ ok: true });
      }
      if (имя === "top") {
        await handleTop(message);
        return res.status(200).json({ ok: true });
      }
      // Галочка проверенного лица — выдать или снять по нику X (админы).
      if (имя === "verify" || имя === "unverify") {
        const { командаАдмина } = await import("./_xverify.js");
        await командаАдмина(message, имя === "verify", хвост);
        return res.status(200).json({ ok: true });
      }
      if (имя === "help") {
        await handleHelp(message);
        return res.status(200).json({ ok: true });
      }
    }
  }

  // Служебный чат команды: всё, что здесь пишут реплаем, — ответы людям.
  if (SUPPORT_CHAT_ID && String(chat.id) === String(SUPPORT_CHAT_ID)) {
    await handleTeamReply(message);
    return res.status(200).json({ ok: true });
  }

  // Личка: тикер или адрес — это поиск; остальное, кроме «/start», —
  // разговор, и бот отвечает подсказкой: поддержка живёт в приложении,
  // где вопрос привязан к аккаунту и ответ есть куда вернуть.
  if (!text.startsWith("/start")) {
    if (chat.type === "private" && text) {
      if (похожеНаТокен(text)) {
        const найдено = await searchAll(text, 5).catch(() => []);
        if (найдено.length) {
          await handleTokenCommand(message, text, найдено);
          return res.status(200).json({ ok: true });
        }
      }
      await tg("sendMessage", {
        chat_id: chat.id,
        text: [
          "Пришли тикер или адрес токена — покажу карточку. Или выбери кнопкой ниже.",
          "",
          "Если что-то не работает или есть вопрос, напиши в приложении: меню → «Поддержка». Ответ вернётся и сюда, и в саму переписку внутри Mintly.",
        ].join("\n"),
        reply_markup: { inline_keyboard: [
          ...menuButtons().inline_keyboard,
          [{ text: "🛟 Поддержка", web_app: { url: экранПриложения("support") } }],
        ] },
      });
    }
    return res.status(200).json({ ok: true });
  }

  const payload = text.slice("/start".length).trim();
  const своё = chat.type === "private";

  // Ссылка на конкретный токен: так открываются карточки, отправленные
  // в группы, — там кнопка web_app недоступна и ведёт сюда. Здесь
  // карточка приходит целиком, с кнопками сделки.
  const токен = tokenFromPayload(payload);
  if (токен) {
    const card = await cardByRef("t", токен).catch(() => null);
    if (card) await отправитьКарточку(chat.id, card, своё);
    else await tg("sendMessage", { chat_id: chat.id, text: "Не получилось открыть токен — источник не ответил. Попробуй ещё раз." });
    return res.status(200).json({ ok: true });
  }

  // Кнопка над списком подсказок ведёт сюда: показать кошелёк или
  // объяснить, как продавать.
  if (payload === "wallet") {
    await handleWallet(chat.id, from.id);
    return res.status(200).json({ ok: true });
  }
  if (payload === "new") {
    await handleNew(message);
    return res.status(200).json({ ok: true });
  }
  if (payload === "sell") {
    await tg("sendMessage", {
      chat_id: chat.id,
      text: [
        "Продажа идёт здесь: остаток и адрес кошелька — не то, что показывают посреди общей переписки.",
        "",
        "Напиши <code>/sell ТИКЕР 50%</code> (или <code>all</code>) — или пришли тикер и нажми долю под карточкой.",
      ].join("\n"),
      parse_mode: "HTML",
      reply_markup: menuButtons(),
    });
    return res.status(200).json({ ok: true });
  }

  // Черновик монеты из группы (/mint): форма в приложении уже заполнена.
  if (payload.startsWith("draft_") && UUID_RE.test(payload.slice(6))) {
    await tg("sendMessage", {
      chat_id: chat.id,
      text: "Черновик монеты готов — открой и нажми «Запустить».",
      reply_markup: { inline_keyboard: [[кнопкаЧерновика(payload.slice(6), true)]] },
    });
    return res.status(200).json({ ok: true });
  }

  // Пришли из чужого чата по кнопке «Торговать»: показываем карточку
  // сразу с торговым меню, а если сумма названа — сразу подтверждение.
  if (payload.startsWith("buy_")) {
    // «buy_m100000_t_<id>» — сумма в миллионных впереди, дальше вид и
    // ключ. «buy_x50_…» — сотые из прежних версий.
    let хвост = payload.slice(4);
    let сумма = 0;
    const сСуммой = хвост.match(/^([mx])(\d+)_([\s\S]+)$/);
    if (сСуммой) {
      сумма = Number(сСуммой[2]) / (сСуммой[1] === "m" ? 1e6 : 100);
      хвост = сСуммой[3];
    }
    const вид = хвост.startsWith("p_") ? "p" : хвост.startsWith("t_") ? "t" : null;
    const ключ = вид ? хвост.slice(2) : null;
    if (вид && ключ) {
      let card = null;
      try { card = await cardByRef(вид, ключ); } catch (err) { card = null; }
      if (card) {
        if (сумма > 0 && card.торгуется && своё) await экранСделки(chat.id, from.id, card, true, сумма);
        else await отправитьКарточку(chat.id, card, своё);
        return res.status(200).json({ ok: true });
      }
      await tg("sendMessage", { chat_id: chat.id, text: "Не получилось открыть токен — источник не ответил. Попробуй ещё раз." });
      return res.status(200).json({ ok: true });
    }
  }

  // Токен с рынка: у него нет своей строки в базе, поэтому в ссылке
  // едет адрес пула.
  if (payload.startsWith("pool_")) {
    const пул = payload.slice(5).trim();
    if (looksLikeAddress(пул)) {
      const card = await cardByRef("p", пул).catch(() => null);
      if (card) await отправитьКарточку(chat.id, card, своё);
      else {
        await tg("sendMessage", {
          chat_id: chat.id,
          text: "Открываю токен в Mintly.",
          reply_markup: { inline_keyboard: [[{ text: "📈 Открыть график", web_app: { url: `${APP_URL}?pool=${пул}` } }]] },
        });
      }
      return res.status(200).json({ ok: true });
    }
  }

  const inviter = inviterFromPayload(payload);

  if (inviter) {
    const admin = adminClient();
    try {
      // Своей же ссылкой воспользоваться нельзя, и приглашать того, кто
      // уже завёл профиль, — тоже: приглашение засчитывается один раз, за
      // приход нового человека.
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("telegram_id", from.id)
        .maybeSingle();
      const { data: inviterRow } = await admin
        .from("profiles")
        .select("id")
        .eq("id", inviter)
        .maybeSingle();
      if (!existing && inviterRow) {
        await admin
          .from("pending_referrals")
          .upsert({ telegram_id: from.id, inviter }, { onConflict: "telegram_id", ignoreDuplicates: true });
      }
    } catch (err) {
      console.warn("[bot] failed to store referral:", err && err.message);
    }
  }

  await welcome(chat.id);
  return res.status(200).json({ ok: true });
}
