/* Визитка бота: описание, короткое описание и команды.
 *
 * Всё это живёт не в коде приложения, а на стороне Telegram, и ставится
 * методами Bot API. Текст «Что умеет этот бот?» — это description,
 * строка под именем в профиле — short_description.
 *
 * Картинку над описанием (тот самый баннер сверху) через Bot API
 * поставить нельзя: её принимает только @BotFather вручную —
 * /mybots → бот → Edit Bot → Edit Description Picture, файл
 * public/banner-bot.png (640×360).
 *
 * Запуск на сервере, где лежит токен:
 *   node --env-file=.env.server scripts/bot-visitka.mjs
 */

const ТОКЕН = process.env.TELEGRAM_BOT_TOKEN;
if (!ТОКЕН) {
  console.error("Нет TELEGRAM_BOT_TOKEN — запускать с сервера, где он в .env.server");
  process.exit(1);
}

const ОПИСАНИЕ = `Mintly — площадка мемкоинов в Telegram.

🚀 Запуск токена за пару секунд: имя, тикер, картинка — остальное берёт на себя контракт.
📈 Мемпад: покупка и продажа по бондинг-кривой, живой график и лента сделок.
👛 Кошелёк внутри: пополнение, вывод и обмен, сети Gram и Solana.
🏆 Достижения, магазин обликов и приглашения.

Нажми «Запустить», чтобы открыть приложение.`;

const КОРОТКО = "Запускай и торгуй мемкоинами прямо в Telegram — Gram и Solana.";

const КОМАНДЫ = [
  { command: "start", description: "Открыть приложение" },
  { command: "wallet", description: "Мой кошелёк" },
  { command: "help", description: "Как это работает" },
];

async function зовём(метод, тело) {
  const r = await fetch(`https://api.telegram.org/bot${ТОКЕН}/${метод}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(тело),
  });
  const о = await r.json().catch(() => ({}));
  console.log(метод, о.ok ? "готово" : `ошибка: ${о.description || r.status}`);
  return о.ok;
}

// Языки задаём по очереди: без language_code текст становится
// значением по умолчанию, с ним — переводом для конкретного языка.
await зовём("setMyDescription", { description: ОПИСАНИЕ });
await зовём("setMyShortDescription", { short_description: КОРОТКО });
await зовём("setMyCommands", { commands: КОМАНДЫ });
