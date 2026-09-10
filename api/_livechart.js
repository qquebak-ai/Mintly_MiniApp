/* Живой график в чате.
 *
 * Токен, запущенный с этой механикой, получает в своём чате одно
 * сообщение — и бот правит его на каждом обходе кривой. Цена, изменение
 * за сутки и полоска свечей меняются прямо в ленте: не нужно ни
 * открывать приложение, ни присылать новое сообщение каждые пять минут,
 * от которых чат превращается в спам.
 *
 * Правка сообщения ничего не стоит и не всплывает уведомлением — в этом
 * весь смысл: график живёт в чате, но никого не будит.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL || "https://mintly.company";
const TG_BOT = String(process.env.TG_BOT || "MintlyAppbot").replace(/^@/, "").trim();
const TG_APP = String(process.env.TG_APP || "Mintly").trim();

async function tg(метод, тело) {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${метод}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(тело),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

const экран = (с) => String(с || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Свечи символами. Восемь уровней высоты — этого хватает, чтобы
   отличить рост от падения одним взглядом, а шрифт в Telegram
   моноширинный и не расползается. */
const СТОЛБИКИ = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function полоска(значения) {
  const ряд = (значения || []).filter((ч) => Number.isFinite(ч));
  if (ряд.length < 2) return "";
  const мин = Math.min(...ряд);
  const макс = Math.max(...ряд);
  const размах = макс - мин;
  return ряд
    .slice(-24)
    .map((ч) => СТОЛБИКИ[размах > 0 ? Math.round(((ч - мин) / размах) * (СТОЛБИКИ.length - 1)) : 0])
    .join("");
}

function цифра(ч, знаков = 6) {
  const n = Number(ч) || 0;
  if (n === 0) return "0";
  if (n < 0.000001) return n.toExponential(2);
  return n.toFixed(знаков).replace(/0+$/, "").replace(/\.$/, "");
}

function текстСообщения({ имя, тикер, цена, изм24, собрано, цель, ряд, валюта }) {
  const знак = (Number(изм24) || 0) >= 0 ? "▲" : "▼";
  const доля = цель > 0 ? Math.min(100, (собрано / цель) * 100) : 0;
  const шкала = полоска(ряд);
  return [
    `<b>${экран(имя)}</b> · $${экран(String(тикер).toUpperCase())}`,
    "",
    `<code>${цифра(цена)} ${валюта}</code>  ${знак} ${Math.abs(Number(изм24) || 0).toFixed(1)}%`,
    шкала ? `<code>${шкала}</code>` : "",
    цель > 0 ? `До биржи: ${доля.toFixed(0)}%  (${цифра(собрано, 2)} / ${цифра(цель, 2)} ${валюта})` : "",
    "",
    `<i>обновляется само</i>`,
  ].filter(Boolean).join("\n");
}

/* Одно сообщение на токен. Нет — отправляем и запоминаем, есть —
   правим. Чат тот, где монету запустили: черновик приносит его с собой.
 */
export async function обновитьЖивойГрафик(db, { токен, кеш }) {
  if (!db || !BOT_TOKEN || !токен || !токен.live_chart) return false;

  const { data: запись } = await db
    .from("live_charts")
    .select("chat_id, message_id")
    .eq("token_id", токен.id)
    .maybeSingle();

  const чат = (запись && запись.chat_id) || токен.chat_id;
  if (!чат) return false;

  const валюта = (токен.chain === "solana") ? "SOL" : "TON";
  const текст = текстСообщения({
    имя: токен.name,
    тикер: токен.ticker,
    цена: кеш.price_ton,
    изм24: кеш.change24,
    собрано: кеш.real_ton,
    цель: кеш.graduation_ton,
    ряд: Array.isArray(кеш.trades) ? кеш.trades.map((с) => Number(с.price) || 0) : [],
    валюта,
  });
  const кнопки = {
    inline_keyboard: [[
      { text: "Открыть в Mintly", url: `https://t.me/${TG_BOT}/${TG_APP}?startapp=tok_${токен.id}` },
    ]],
  };

  if (запись && запись.message_id) {
    const ответ = await tg("editMessageText", {
      chat_id: чат, message_id: запись.message_id,
      text: текст, parse_mode: "HTML", reply_markup: кнопки,
      link_preview_options: { is_disabled: true },
    });
    // «Ничего не изменилось» — не ошибка: цена стоит на месте, и
    // Telegram честно отказывается переписывать то же самое.
    if (ответ && ответ.ok) return true;
    const причина = ответ && ответ.description ? String(ответ.description) : "";
    if (/message is not modified/i.test(причина)) return true;
    // Сообщение удалили или бота выгнали — заводим новое.
    await db.from("live_charts").delete().eq("token_id", токен.id);
  }

  const ответ = await tg("sendMessage", {
    chat_id: чат, text: текст, parse_mode: "HTML", reply_markup: кнопки,
    link_preview_options: { is_disabled: true },
  });
  const id = ответ && ответ.ok && ответ.result && ответ.result.message_id;
  if (!id) return false;
  await db.from("live_charts").upsert({
    token_id: токен.id, chat_id: String(чат), message_id: id, updated_at: new Date().toISOString(),
  }, { onConflict: "token_id" });
  return true;
}

export { APP_URL };
