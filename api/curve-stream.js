/* Живая цена кривой — потоком.
 *
 * Опрос раз в несколько секунд оставляет заметную паузу между чужой
 * сделкой и движением на графике. Здесь соединение держится открытым, а
 * сервер сам следит за кривой и шлёт цену, как только она изменилась.
 *
 * Почему у сети спрашивает сервер, а не браузер: ключ к узлу живёт на
 * сервере и уходить в страницу не должен. Заодно опрос один на всех — на
 * токен, а не на зрителя: сто открытых карточек стоят ровно столько же,
 * сколько одна.
 *
 * Формат — Server-Sent Events: обычный HTTP, переживает прокси и сам
 * переподключается, в отличие от вебсокета.
 *
 * Переменные окружения: SOLANA_RPC (через api/solana-launch.js).
 */

// Как часто спрашиваем состояние кривой. Меньше секунды смысла не имеет:
// сеть подтверждает сделку примерно за это время.
const ШАГ_МС = 900;
// Пульс, чтобы прокси не счёл молчание обрывом.
const ПУЛЬС_МС = 20000;
// Никто не смотрит — перестаём спрашивать: цикл живёт ровно столько,
// сколько открыта хоть одна карточка.
const кривые = new Map(); // mint -> { зрители:Set, таймер, прошлое }

const адресОк = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

async function состояниеКривой(mint) {
  try {
    const { состояние } = await import("./solana-launch.js");
    return await состояние(mint);
  } catch {
    return null;
  }
}

function разослать(запись, событие) {
  const строка = `data: ${JSON.stringify(событие)}\n\n`;
  for (const res of запись.зрители) {
    try { res.write(строка); } catch { запись.зрители.delete(res); }
  }
}

function следить(mint) {
  let запись = кривые.get(mint);
  if (запись) return запись;
  запись = { зрители: new Set(), прошлое: null, таймер: null, пульс: 0 };
  кривые.set(mint, запись);

  запись.таймер = setInterval(async () => {
    if (!запись.зрители.size) {
      clearInterval(запись.таймер);
      кривые.delete(mint);
      return;
    }
    const st = await состояниеКривой(mint);
    if (!st) return;
    /* Отдаём не только цену, но и сами резервы: график считает цену
       своей формулой (через произведение резервов), и если прислать
       готовое число, посчитанное иначе, свеча начнёт прыгать между
       двумя значениями — одно от потока, другое от пересчёта. */
    const сейчас = {
      price: st.ценаSol,
      raised: st.solСобрано,
      sold: st.продано,
      graduated: !!st.закрыта,
      vSol: st.virtualSol,
      vTokens: st.virtualTokens,
      realSol: Math.round((st.solСобрано || 0) * 1e9),
      at: Math.floor(Date.now() / 1000),
    };
    const изменилось = !запись.прошлое
      || Math.abs(запись.прошлое.raised - сейчас.raised) > 1e-9
      || запись.прошлое.graduated !== сейчас.graduated;
    // Молчание тоже вредно: через прокси оно неотличимо от обрыва.
    const пораПульс = Date.now() - запись.пульс > ПУЛЬС_МС;
    if (изменилось || пораПульс) {
      запись.прошлое = сейчас;
      запись.пульс = Date.now();
      разослать(запись, сейчас);
    }
  }, ШАГ_МС);

  return запись;
}

export default async function handler(req, res) {
  const mint = String((req.query && req.query.mint) || "").trim();
  if (!адресОк(mint)) return res.status(400).json({ error: "bad_mint" });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Nginx иначе копит поток в буфере и отдаёт его пачкой — вся затея
  // теряет смысл.
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) res.flushHeaders();
  res.write(": ok\n\n");

  const запись = следить(mint);
  запись.зрители.add(res);
  // Последнее известное — сразу, чтобы карточка не ждала первой сделки.
  if (запись.прошлое) res.write(`data: ${JSON.stringify(запись.прошлое)}\n\n`);

  const закрыть = () => {
    запись.зрители.delete(res);
    try { res.end(); } catch { /* уже закрыт */ }
  };
  req.on("close", закрыть);
  req.on("error", закрыть);
}
