/* «В центре внимания» — пять токенов площадки одной сети.
 *
 *   GET /api/spotlight?chain=ton|sol|bsc|base|eth
 *   → { at, tokens: [{ id, score, progress, buys15, vol15, growth1h, buyers }] }
 *
 * Место считается из трёх частей с равным весом:
 *   - царь горы — насколько кривая близка к выходу на биржу
 *     (собрано / порог);
 *   - движение сейчас — покупки и оборот за последние 15 минут;
 *   - рост — изменение цены (а значит и капитализации) за час.
 * Каждая часть — доля от лучшего среди допущенных, итог — среднее трёх.
 * Обогнал — сразу встал выше: держать прежнего лидера незачем.
 *
 * Не допускаются: вышедшие на биржу (их место в «На DEX»), токены без
 * сделок 30 минут и токены, где покупали меньше трёх человек, не считая
 * создателя: витрина не должна держать монету, которую двигает один
 * автор. Демо-токены идут по тем же правилам, но после настоящих: они
 * занимают места, которые живым токенам пока нечем заполнить.
 *
 * Считает сервер — одинаково для всех. Источники: живая память
 * (api/_live.js) — состояние кривой и сделки с запуска сервера; история
 * обхода (curve_cache.trades) — сделки с ценой после каждой и следом
 * покупателя; у сетей EVM истории нет, покупателей ведёт наблюдатель
 * блоков (api/_evmWatch.js).
 */

import { createClient } from "@supabase/supabase-js";
import { прочитатьЖивое } from "./_live.js";

const СЕТИ = new Set(["ton", "sol", "bsc", "base", "eth"]);
const ЕВМ = new Set(["bsc", "base", "eth"]);
const ДВИЖЕНИЕ_С = 15 * 60;
const РОСТ_С = 60 * 60;
const ТИШИНА_С = 30 * 60;
const МИН_ПОКУПАТЕЛЕЙ = 3;
const СКОЛЬКО = 5;
// Ответ на сеть помним две секунды: телефоны спрашивают каждые
// несколько секунд, а считать заново для каждого незачем.
const ОТВЕТ_МС = 2000;
/* Строки базы — минуту. В них история сделок кривых, это самый тяжёлый
   ответ базы, а свежие сделки и так приходят из живой памяти: история
   нужна для покупателей и роста за час, где минута ничего не меняет. */
const БАЗА_МС = 60000;

const TESTNET = process.env.TON_TESTNET === "1";
const SOL_NETWORK = /devnet/.test(process.env.SOLANA_RPC || "") ? "devnet"
  : /testnet/.test(process.env.SOLANA_RPC || "") ? "testnet" : "mainnet";

let db = null;
function база() {
  if (db) return db;
  const url = process.env.SUPABASE_URL, ключ = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && ключ) db = createClient(url, ключ, { auth: { persistSession: false } });
  return db;
}
const кешБазы = new Map(); // сеть -> { до, строки }
const кешОтвета = new Map(); // сеть -> { до, тело }
export function заменитьБазуДляПроверки(б) {
  db = б;
  кешБазы.clear();
  кешОтвета.clear();
}

