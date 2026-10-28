/* Визитка бота: описание, короткое описание, команды и кнопка меню.
 *
 * Тексты живут в api/_botProfile.js — их же ставит подключение вебхука
 * (/api/telegram-bot?setup=…), так что скрипт нужен, только чтобы
 * обновить визитку, не трогая вебхук.
 *
 * Картинку над описанием (баннер сверху) через Bot API поставить нельзя:
 * её принимает только @BotFather вручную — /mybots → бот → Edit Bot →
 * Edit Description Picture, файл public/banner-bot.png (640×360).
 *
 * Запуск на сервере, где лежит токен:
 *   node --env-file=.env.server scripts/bot-visitka.mjs
 */

import { оформитьБота } from "../api/_botProfile.js";

const ТОКЕН = process.env.TELEGRAM_BOT_TOKEN;
if (!ТОКЕН) {
  console.error("Нет TELEGRAM_BOT_TOKEN — запускать с сервера, где он в .env.server");
  process.exit(1);
}

async function зов(метод, тело) {
  const r = await fetch(`https://api.telegram.org/bot${ТОКЕН}/${метод}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(тело || {}),
  });
  return r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
}

const я = await зов("getMe");
if (!я.ok) {
  console.error("Токен не принят Telegram:", я.description || "нет ответа");
  process.exit(1);
}
const итог = await оформитьБота(зов, { бот: я.result.username, адрес: process.env.APP_URL || "https://mintly.company" });
for (const [шаг, исход] of Object.entries(итог)) console.log(шаг, исход === true ? "готово" : `ошибка: ${исход}`);
