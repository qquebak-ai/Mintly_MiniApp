/* Курс SOL и GRAM (TON) для виджетов главной — одна дверь на весь сервер.
 *
 * Раньше каждый телефон сам ходил в CoinGecko за market_chart. Источник
 * щедрым не бывает даже к одному адресу: как только виджет открыли
 * несколько человек разом, CoinGecko отвечал 429, и карточка молча
 * оставалась пустой.
 *
 * Кривая и сама цена кешируются раздельно и с разным сроком. Кривая —
 * тяжёлый запрос (сутки истории), и часто спрашивать его незачем: форма
 * графика не меняется секунда в секунду. Цена — лёгкий запрос («дай два
 * числа»), и его можно спрашивать часто одним сервером на всех, не
 * упираясь в лимит источника, — так виджет обновляется почти вживую, а
 * не раз в пять минут, как было бы при общем сроке годности.
 */

const TTL_КРИВОЙ_МС = 5 * 60 * 1000;
const TTL_ЦЕНЫ_МС = 3000;
const ПАУЗА_ПОСЛЕ_ОТКАЗА_МС = 15000;

const МОНЕТЫ = { sol: "solana", gram: "the-open-network" };
const ЗАГОЛОВКИ = { accept: "application/json", "user-agent": "Mintly/1.0 (+https://mintly.company)" };

const кешКривой = new Map(); // id -> { at, points, price, change24 }
let сердитсяКриваяДо = 0;

async function запроситьКривую(coingeckoId) {
  const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=1`, { headers: ЗАГОЛОВКИ });
  if (res.status === 429) { сердитсяКриваяДо = Date.now() + ПАУЗА_ПОСЛЕ_ОТКАЗА_МС; throw new Error("429"); }
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

async function получитьКривую(coingeckoId) {
  const было = кешКривой.get(coingeckoId);
  if (было && Date.now() - было.at < TTL_КРИВОЙ_МС) return было;
  // Источник в отказе — отдаём то, что помним, лучше протухшее, чем ничего.
  if (сердитсяКриваяДо > Date.now()) return было || null;
  try {
    const итог = await запроситьКривую(coingeckoId);
    кешКривой.set(coingeckoId, итог);
    return итог;
  } catch (err) {
    return было || null;
  }
}

/* Живая цена. CoinGecko здесь не годится сама по себе: его /simple/price
   у себя обновляется раз в минуту-другую, и опрашивать его чаще —
   спрашивать одно и то же число. Настоящий тик за тиком даёт биржевой
   тикер — Kraken отдаёт последнюю сделку по обеим монетам одним
   запросом и не просит ключа. CoinGecko остаётся запасным источником на
   случай, если Kraken недоступен из сети самого сервера. */
const KRAKEN_ПАРА = { sol: "SOLUSD", gram: "TONUSD" };

const кешЦены = new Map(); // "sol" | "gram" -> цена
let ценаAt = 0;
let ценаЗапрос = null;

async function сКракена() {
  const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${Object.values(KRAKEN_ПАРА).join(",")}`, { headers: ЗАГОЛОВКИ });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  if (json.error && json.error.length) throw new Error(json.error.join(","));
  const итог = {};
  for (const [ключ, пара] of Object.entries(KRAKEN_ПАРА)) {
    const d = json.result && json.result[пара];
    const цена = Number(d && d.c && d.c[0]);
    if (цена > 0) итог[ключ] = цена;
  }
  if (!Object.keys(итог).length) throw new Error("пусто");
  return итог;
}

async function сCoinGecko() {
  const ids = Object.values(МОНЕТЫ).join(",");
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { headers: ЗАГОЛОВКИ });
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  const итог = {};
  for (const [ключ, id] of Object.entries(МОНЕТЫ)) {
    const цена = Number(json && json[id] && json[id].usd);
    if (цена > 0) итог[ключ] = цена;
  }
  if (!Object.keys(итог).length) throw new Error("пусто");
  return итог;
}

async function получитьЦену() {
  if (Date.now() - ценаAt < TTL_ЦЕНЫ_МС) return;
  if (!ценаЗапрос) {
    ценаЗапрос = (async () => {
      let итог = null;
      try { итог = await сКракена(); } catch { итог = null; }
      if (!итог) { try { итог = await сCoinGecko(); } catch { итог = null; } }
      if (!итог) return;
      for (const [ключ, цена] of Object.entries(итог)) кешЦены.set(ключ, цена);
      ценаAt = Date.now();
    })().finally(() => { ценаЗапрос = null; });
  }
  await ценаЗапрос;
}

export default async function handler(req, res) {
  const [sol, gram] = await Promise.all([получитьКривую(МОНЕТЫ.sol), получитьКривую(МОНЕТЫ.gram)]);
  await получитьЦену();

  // Суточный процент считается от точки отсчёта, которую даёт кривая
  // (у неё честный скользящий период в сутки), а не от цены самого
  // тикера — Kraken отдаёт только цену, без суточного изменения.
  const собрать = (базовый, ключ) => {
    const свежая = кешЦены.get(ключ);
    if (!базовый && свежая == null) return null;
    const якорь = базовый && базовый.price > 0 ? базовый.price / (1 + (базовый.change24 || 0) / 100) : null;
    const price = свежая != null ? свежая : (базовый && базовый.price) || 0;
    const change24 = якорь && price > 0 ? ((price - якорь) / якорь) * 100 : (базовый && базовый.change24) || 0;
    return { points: (базовый && базовый.points) || [], price, change24 };
  };

  res.setHeader("Cache-Control", "public, max-age=2");
  res.status(200).json({ sol: собрать(sol, "sol"), gram: собрать(gram, "gram") });
}
