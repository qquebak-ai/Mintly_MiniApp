/* Живые сделки кривой TON — потоком.
 *
 * Карточка токена TON узнавала о чужой сделке только на следующем круге
 * опроса. Здесь сервер держит одну подписку tonapi на счёт кривой и,
 * как только по нему прошла транзакция, толкает всех зрителей: те сразу
 * перечитывают состояние, а не ждут своего круга.
 *
 * Подписка одна на кривую, сколько бы карточек её ни смотрело, и живёт,
 * пока смотрит хоть одна. Ключ tonapi остаётся на сервере.
 *
 *   GET /api/ton-stream?address=<адрес кривой>
 *
 * Без ключа tonapi поток не поднимается — отвечаем 503, и карточка
 * остаётся на обычном опросе.
 *
 * Переменные окружения: TONAPI_KEY, TON_TESTNET.
 */

const TONAPI = process.env.TON_TESTNET === "1" ? "https://testnet.tonapi.io" : "https://tonapi.io";
const КЛЮЧ = (process.env.TONAPI_KEY || "").trim();
const ПУЛЬС_МС = 20000;

const кривые = new Map(); // адрес -> { зрители:Set, стоп:AbortController|null, попытка }

// Адрес TON в любом из двух видов: сырой «0:…» или дружественный.
const адресОк = (s) => typeof s === "string"
  && (/^-?\d:[0-9a-fA-F]{64}$/.test(s) || /^[A-Za-z0-9_-]{48}$/.test(s));

function написать(res, событие) {
  try { res.write(`data: ${JSON.stringify(событие)}\n\n`); } catch { /* зритель ушёл */ }
}

async function слушать(адрес, запись) {
  if (запись.стоп || !запись.зрители.size) return;
  const стоп = new AbortController();
  запись.стоп = стоп;
  try {
    const ответ = await fetch(`${TONAPI}/v2/sse/accounts/transactions?accounts=${encodeURIComponent(адрес)}`, {
      headers: { Authorization: `Bearer ${КЛЮЧ}`, Accept: "text/event-stream" },
      signal: стоп.signal,
    });
    if (!ответ.ok || !ответ.body) throw new Error(`tonapi ${ответ.status}`);
    запись.попытка = 0;
    const чтец = ответ.body.getReader();
    const расшифровка = new TextDecoder();
    let хвост = "";
    for (;;) {
      const { value, done } = await чтец.read();
      if (done) break;
      хвост += расшифровка.decode(value, { stream: true });
      let конец;
      while ((конец = хвост.indexOf("\n\n")) >= 0) {
        const кусок = хвост.slice(0, конец);
        хвост = хвост.slice(конец + 2);
        const данные = кусок.split("\n").filter((с) => с.startsWith("data:")).map((с) => с.slice(5).trim()).join("");
        if (!данные) continue;
        let j = null;
        try { j = JSON.parse(данные); } catch { continue; }
        const событие = { tx: (j && (j.tx_hash || j.hash)) || null, at: Math.floor(Date.now() / 1000) };
        for (const res of запись.зрители) написать(res, событие);
      }
    }
  } catch { /* оборвалось — переподключимся ниже */ }
  запись.стоп = null;
  if (!запись.зрители.size) { кривые.delete(адрес); return; }
  // Переподключение с нарастающей паузой: tonapi мог отбить по лимиту.
  запись.попытка = Math.min((запись.попытка || 0) + 1, 6);
  setTimeout(() => слушать(адрес, запись), Math.min(30000, 1000 * 2 ** (запись.попытка - 1)));
}

export default async function handler(req, res) {
  const адрес = String((req.query && req.query.address) || "").trim();
  if (!адресОк(адрес)) return res.status(400).json({ error: "bad_address" });
  if (!КЛЮЧ) return res.status(503).json({ error: "no_tonapi_key" });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) res.flushHeaders();
  res.write(": ok\n\n");

  let запись = кривые.get(адрес);
  if (!запись) {
    запись = { зрители: new Set(), стоп: null, попытка: 0 };
    кривые.set(адрес, запись);
  }
  запись.зрители.add(res);
  слушать(адрес, запись);

  // Молчание через прокси неотличимо от обрыва — шлём пульс.
  const пульс = setInterval(() => { try { res.write(": пульс\n\n"); } catch { /* ушёл */ } }, ПУЛЬС_МС);
  const закрыть = () => {
    clearInterval(пульс);
    запись.зрители.delete(res);
    if (!запись.зрители.size && запись.стоп) { запись.стоп.abort(); }
    try { res.end(); } catch { /* уже закрыт */ }
  };
  req.on("close", закрыть);
  req.on("error", закрыть);
}
