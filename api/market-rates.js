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

// Обе монеты — одним запросом: /simple/price принимает список ids через
// запятую, и это тот же один вызов источника, что для одной монеты.
const кешЦены = new Map(); // "sol" | "gram" -> { price, change24 }
let ценаAt = 0;
let сердитсяЦенаДо = 0;
let ценаЗапрос = null;

async function запроситьЦену() {
  const ids = Object.values(МОНЕТЫ).join(",");
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { headers: ЗАГОЛОВКИ });
  if (res.status === 429) { сердитсяЦенаДо = Date.now() + ПАУЗА_ПОСЛЕ_ОТКАЗА_МС; throw new Error("429"); }
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  for (const [ключ, id] of Object.entries(МОНЕТЫ)) {
    const d = json && json[id];
    if (!d || !(Number(d.usd) > 0)) continue;
    кешЦены.set(ключ, { price: Number(d.usd), change24: Number(d.usd_24h_change) || 0 });
  }
  ценаAt = Date.now();
}

async function получитьЦену() {
  if (Date.now() - ценаAt < TTL_ЦЕНЫ_МС) return;
  if (сердитсяЦенаДо > Date.now()) return;
  if (!ценаЗапрос) {
    ценаЗапрос = запроситьЦену().catch(() => {}).finally(() => { ценаЗапрос = null; });
  }
  await ценаЗапрос;
}

export default async function handler(req, res) {
  const [sol, gram] = await Promise.all([получитьКривую(МОНЕТЫ.sol), получитьКривую(МОНЕТЫ.gram)]);
  await получитьЦену();

  // Свежая цена перекрывает ту, что легла в кривую при её последнем
  // обновлении, — кривая может быть пятиминутной давности, а число
  // рядом с ней должно быть сиюминутным.
  const собрать = (базовый, ключ) => {
    const свежая = кешЦены.get(ключ);
    if (!базовый && !свежая) return null;
    return {
      points: (базовый && базовый.points) || [],
      price: (свежая && свежая.price) || (базовый && базовый.price) || 0,
      change24: свежая ? свежая.change24 : (базовый && базовый.change24) || 0,
    };
  };

  res.setHeader("Cache-Control", "public, max-age=2");
  res.status(200).json({ sol: собрать(sol, "sol"), gram: собрать(gram, "gram") });
}