// Сеть токена: колонка, а у старых записей — по виду адреса.
function цепочка(tok) {
  if (tok.chain) return tok.chain === "solana" ? "sol" : tok.chain;
  const а = String(tok.address || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(а) && !/^(EQ|UQ|kQ|0Q)/.test(а) ? "sol" : "ton";
}

// След кошелька — тот же, что пишет обход (api/refresh-curves.js):
// хвост адреса. Адрес TON сводим к сырому виду: в истории он сырой.
let tonCore = null;
async function следВладельца(адрес, сеть) {
  let а = String(адрес || "").trim();
  if (!а) return null;
  if (сеть === "ton" && !/^-?\d:/.test(а)) {
    try {
      if (!tonCore) tonCore = await import("@ton/core");
      а = tonCore.Address.parse(а).toRawString();
    } catch { return null; }
  }
  return а.length > 16 ? а.toLowerCase().slice(-16) : null;
}

async function строкиСети(сеть) {
  const было = кешБазы.get(сеть);
  if (было && было.до > Date.now()) return было.строки;
  const б = база();
  if (!б) return [];
  let строки = [];
  if (ЕВМ.has(сеть)) {
    const { ТЕСТОВЫЕ } = await import("./wallet-evm.js");
    const { data } = await б.from("tokens").select("id, address, owner_id, creator_wallet, created_at")
      .eq("chain", сеть).eq("network", ТЕСТОВЫЕ ? "testnet" : "mainnet")
      .order("created_at", { ascending: false }).limit(300);
    строки = data || [];
  } else {
    const { data } = await б.from("tokens")
      .select("id, address, curve_address, chain, owner_id, creator_wallet, created_at, curve_cache(real_ton, graduation_ton, graduated, price_ton, trades)")
      .in("network", [...new Set([TESTNET ? "testnet" : "mainnet", SOL_NETWORK])])
      .not("curve_address", "is", null)
      .order("created_at", { ascending: false }).limit(300);
    строки = (data || []).filter((т) => цепочка(т) === сеть);
  }
  /* Кошельки создателя: адрес запуска и кошелёк приложения владельца в
     этой сети — его покупки покупателями не считаются. */
  const владельцы = [...new Set(строки.map((т) => т.owner_id).filter(Boolean))];
  const цепьКошелька = сеть === "sol" ? "solana" : ЕВМ.has(сеть) ? "evm" : "ton";
  const кошельки = new Map(); // owner_id -> [адрес]
  if (владельцы.length) {
    const { data } = await б.from("app_wallets").select("user_id, address").eq("chain", цепьКошелька).in("user_id", владельцы);
    for (const к of data || []) {
      if (!кошельки.has(к.user_id)) кошельки.set(к.user_id, []);
      кошельки.get(к.user_id).push(к.address);
    }
  }
  for (const т of строки) {
    const адреса = [т.creator_wallet, ...(кошельки.get(т.owner_id) || [])].filter(Boolean);
    т.свои = new Set((await Promise.all(адреса.map((а) => следВладельца(а, сеть)))).filter(Boolean));
  }
  кешБазы.set(сеть, { до: Date.now() + БАЗА_МС, строки });
  return строки;
}

/* История обхода — в одном виде для обеих сетей: время (с), покупка ли,
   сумма в монете сети, цена после сделки и след покупателя. */
function рядИзКеша(кеш, сеть) {
  const сырой = кеш && Array.isArray(кеш.trades) ? кеш.trades : [];
  if (сеть === "sol") {
    return сырой.map((п) => ({ t: Number(п.t != null ? п.t : п.time) || 0, buy: Number(п.d) > 0, coin: Math.abs(Number(п.d) || 0) / 1e9, p: Number(п.p) || 0, b: п.b || null }))
      .filter((п) => п.t > 0).sort((a, b) => a.t - b.t);
  }
  // TON: сторона — куда сдвинулся резерв после сделки.
  let прежний = null;
  return сырой.map((п) => {
    const r = Number(п.r) || 0;
    const ton = Number(п.ton) || 0;
    const buy = прежний == null ? true : r >= прежний;
    прежний = r;
    return { t: Number(п.t) || 0, buy, coin: ton / 1e9, p: Number(п.p) || 0, b: п.b || null };
  }).filter((п) => п.t > 0);
}

/* Меры одного токена. null — токен на витрину не допущен. */
function меры(т, сеть, сейчас, покупателиEVM) {
  const ключ = сеть === "sol" ? т.address : ЕВМ.has(сеть) ? `${сеть}:${String(т.address || "").toLowerCase()}` : т.curve_address;
  const ж = ключ ? прочитатьЖивое(ключ) : null;
  const с = ж && ж.событие;
  const кеш = Array.isArray(т.curve_cache) ? т.curve_cache[0] : т.curve_cache;
  const закрыта = с ? !!с.graduated : !!(кеш && кеш.graduated);
  if (закрыта) return null;
  const собрано = с && с.raised != null ? Number(с.raised) : Number(кеш && кеш.real_ton) || 0;
  const цель = с && Number(с.graduation) > 0 ? Number(с.graduation) : Number(кеш && кеш.graduation_ton) || 0;
  const ценаСейчас = с && с.price > 0 ? Number(с.price) : Number(кеш && кеш.price_ton) || 0;
  if (!(цель > 0) || !(собрано > 0)) return null;

  const история = рядИзКеша(кеш, сеть);
  const последняяИстории = история.length ? история[история.length - 1].t : 0;
  // Живые сделки — те, что история ещё не знает.
  const живые = ((ж && ж.сделки) || [])
    .filter((x) => x && x.at / 1000 > последняяИстории + 2)
    .map((x) => ({ t: x.at / 1000, buy: x.side === "buy", coin: Number(x.coin) || 0, p: Number(x.price) || 0, b: null }))
    .sort((a, b) => a.t - b.t);
  const все = [...история, ...живые];
  const последняя = все.length ? все[все.length - 1].t : 0;
  if (!(последняя > 0) || сейчас - последняя > ТИШИНА_С) return null;

  const покупатели = new Set(история.filter((п) => п.buy && п.b).map((п) => п.b));
  if (ЕВМ.has(сеть)) for (const b of покупателиEVM(ключ) || []) покупатели.add(b);
  for (const свой of т.свои || []) покупатели.delete(свой);
  if (покупатели.size < МИН_ПОКУПАТЕЛЕЙ) return null;

  const окно = все.filter((п) => п.t >= сейчас - ДВИЖЕНИЕ_С);
  /* Цена час назад — после последней сделки до окна. Токен моложе часа
     меряется от цены после первой сделки: она почти всегда стартовая
     покупка создателя, и рост «от нуля» был бы у любого свежего токена. */
  const до = все.filter((п) => п.t <= сейчас - РОСТ_С && п.p > 0);
  const тогда = до.length ? до[до.length - 1].p : (все.length > 1 && все[0].p > 0 ? все[0].p : 0);
  return {
    id: т.id,
    progress: Math.max(0, Math.min(1, собрано / цель)),
    buys15: окно.filter((п) => п.buy).length,
    vol15: окно.reduce((а, п) => а + п.coin, 0),
    growth1h: тогда > 0 && ценаСейчас > 0 ? (ценаСейчас / тогда - 1) * 100 : 0,
    buyers: покупатели.size,
    last: последняя,
  };
}

export async function витрина(сеть) {
  const сейчас = Date.now() / 1000;
  const строки = await строкиСети(сеть);
  const покупателиEVM = ЕВМ.has(сеть)
    ? await import("./_evmWatch.js").then((м) => м.покупателиEVM).catch(() => () => null)
    : () => null;
  const кандидаты = строки.map((т) => меры(т, сеть, сейчас, покупателиEVM)).filter(Boolean);
  // Демо — по тем же правилам, но после настоящих (см. ниже).
  const { демоДляВитрины } = await import("./live.js");
  for (const д of демоДляВитрины(сеть)) {
    if (д.закрыта || !(д.цель > 0) || сейчас - д.последняя / 1000 > ТИШИНА_С || д.покупателей < МИН_ПОКУПАТЕЛЕЙ) continue;
    кандидаты.push({
      id: д.id,
      демо: true,
      progress: Math.max(0, Math.min(1, д.собрано / д.цель)),
      buys15: д.покупок15, vol15: д.оборот15, growth1h: д.рост1ч,
      buyers: д.покупателей, last: д.последняя / 1000,
    });
  }
  /* Мерило — лучший из настоящих, если они есть. Демо торгует в каждом
     блоке: сотни сделок за четверть часа против единиц у живых токенов, и
     мерить по нему значило бы обнулить движение у всех настоящих. */
  const настоящие = кандидаты.filter((к) => !к.демо);
  const мерило = настоящие.length ? настоящие : кандидаты;
  const макс = (поле) => Math.max(0, ...мерило.map((к) => к[поле]));
  const мПокупок = макс("buys15"), мОборот = макс("vol15"), мРост = макс("growth1h");
  const доля = (x, м) => (м > 0 && x > 0 ? Math.min(1, x / м) : 0);
  for (const к of кандидаты) {
    const движение = (доля(к.buys15, мПокупок) + доля(к.vol15, мОборот)) / 2;
    к.score = (к.progress + движение + доля(к.growth1h, мРост)) / 3;
  }
  /* Настоящие — первыми, демо занимает оставшиеся места. Демо торгует
     без остановки и по движению обходил бы любой живой токен, а витрина —
     про то, что происходит на площадке; демо держит её, пока живых мало. */
  кандидаты.sort((a, b) => (a.демо ? 1 : 0) - (b.демо ? 1 : 0) || b.score - a.score || b.last - a.last);
  return кандидаты.slice(0, СКОЛЬКО).map(({ last, демо, ...к }) => к);
}

export default async function handler(req, res) {
  const сеть = String((req.query && req.query.chain) || "");
  if (!СЕТИ.has(сеть)) return res.status(400).json({ error: "bad_chain" });
  res.setHeader("Cache-Control", "no-store");
  const было = кешОтвета.get(сеть);
  if (было && было.до > Date.now()) return res.status(200).json(было.тело);
  try {
    const тело = { at: Date.now(), tokens: await витрина(сеть) };
    кешОтвета.set(сеть, { до: Date.now() + ОТВЕТ_МС, тело });
    return res.status(200).json(тело);
  } catch (e) {
    // Нет ответа — отдаём прежний, если он был: витрина не должна пустеть
    // из-за одного сбоя базы.
    if (было) return res.status(200).json(было.тело);
    return res.status(500).json({ error: "failed", detail: String((e && e.message) || e).slice(0, 160) });
  }
}
