/* Визитка основного бота: описание, короткое описание, команды и кнопка
 * меню.
 *
 * Всё это хранится на стороне Telegram и ставится методами Bot API, а не
 * кодом приложения. Держим тексты в одном месте: их ставит и подключение
 * вебхука (api/telegram-bot.js → setup), и скрипт scripts/bot-visitka.mjs.
 * Раньше визитка жила только в скрипте, её никто не запускал после смены
 * бота, и новый бот встречал людей пустым профилем.
 *
 * Чего Bot API не умеет, остаётся за @BotFather: режим подсказок
 * (/setinline), главное мини-приложение (Bot Settings → Configure Mini
 * App) и картинка над описанием (Edit Description Picture).
 */

export const ОПИСАНИЕ = {
  ru: (бот) => [
    "Mintly — запуск и торговля мемкоинами прямо в Telegram.",
    "",
    "🚀 Свой токен за минуту — в TON, Solana, BNB Chain, Base или Ethereum",
    "📈 Сделки по бондинг-кривой, а после порога — на бирже",
    "💼 Один кошелёк во всех сетях: пополнение, вывод, обмен",
    "⚡️ 0% с покупок и продаж, скорость сделки — на выбор",
    "📊 Биржа: фьючерсы, золото и индексы через Hyperliquid",
    "🎁 Монеты за друзей и достижения",
    "",
    `В любом чате напиши @${бот} и тикер — придёт карточка токена с графиком.`,
  ].join("\n"),
  en: (бот) => [
    "Mintly — launch and trade memecoins right in Telegram.",
    "",
    "🚀 Your own token in a minute — on TON, Solana, BNB Chain, Base or Ethereum",
    "📈 Trades on a bonding curve, then on a DEX once it fills",
    "💼 One wallet across all networks: deposit, withdraw, swap",
    "⚡️ 0% on buys and sells, pick your trade speed",
    "📊 Markets: perps, gold and indices via Hyperliquid",
    "🎁 Coins for friends and achievements",
    "",
    `In any chat type @${бот} and a ticker to share a token card with a chart.`,
  ].join("\n"),
};

export const КОРОТКО = {
  ru: "Запуск и торговля мемкоинами в Telegram: TON, Solana, BNB Chain, Base и Ethereum. 0% с покупок и продаж.",
  en: "Launch and trade memecoins in Telegram: TON, Solana, BNB Chain, Base and Ethereum. 0% on buys and sells.",
};

export const КОМАНДЫ = {
  ru: [
    { command: "start", description: "Главное меню" },
    { command: "token", description: "Карточка токена по тикеру или адресу" },
    { command: "buy", description: "Купить токен" },
    { command: "sell", description: "Продать токен" },
    { command: "wallet", description: "Кошелёк во всех сетях" },
    { command: "new", description: "Свежие запуски в Mintly" },
    { command: "top", description: "Мемкоины в тренде" },
    { command: "mint", description: "Монета из сообщения — ответом на него" },
    { command: "help", description: "Что умеет бот" },
  ],
  en: [
    { command: "start", description: "Main menu" },
    { command: "token", description: "Token card by ticker or address" },
    { command: "buy", description: "Buy a token" },
    { command: "sell", description: "Sell a token" },
    { command: "wallet", description: "Wallet across all networks" },
    { command: "new", description: "Fresh launches on Mintly" },
    { command: "top", description: "Trending memecoins" },
    { command: "mint", description: "Coin from a message — reply to it" },
    { command: "help", description: "What the bot can do" },
  ],
};

/* Поставить визитку целиком. Русский — значением по умолчанию: его
   видят все, у кого язык Telegram не английский; английский — отдельным
   переводом. Возвращает, что прошло и что нет, — молча проглоченный
   отказ здесь и оставил прошлого бота без описания. */
export async function оформитьБота(зов, { бот, адрес }) {
  const итог = {};
  const шаг = async (имя, метод, тело) => {
    try {
      const о = await зов(метод, тело);
      итог[имя] = о && о.ok ? true : String((о && о.description) || "нет ответа");
    } catch (e) {
      итог[имя] = String((e && e.message) || e);
    }
  };
  await шаг("описание", "setMyDescription", { description: ОПИСАНИЕ.ru(бот) });
  await шаг("описание_en", "setMyDescription", { description: ОПИСАНИЕ.en(бот), language_code: "en" });
  await шаг("коротко", "setMyShortDescription", { short_description: КОРОТКО.ru });
  await шаг("коротко_en", "setMyShortDescription", { short_description: КОРОТКО.en, language_code: "en" });
  await шаг("команды", "setMyCommands", { commands: КОМАНДЫ.ru });
  await шаг("команды_en", "setMyCommands", { commands: КОМАНДЫ.en, language_code: "en" });
  // Кнопка у поля ввода открывает приложение одним касанием: команды и
  // так видны по «/», а приложение — главное, за чем сюда приходят.
  await шаг("кнопка", "setChatMenuButton", { menu_button: { type: "web_app", text: "Mintly", web_app: { url: адрес } } });
  return итог;
}
