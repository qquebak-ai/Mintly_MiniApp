/* Курс SOL и GRAM (TON) для виджетов главной — одна дверь на весь сервер.
 *
 * Раньше каждый телефон сам ходил в CoinGecko за market_chart. Источник
 * щедрым не бывает даже к одному адресу: как только виджет открыли
 * несколько человек разом, CoinGecko отвечал 429, и карточка молча
 * оставалась пустой. Здесь один сервер спрашивает источник раз в пять
 * минут и отдаёт всем один и тот же ответ из памяти — сколько бы
 * телефонов не открыли главную одновременно.
 */

const TTL_МС = 5 * 60 * 1000;
const ПАУЗА_ПОСЛЕ_ОТКАЗА_МС = 30000;

const МОНЕТЫ = { sol: "solana", gram: "the-open-network" };

const кеш = new Map(); // id -> { at, points, price, change24 }
let сердитсяДо = 0;

async function запросить(coingeckoId) {
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=1`, {
    headers: { accept: "application/json", "user-agent": "Mintly/1.0 (+https://mintly.company)" },
  });
  if (res.status === 429) { сердитсяДо = Date.now() + ПАУЗА_ПОСЛЕ_ОТКАЗА_МС; throw new Error("429"); }
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const points = ((json && json.prices) || []).map(([t, p]) => ({ t, p }));
  const price = points.length ? points[points.length - 1].p : 0;
  const первая = points.length ? points[0].p : 0;
  return {
    at: Date.now(),
    points,
    price,
    change24: первая > 0 ? ((price - первая) / первая) * 100 : 0,
  };
}

async function получить(coingeckoId) {
  const было = кеш.get(coingeckoId);
  if (было && Date.now() - было.at < TTL_МС) return было;
  // Источник в отказе — отдаём то, что помним, лучше протухшее, чем ничего.
  if (сердитсяДо > Date.now()) return было || null;
  try {
    const итог = await запросить(coingeckoId);
    кеш.set(coingeckoId, итог);
    return итог;
  } catch (err) {
    return было || null;
  }
}

export default async function handler(req, res) {
  const [sol, gram] = await Promise.all([получить(МОНЕТЫ.sol), получить(МОНЕТЫ.gram)]);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json({ sol: sol || null, gram: gram || null });
}
