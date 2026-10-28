/* Сводка по токену для бота: поиск, цифры, мини-график.
 *
 * Тем же самым занят и интерфейс, но повторно использовать его код
 * нельзя: там всё завязано на браузер и на состояние React. Здесь —
 * короткий серверный пересказ: найти токен по адресу или тикеру,
 * прочитать состояние кривой с цепочки, добрать историю сделок из своей
 * базы и сложить текст, который не стыдно отправить в чужой чат.
 *
 * Графика в тексте нет: он идёт картинкой над сообщением (см.
 * api/chart.js), и дублировать его блочными символами значило бы
 * показывать одно и то же дважды.
 */

import { adminClient } from "./_support.js";
import { gtЗапрос } from "./_gt.js";

// Сеть TON задаётся одним переключателем на всё приложение (см.
// TON_TESTNET_NETWORK в src/App.tsx). Боевая по умолчанию, тестовая
// включается явно: TON_TESTNET=1.
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
export const NETWORK = TESTNET ? "testnet" : "mainnet";

/* Сеть Solana — своя: программа кривой живёт в той сети, на которую
   смотрит SOLANA_RPC, и токены оттуда лежат в базе с network = "devnet". */
export const SOL_NETWORK = /devnet/.test(process.env.SOLANA_RPC || "") ? "devnet"
  : /testnet/.test(process.env.SOLANA_RPC || "") ? "testnet" : "mainnet";

/* Сети EVM тестовые, пока боевые не включены явно (EVM_MAINNET=1, см.
   api/wallet-evm.js). Токены оттуда приложение пишет с network =
   "testnet" — как TON в тестовой сети. */
export const EVM_NETWORK = process.env.EVM_MAINNET === "1" ? "mainnet" : "testnet";
export const ЦЕПИ_EVM = ["bsc", "base", "eth"];

// Все сети, в которых сейчас живёт приложение: поиск бота видит ровно их.
export const СЕТИ = [...new Set([NETWORK, SOL_NETWORK, EVM_NETWORK])];
// Ни одной боевой — бот честно говорит, что монеты здесь ничего не стоят.
export const ВСЁ_ПРОБНОЕ = СЕТИ.every((с) => с !== "mainnet");

export const APP_URL = process.env.APP_URL || "https://mintly.company";

// Имя основного бота — для ссылок «открыть у бота» из чужих чатов.
const TG_BOT = String(process.env.TG_BOT || "MintlyCobot").replace(/^@/, "").trim();
export const ссылкаБота = (метка) => `https://t.me/${TG_BOT}?start=${метка}`;

// Монета и имя каждой сети — как их пишет приложение. Монета TON с лета
// 2026 называется GRAM (см. ТИКЕР_TON в src/App.tsx), сама сеть — TON.
export const МОНЕТА = { ton: "GRAM", solana: "SOL", bsc: "BNB", base: "ETH", eth: "ETH" };
export const ИМЯ_СЕТИ = { ton: "TON", solana: "Solana", bsc: "BNB Chain", base: "Base", eth: "Ethereum" };
// Куда кривая отдаёт ликвидность после выхода — так и пишем в карточке.
const БИРЖА_СЕТИ = { ton: "STON.fi", solana: "Raydium", bsc: "PancakeSwap", base: "Uniswap", eth: "Uniswap" };

/* Метка свежести для ссылки на картинку. Telegram кэширует превью по
   адресу надолго: без неё в чате неделю висел бы график недельной
   давности. Шаг в пять минут — компромисс: картинка не устаревает
   заметно, но и не перерисовывается на каждый просмотр. */
function свежесть() {
  return Math.floor(Date.now() / 300000);
}

// Витрина приложения показывает не только запущенное здесь: лента
// «Мемпада» приходит с рынка, и в чате бот обязан находить то же самое.
const GT = "https://api.geckoterminal.com/api/v2";
const GT_NETWORK = "ton";

/* Адрес в любой из сетей приложения. Годится, чтобы отличить адрес от
   тикера, а разбирать его по-настоящему тут незачем — сверка идёт по
   строке в базе. Спутать сети нельзя: адрес TON — 48 знаков base64url с
   приставкой EQ/UQ/kQ/0Q, mint Solana — 32–44 знака base58 (без нуля,
   заглавной O, I и l), адрес EVM — 0x и сорок шестнадцатеричных. */
const АДРЕС_TON = /^[EUkK0][QqPp][A-Za-z0-9_-]{46}$/;
const АДРЕС_SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const АДРЕС_EVM = /^0x[0-9a-fA-F]{40}$/;

export function видАдреса(s) {
  const a = String(s || "").trim();
  if (АДРЕС_TON.test(a)) return "ton";
  if (АДРЕС_EVM.test(a)) return "evm";
  if (АДРЕС_SOL.test(a)) return "solana";
  return null;
}

export function looksLikeAddress(s) {
  return !!видАдреса(s);
}

const nano = (v) => Number(v) / 1e9;

/* Цепочка токена.
 *
 * Колонка chain появилась не сразу, и у токенов постарше она пустая: бот
 * показывал мемкоин Solana как TON-овский — цену в TON, шкалу до 85 TON
 * и оборот, которого в этой сети нет. Поэтому колонке верим, а когда её
 * нет — смотрим на сам адрес. У токенов EVM колонка есть всегда: они
 * появились позже неё. */
export function цепочкаТокена(token) {
  const цепь = token && token.chain;
  if (цепь === "solana" || цепь === "ton" || ЦЕПИ_EVM.includes(цепь)) return цепь;
  return видАдреса(token && token.address) === "solana" ? "solana" : "ton";
}

/* Токен из той ли сети, в которой сейчас работает приложение. В базе
   рядом лежат и боевые, и пробные: показывать в чате пробный TON рядом
   с боевым — значит путать людей ценами, которых нет. */
function видимВСети(token) {
  const цепь = цепочкаТокена(token);
  const сеть = (token && token.network) || "mainnet";
  if (цепь === "solana") return сеть === SOL_NETWORK;
  if (цепь === "ton") return сеть === NETWORK;
  return сеть === EVM_NETWORK;
}

/* Состояние кривой прямо из контракта. Порядок полей — из структуры
   CurveData: менять его нельзя, не поправив здесь и в api/notify.js. */
export async function curveState(address, network = null) {
  if (!address) return null;
  try {
    // Сеть берётся у самого токена, когда её сказали: в базе рядом
    // лежат и боевые, и тестовые, а состояние тестовой кривой в боевой
    // сети просто не существует — и график выходил пустым.
    const узел = network === "testnet" ? "https://testnet.tonapi.io"
      : network === "mainnet" ? "https://tonapi.io"
      : TONAPI;
    const res = await fetch(`${узел}/v2/blockchain/accounts/${address}/methods/data`, { method: "POST" });
    if (!res.ok) return null;
    const json = await res.json();
    const stack = json && json.stack;
    if (!Array.isArray(stack) || stack.length < 7) return null;
    const num = (i) => BigInt(stack[i].num);
    return {
      virtualTon: num(0),
      virtualTokens: num(1),
      realTon: num(2),
      tokensSold: num(3),
      tokensForSale: num(4),
      graduationTon: num(5),
      // Комиссия зашита в контракт при запуске: у токенов, созданных до
      // смены настроек, она своя. Нужна, чтобы посчитать, сколько из
      // покупки ушло в резерв, — по этому и строится график.
      feeBps: num(6),
      graduated: stack[7] ? Number(stack[7].num) !== 0 : false,
    };
  } catch (err) {
    return null;
  }
}

/* Логотип из метаданных жетона.
 *
 * В базе ссылка есть не у всех: у токенов, запущенных до того, как
 * приложение стало брать её прямо с запуска, поле пустое. В цепочке
 * картинка при этом лежит всегда — метаданные уезжают в хранилище
 * раньше выпуска. Ответы держим в памяти: одна и та же карточка в чате
 * открывается по многу раз, а картинка у токена не меняется.
 */
const логотипы = new Map();
/* Состояние собственного пула токена: он принимает торговлю после того,
   как кривая набрала порог и отдала ему ликвидность. Поля — в порядке
   структуры PoolData из contracts/src/liquidity_pool.tact. */
export async function poolState(address) {
  if (!address) return null;
  try {
    const res = await fetch(`${TONAPI}/v2/blockchain/accounts/${address}/methods/data`, { method: "POST" });
    if (!res.ok) return null;
    const json = await res.json();
    const stack = json && json.stack;
    if (!Array.isArray(stack) || stack.length < 4) return null;
    return {
      tonReserve: BigInt(stack[0].num),
      tokenReserve: BigInt(stack[1].num),
      feeBps: BigInt(stack[2].num),
      ready: Number(stack[3].num) !== 0,
    };
  } catch (err) {
    return null;
  }
}

export async function логотипЖетона(address) {
  if (!address) return null;
  if (логотипы.has(address)) return логотипы.get(address);
  let url = null;
  try {
    const res = await fetch(`${TONAPI}/v2/jettons/${address}`);
    if (res.ok) {
      const json = await res.json();
      url = (json && json.metadata && json.metadata.image) || (json && json.preview) || null;
    }
  } catch (err) {
    url = null;
  }
  логотипы.set(address, url);
  return url;
}

/* Курс TON в долларах.
 *
 * Держим в памяти пять минут: карточка открывается по многу раз, а курс
 * за это время заметно не двигается. Спрашиваем боевой узел даже в
 * тестовой сети — своей цены у тестового TON нет, и показывать по нему
 * доллары всё равно неоткуда.
 */
let курсКеш = { значение: 0, ts: 0 };
/* Курс SOL. Нужен там же, где и курс TON: капитализация показывается в
   долларах, а токены площадки живут в нескольких сетях. Источника два —
   если первый молчит, второй обычно отвечает; протухшее значение лучше
   прочерка, поэтому кеш возвращается даже устаревшим. */
let курсSolКеш = { значение: 0, ts: 0 };

// свежесть — сколько миллисекунд курс можно брать из памяти. Обмен между
// сетями просит минуту: по пятиминутному курсу его можно было обыгрывать.
export async function курсSol(свежесть = 300000) {
  if (курсSolКеш.значение > 0 && Date.now() - курсSolКеш.ts < свежесть) return курсSolКеш.значение;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    if (res.ok) {
      const json = await res.json();
      const v = Number(json && json.solana && json.solana.usd) || 0;
      if (v > 0) {
        курсSolКеш = { значение: v, ts: Date.now() };
        return v;
      }
    }
  } catch (err) { /* ниже запасной источник */ }
  try {
    const ответ = await gtЗапрос("https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/So11111111111111111111111111111111111111112", { ждать: 1200 });
    if (ответ.ok) {
      const json = ответ.json;
      const цены = json && json.data && json.data.attributes && json.data.attributes.token_prices;
      const v = цены ? Number(Object.values(цены)[0]) || 0 : 0;
      if (v > 0) {
        курсSolКеш = { значение: v, ts: Date.now() };
        return v;
      }
    }
  } catch (err) { /* курса нет — вернём то, что помним */ }
  return курсSolКеш.значение;
}

export async function курсTon(свежесть = 300000) {
  if (курсКеш.значение > 0 && Date.now() - курсКеш.ts < свежесть) return курсКеш.значение;
  try {
    const res = await fetch("https://tonapi.io/v2/rates?tokens=ton&currencies=usd");
    if (res.ok) {
      const json = await res.json();
      const v = Number(json && json.rates && json.rates.TON && json.rates.TON.prices && json.rates.TON.prices.USD) || 0;
      if (v > 0) {
        курсКеш = { значение: v, ts: Date.now() };
        return v;
      }
    }
  } catch (err) { /* ниже запасной источник */ }
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd");
    if (res.ok) {
      const json = await res.json();
      const v = Number(json && json["the-open-network"] && json["the-open-network"].usd) || 0;
      if (v > 0) {
        курсКеш = { значение: v, ts: Date.now() };
        return v;
      }
    }
  } catch (err) { /* курса нет — покажем в монете сети */ }
  return курсКеш.значение;
}

/* Курс BNB и ETH — для капитализации токенов EVM. Тот же порядок, что у
   SOL: пять минут из памяти, протухшее лучше прочерка. */
const курсыEvm = new Map(); // монета -> { значение, ts }
const ID_МОНЕТ = { BNB: "binancecoin", ETH: "ethereum" };
async function курсEvm(монета, свежесть = 300000) {
  const было = курсыEvm.get(монета);
  if (было && было.значение > 0 && Date.now() - было.ts < свежесть) return было.значение;
  const id = ID_МОНЕТ[монета];
  if (!id) return 0;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (res.ok) {
      const json = await res.json();
      const v = Number(json && json[id] && json[id].usd) || 0;
      if (v > 0) {
        курсыEvm.set(монета, { значение: v, ts: Date.now() });
        return v;
      }
    }
  } catch (err) { /* вернём то, что помним */ }
  return (было && было.значение) || 0;
}

// Курс монеты любой сети приложения — в долларах.
export async function курсМонеты(цепь) {
  if (цепь === "solana") return курсSol();
  if (цепь === "ton") return курсTon();
  return курсEvm(МОНЕТА[цепь]);
}

/* Цена одного токена в TON по состоянию кривой. Та же формула, что и в
   интерфейсе: цена — это отношение резервов, а не отдельное поле. */
export function priceFromState(state) {
  if (!state) return 0;
  const резервTon = state.virtualTon + state.realTon;
  const резервТокенов = state.virtualTokens - state.tokensSold;
  if (резервТокенов <= 0n) return 0;
  return Number(резервTon) / Number(резервТокенов);
}

// Последний ответ биржи — для проверки связи: с облачного адреса
// источник может отвечать отказом, и снаружи это выглядит одинаково с
// «ничего не нашлось».
export const gtLast = { path: null, status: null, error: null };

async function gt(path) {
  gtLast.path = path;
  gtLast.status = null;
  gtLast.error = null;
  // Через общую дверь (api/_gt.js): лимит источника один на весь
  // сервер. Обход ленты идёт по кругу и может подождать следующего
  // захода, поэтому очередь ему отмерена короткая — живой запрос с
  // телефона важнее.
  const ответ = await gtЗапрос(`${GT}${path}`, { ждать: 1500 });
  gtLast.status = ответ.status;
  if (ответ.error) gtLast.error = ответ.error;
  return ответ.ok ? ответ.json : null;
}

/* Пул GeckoTerminal к общему виду. Поля те же, что читает лента в
   приложении (см. fetchPoolsPage в src/App.tsx). */
/* Токен без метаданных: в цепочке не заполнено ни имя, ни символ, и
   источник подставляет «Unknown Token» с хвостом адреса, а символом —
   «UKWN…». Показывать нечего, а за такой строкой обычно брошенный пул. */
const БЕЗЫМЯННОЕ_ИМЯ = /^unknown\s*token/i;
const БЕЗЫМЯННЫЙ_ТИКЕР = /^ukwn/i;

function poolToToken(row, tokensById, dexById, цепь = "ton") {
  const a = row.attributes || {};
  const bt = (row.relationships && row.relationships.base_token && row.relationships.base_token.data && tokensById.get(row.relationships.base_token.data.id)) || {};
  const dex = (row.relationships && row.relationships.dex && row.relationships.dex.data && dexById.get(row.relationships.dex.data.id)) || {};
  const имя = bt.name || String(a.name || "TOKEN/TON").split("/")[0].trim();
  const тикер = String(bt.symbol || имя || "TOKEN").toUpperCase().slice(0, 12);
  const цена = parseFloat(a.base_token_price_usd) || 0;
  if (!a.address || !(цена > 0)) return null;
  if (БЕЗЫМЯННОЕ_ИМЯ.test(имя.trim()) || БЕЗЫМЯННЫЙ_ТИКЕР.test(тикер)) return null;
  return {
    external: true,
    chain: цепь,
    id: row.id,
    pool_address: a.address,
    token_address: bt.address || null,
    name: имя,
    ticker: тикер,
    logo_url: bt.image_url && !String(bt.image_url).includes("missing") ? bt.image_url : null,
    emoji: "🪙",
    priceUsd: цена,
    mcapUsd: parseFloat(a.market_cap_usd) || parseFloat(a.fdv_usd) || 0,
    change24: parseFloat(a.price_change_percentage && a.price_change_percentage.h24) || 0,
    volUsd: parseFloat(a.volume_usd && a.volume_usd.h24) || 0,
    liqUsd: parseFloat(a.reserve_in_usd) || 0,
    dex: dex.name || null,
    created_at: a.pool_created_at || null,
  };
}

function поCatalog(json) {
  const included = (json && json.included) || [];
  const tokensById = new Map(included.filter((x) => x.type === "token").map((x) => [x.id, x.attributes || {}]));
  const dexById = new Map(included.filter((x) => x.type === "dex").map((x) => [x.id, x.attributes || {}]));
  return { tokensById, dexById };
}

/* Строка ленты (feed_cache) к тому же виду. Ленту сервер собирает сам и
   держит свежей (api/refresh-feed.js) — это ровно то, что человек видит
   на главной и в «Мемпаде», поэтому бот ищет прежде всего в ней: и
   быстро, и без похода к источнику с его лимитами. */
const КОЛОНКИ_ЛЕНТЫ = "chain, pool_address, token_address, name, ticker, logo_url, price, change24, mcap, liq, vol24, dex_name, pool_created_at";
function изЛенты(r) {
  if (!r || !r.pool_address || !r.ticker) return null;
  const цена = Number(r.price) || 0;
  if (!(цена > 0)) return null;
  return {
    external: true,
    chain: r.chain === "solana" ? "solana" : "ton",
    id: `${r.chain}_${r.pool_address}`,
    pool_address: r.pool_address,
    token_address: r.token_address || null,
    name: String(r.name || r.ticker),
    ticker: String(r.ticker).toUpperCase().slice(0, 12),
    logo_url: r.logo_url || null,
    emoji: "🪙",
    priceUsd: цена,
    mcapUsd: Number(r.mcap) || 0,
    change24: Number(r.change24) || 0,
    volUsd: Number(r.vol24) || 0,
    liqUsd: Number(r.liq) || 0,
    dex: r.dex_name || null,
    created_at: r.pool_created_at || null,
  };
}

async function найтиВЛенте(q, limit) {
  const admin = adminClient();
  if (!admin) return [];
  let запрос = admin.from("feed_cache").select(КОЛОНКИ_ЛЕНТЫ);
  if (looksLikeAddress(q)) {
    запрос = запрос.or(`token_address.eq.${q},pool_address.eq.${q}`);
  } else {
    const чисто = q.replace(/[,()%*\\]/g, " ").trim();
    if (!чисто) return [];
    запрос = запрос.or(`ticker.ilike.%${чисто}%,name.ilike.%${чисто}%`);
  }
  const { data } = await запрос.order("vol24", { ascending: false }).limit(limit * 3);
  // У токена бывает несколько пулов: оставляем самый оборотистый — список
  // уже отсортирован по обороту, так что первый и есть он.
  const видели = new Set();
  const итог = [];
  for (const r of data || []) {
    const t = изЛенты(r);
    if (!t) continue;
    const ключ = t.token_address || t.ticker;
    if (видели.has(ключ)) continue;
    видели.add(ключ);
    итог.push(t);
  }
  // Точное совпадение тикера — вперёд: по запросу «NOT» человек ждёт
  // Notcoin, а не «Not Meme» с чуть большим оборотом.
  const точно = q.toLowerCase();
  return итог
    .sort((a, b) => (a.ticker.toLowerCase() === точно ? 0 : 1) - (b.ticker.toLowerCase() === точно ? 0 : 1))
    .slice(0, limit);
}

/* Есть ли в базе колонка с парой на бирже. Ответ не меняется в течение
   жизни процесса, поэтому спрашиваем один раз. */
let колонкаПула = null;
async function естьКолонкаПула(admin) {
  if (колонкаПула !== null) return колонкаПула;
  const { error } = await admin.from("tokens").select("dex_pool_address").limit(1);
  колонкаПула = !error;
  return колонкаПула;
}

/* Поиск по рынку: тикер, название или адрес. Сперва лента приложения,
   потом — в боевой сети — поиск GeckoTerminal по TON: в ленте лежит не
   всё, что торгуется на биржах. GeckoTerminal ищет по пулам, поэтому
   один и тот же токен приходит несколько раз — оставляем пул с самой
   большой ликвидностью, он и есть настоящий рынок. */
export async function findExternal(query, limit = 5) {
  const q = String(query || "").trim().replace(/^\$/, "");
  if (!q) return [];
  const лента = await найтиВЛенте(q, limit).catch(() => []);
  // В тестовой сети TON чужих бирж нет: искать там по GeckoTerminal —
  // значит показывать боевые пулы, которые здесь не купить.
  if (лента.length >= limit || TESTNET) return лента.slice(0, limit);
  const json = await gt(`/search/pools?query=${encodeURIComponent(q)}&network=${GT_NETWORK}&include=base_token,dex`);
  if (!json || !Array.isArray(json.data)) return лента;
  const { tokensById, dexById } = поCatalog(json);
  const лучшие = new Map();
  for (const row of json.data) {
    const t = poolToToken(row, tokensById, dexById);
    if (!t) continue;
    const ключ = t.token_address || t.ticker;
    const было = лучшие.get(ключ);
    if (!было || t.liqUsd > было.liqUsd) лучшие.set(ключ, t);
  }
  const точно = q.toLowerCase();
  const сБиржи = [...лучшие.values()]
    .sort((a, b) => {
      const ta = a.ticker.toLowerCase() === точно ? 0 : 1;
      const tb = b.ticker.toLowerCase() === точно ? 0 : 1;
      return ta - tb || b.liqUsd - a.liqUsd;
    });
  const адреса = new Set(лента.map((t) => t.token_address).filter(Boolean));
  return [...лента, ...сБиржи.filter((t) => !t.token_address || !адреса.has(t.token_address))].slice(0, limit);
}

/* То, что торгуют прямо сейчас, — та же лента, что на главной: самые
   оборотистые за сутки, по одному пулу на тикер. */
export async function trendingExternal(limit = 5) {
  const admin = adminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("feed_cache")
    .select(КОЛОНКИ_ЛЕНТЫ)
    .order("vol24", { ascending: false })
    .limit(limit * 4);
  const видели = new Set();
  const итог = [];
  for (const r of data || []) {
    const t = изЛенты(r);
    if (!t || видели.has(t.ticker)) continue;
    видели.add(t.ticker);
    итог.push(t);
    if (итог.length >= limit) break;
  }
  return итог;
}

/* Один пул по адресу — для ссылок вида «?pool=…» и кнопки «Обновить».
   Сперва лента (там свежие цифры без похода к источнику), потом
   GeckoTerminal — в той сети, на которую похож адрес пула. */
export async function poolByAddress(address) {
  const admin = adminClient();
  if (admin) {
    const { data } = await admin.from("feed_cache").select(КОЛОНКИ_ЛЕНТЫ).eq("pool_address", address).limit(1);
    const t = data && data[0] ? изЛенты(data[0]) : null;
    if (t) return t;
  }
  const цепь = видАдреса(address) === "solana" ? "solana" : "ton";
  const json = await gt(`/networks/${цепь}/pools/${address}?include=base_token,dex`);
  if (!json || !json.data) return null;
  const { tokensById, dexById } = поCatalog(json);
  return poolToToken(json.data, tokensById, dexById, цепь);
}

/* Поиск своих токенов. Адрес ищем точным совпадением, всё остальное — по
   тикеру и названию. Порядок: сперва точное совпадение тикера, потом
   остальные, свежие выше. Пустой запрос — свежие запуски во всех сетях
   приложения: это и есть «что нового в Mintly». */
export async function findTokens(query, limit = 8) {
  const admin = adminClient();
  if (!admin) return [];
  const q = String(query || "").trim().replace(/^\$/, "");
  // Колонки ровно те, что есть в таблице: адрес жетона называется
  // «address», отдельного поля под эмодзи нет вовсе. Лишнее имя здесь
  // роняет весь запрос, и поиск молча возвращает пустоту.
  // dex_pool_address появился позже остальных (см. supabase_listing.sql).
  // Пока миграция не выполнена, колонки в базе нет, и запрос с ней
  // отбивается целиком — поэтому один раз проверяем и дальше помним.
  const колонки = `id, name, ticker, logo_url, address, curve_address, chain, network, created_at, owner_id${await естьКолонкаПула(admin) ? ", dex_pool_address" : ""}`;

  // Берём с запасом: часть строк отсеется сверкой «своя ли сеть», а
  // обрезать выдачу до неё значило бы терять найденное.
  const запас = limit * 3;
  let ряд;
  const вид = видАдреса(q);
  if (вид) {
    /* Адрес EVM в базе может лежать в любом регистре — сравниваем без
       него. Адрес кривой у EVM — это фабрика, одна на все токены сети,
       поэтому по нему не ищем: нашлись бы все токены разом. */
    const условие = вид === "evm"
      ? `address.ilike.${q}`
      : `address.eq.${q},curve_address.eq.${q}`;
    const { data } = await admin
      .from("tokens")
      .select(колонки)
      .in("network", СЕТИ)
      .or(условие)
      .limit(запас);
    ряд = data || [];
  } else if (q) {
    // Экранируем запятую и скобки: строка уходит в or() как выражение
    // PostgREST, и запятая в ней разделяет условия.
    const чисто = q.replace(/[,()%*\\]/g, " ").trim();
    if (!чисто) return [];
    const { data } = await admin
      .from("tokens")
      .select(колонки)
      .in("network", СЕТИ)
      .or(`ticker.ilike.%${чисто}%,name.ilike.%${чисто}%`)
      .order("created_at", { ascending: false })
      .limit(запас);
    ряд = data || [];
    const точно = чисто.toLowerCase();
    ряд.sort((a, b) => {
      const ta = String(a.ticker || "").toLowerCase() === точно ? 0 : 1;
      const tb = String(b.ticker || "").toLowerCase() === точно ? 0 : 1;
      return ta - tb;
    });
  } else {
    /* Пустой запрос — свежие запуски. Раньше здесь была витрина «самые
       собравшие», но только по TON: собранное в разных сетях считается в
       разных монетах и напрямую не сравнивается, а в тестовой сети денег
       нет вовсе — и бот отвечал пустым списком, хотя токены были. */
    const { data } = await admin
      .from("tokens")
      .select(колонки)
      .in("network", СЕТИ)
      .order("created_at", { ascending: false })
      .limit(запас);
    ряд = data || [];
  }
  return ряд.filter(видимВСети).slice(0, limit);
}

/* Сделки токена из своей базы: по ним считаются движение цены и
   мини-график. Цепочка знает это точнее, но обход транзакций кривой
   ради строчки в чате — минуты ожидания и упор в лимиты tonapi. */
async function tradeHistory(tokenId) {
  const admin = adminClient();
  if (!admin || !tokenId) return [];
  const { data } = await admin
    .from("trades")
    .select("side, ton_amount, token_amount, created_at")
    .eq("token_id", tokenId)
    .order("created_at", { ascending: true })
    .limit(400);
  return (data || [])
    .map((с) => {
      const ton = Number(с.ton_amount) || 0;
      const шт = Number(с.token_amount) || 0;
      if (!(ton > 0) || !(шт > 0)) return null;
      return { price: ton / шт, at: new Date(с.created_at).getTime(), ton };
    })
    .filter(Boolean);
}

export function fmtTon(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 1) return v.toFixed(2).replace(/\.?0+$/, "");
  if (v > 0) return v.toFixed(4).replace(/\.?0+$/, "");
  return "0";
}

/* Цена одного токена в монете сети. Экспонента вида 8.96e−7 в чате
   читается как ошибка, а не как цена, — показываем десятичной дробью,
   сколько бы нулей ни было. */
function fmtЦены(v, монета) {
  const n = Number(v) || 0;
  if (n <= 0) return "—";
  if (n >= 0.001) return `${n.toFixed(5)} ${монета}`;
  return `${n.toFixed(12).replace(/0+$/, "")} ${монета}`;
}

function fmtAge(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const мин = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (мин < 60) return `${мин} мин`;
  const ч = Math.floor(мин / 60);
  if (ч < 24) return `${ч} ч`;
  const д = Math.floor(ч / 24);
  return д < 30 ? `${д} дн` : `${Math.floor(д / 30)} мес`;
}

const escape = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Строка о пробной сети — сразу под названием: в чате карточка живёт
   сама по себе, и без неё монету из тестовой сети покупают всерьёз. */
function строкаПробнойСети(token, цепь) {
  if (!token.network || token.network === "mainnet") return null;
  return `⚠️ Тестовая сеть ${ИМЯ_СЕТИ[цепь]} — монеты здесь ничего не стоят`;
}

/* Состояние кривой из готового кеша.
 *
 * Обход (api/refresh-curves.js) ходит по кривым раз в минуту и
 * складывает числа в curve_cache. Спрашивать те же числа у цепочки на
 * каждую подсказку в чате — значит ждать секунду там, где Telegram даёт
 * доли секунды: подсказка успевала истечь раньше, чем приходил ответ.
 *
 * Поэтому сначала смотрим кеш и только при его отсутствии идём в сеть.
 */
const КЕШ_СВЕЖ_МС = 3 * 60 * 1000;

async function состояниеИзКеша(tokenId) {
  const admin = adminClient();
  if (!admin || !tokenId) return null;
  const { data } = await admin
    .from("curve_cache")
    .select("real_ton, graduation_ton, tokens_sold, price_ton, fee_bps, graduated, updated_at")
    .eq("token_id", tokenId)
    .maybeSingle();
  if (!data || !data.updated_at) return null;
  if (Date.now() - new Date(data.updated_at).getTime() > КЕШ_СВЕЖ_МС) return null;
  const нано = (v) => BigInt(Math.round((Number(v) || 0) * 1e9));
  return {
    virtualTon: 0n,
    virtualTokens: 0n,
    realTon: нано(data.real_ton),
    tokensSold: нано(data.tokens_sold),
    tokensForSale: 0n,
    graduationTon: нано(data.graduation_ton),
    // «|| 100» превращал честный ноль в процент — ноль теперь норма.
    feeBps: BigInt(data.fee_bps == null ? 0 : Number(data.fee_bps)),
    graduated: !!data.graduated,
    // Цена уже посчитана обходом — брать её оттуда точнее, чем считать
    // по резервам без виртуальных: их в кеше нет.
    ценаГотовая: Number(data.price_ton) || 0,
  };
}

/* Общая часть карточки своего токена: то, что нужно боту для сделки в
   чате, одинаково во всех сетях. Сделка идёт кошельком приложения через
   его же обработчик (api/_botTrade.js), поэтому карточке достаточно
   знать сеть, адрес токена и его номер в базе. */
function основаКарточки(token, цепь, { цена = 0, торгуется = false, лого = null } = {}) {
  const тикер = escape(String(token.ticker || "").toUpperCase());
  return {
    title: `$${тикер} — ${escape(token.name || token.ticker || "?")}`,
    link: `${APP_URL}?token=${token.id}`,
    chart: `${APP_URL}/api/chart?token=${token.id}&t=${свежесть()}`,
    ref: `t:${token.id}`,
    chain: цепь,
    монета: МОНЕТА[цепь],
    tokenId: token.id,
    address: token.address || null,
    ticker: тикер,
    цена,
    торгуется,
    botLink: ссылкаБота(`tok_${token.id}`),
    thumb: лого || token.logo_url || null,
  };
}

/* Карточка своего токена в Solana.
 *
 * Отдельно от TON не по прихоти: там другая цепочка, своя программа
 * кривой и своя монета. Раньше такой токен шёл общим путём, состояние
 * искалось у TON и не находилось — в чате он выглядел мёртвым, хотя
 * кривая живёт и торгуется.
 *
 * Капитализация, как и везде, в долларах: цена за весь выпуск по
 * текущему курсу монеты.
 */
async function карточкаSolana(token) {
  const { состояние } = await import("./solana-launch.js");
  const [s, курс] = await Promise.all([
    состояние(token.address).catch(() => null),
    курсSol().catch(() => 0),
  ]);

  const имя = escape(token.name || token.ticker || "?");
  const тикер = escape(String(token.ticker || "").toUpperCase());
  const капа = s && курс > 0 ? s.ценаSol * 1e9 * курс : 0;
  const доля = s && s.solЦель > 0 ? Math.max(0, Math.min(1, s.solСобрано / s.solЦель)) : 0;

  const строки = [
    `${token.logo_url ? "🪙" : "🚀"} <b>${имя}</b> · $${тикер}`,
    "",
    `💰 Цена: ${s ? fmtЦены(s.ценаSol, "SOL") : "—"}`,
    `📊 Капа: ${капа > 0 ? fmtUsd(капа) : "—"}`,
  ];
  if (s) {
    строки.push("");
    строки.push(s.закрыта
      ? `🎉 Кривая закрыта, собрано ${s.solСобрано.toFixed(2)} SOL — торгуется на ${БИРЖА_СЕТИ.solana}`
      : `🚀 Собрано для выхода на биржу: ${(доля * 100).toFixed(0)}%\n${s.solСобрано.toFixed(2)} / ${s.solЦель.toFixed(0)} SOL`);
  }
  const пробная = строкаПробнойСети(token, "solana");
  if (пробная) строки.splice(2, 0, пробная);
  строки.push(`\n⛓ Solana · <code>${escape(token.address || "")}</code>`);

  return {
    ...основаКарточки(token, "solana", { цена: s ? s.ценаSol : 0, торгуется: !!(s && token.address) }),
    text: строки.join("\n"),
    description: s
      ? `Solana · ${капа > 0 ? fmtUsd(капа) : "—"} · ${s.solСобрано.toFixed(2)}/${s.solЦель.toFixed(0)} SOL`
      : "Solana · кривая ещё не отвечает — открой в приложении",
  };
}

/* Карточка своего токена в EVM (BNB Chain, Base, Ethereum).
 *
 * Кривая у всех токенов сети одна — фабрика, и состояние токена она
 * отдаёт по его адресу (api/wallet-evm.js). После выхода на биржу сделки
 * идут роутером той биржи, куда кривая сама завела пару, — тем же
 * обработчиком, поэтому торговать из чата можно и тогда. */
async function карточкаEVM(token, цепь) {
  const evm = await import("./wallet-evm.js").catch(() => null);
  const сеть = (evm && evm.СЕТИ && evm.СЕТИ[цепь]) || null;
  const [s, курс] = await Promise.all([
    evm && сеть && сеть.фабрика && token.address ? evm.состояниеКривой(цепь, token.address).catch(() => null) : Promise.resolve(null),
    курсМонеты(цепь).catch(() => 0),
  ]);
  const монета = МОНЕТА[цепь];
  const имя = escape(token.name || token.ticker || "?");
  const тикер = escape(String(token.ticker || "").toUpperCase());
  const капа = s && курс > 0 ? s.price * 1e9 * курс : 0;
  const доля = s && s.graduationNative > 0 ? Math.max(0, Math.min(1, s.realNative / s.graduationNative)) : 0;

  const строки = [
    `${token.logo_url ? "🪙" : "🚀"} <b>${имя}</b> · $${тикер}`,
    "",
    `💰 Цена: ${s ? fmtЦены(s.price, монета) : "—"}`,
    `📊 Капа: ${капа > 0 ? fmtUsd(капа) : "—"}`,
  ];
  if (s) {
    строки.push("");
    строки.push(s.graduated
      ? `🎉 Кривая закрыта — торгуется на ${БИРЖА_СЕТИ[цепь]}`
      : `🚀 Собрано для выхода на биржу: ${(доля * 100).toFixed(0)}%\n${fmtTon(s.realNative)} / ${fmtTon(s.graduationNative)} ${монета}`);
  }
  const пробная = строкаПробнойСети(token, цепь);
  if (пробная) строки.splice(2, 0, пробная);
  строки.push(`\n⛓ ${ИМЯ_СЕТИ[цепь]} · <code>${escape(token.address || "")}</code>`);

  return {
    ...основаКарточки(token, цепь, { цена: s ? s.price : 0, торгуется: !!s }),
    text: строки.join("\n"),
    description: s
      ? `${ИМЯ_СЕТИ[цепь]} · ${капа > 0 ? fmtUsd(капа) : "—"} · ${fmtTon(s.realNative)}/${fmtTon(s.graduationNative)} ${монета}`
      : `${ИМЯ_СЕТИ[цепь]} · кривая ещё не отвечает — открой в приложении`,
  };
}

/* Полная сводка по одному токену: и текст сообщения, и короткая строка
   для списка в inline-подсказке. */
export async function tokenCard(token) {
  const цепь = цепочкаТокена(token);
  if (цепь === "solana") return await карточкаSolana(token);
  if (ЦЕПИ_EVM.includes(цепь)) return await карточкаEVM(token, цепь);

  const [state, история, логотип, курс] = await Promise.all([
    // Сначала кеш, и только если он пуст или протух — цепочка.
    состояниеИзКеша(token.id).then((к) => к || curveState(token.curve_address, token.network)),
    tradeHistory(token.id),
    token.logo_url ? Promise.resolve(token.logo_url) : логотипЖетона(token.address),
    курсTon(),
  ]);

  const цена = state && state.ценаГотовая > 0 ? state.ценаГотовая : priceFromState(state);
  const собрано = state ? nano(state.realTon) : 0;
  const цель = state ? nano(state.graduationTon) : 0;
  // Капитализация — цена за весь выпуск (миллиард) и сразу в долларах:
  // в монете сети её приходилось пересчитывать в уме, а привыкли к доллару.
  const капа = цена > 0 && курс > 0 ? цена * 1000000000 * курс : 0;

  // Движение за сутки считаем по своим сделкам: первая за 24 часа против
  // текущей цены кривой. Сделок нет — движения тоже нет, и рисовать
  // «+0.00%» честнее, чем выдумывать.
  const сутки = Date.now() - 24 * 3600 * 1000;
  const заСутки = история.filter((p) => p.at >= сутки);
  const старт = заСутки.length ? заСутки[0].price : (история.length ? история[0].price : 0);
  const движение = старт > 0 && цена > 0 ? ((цена - старт) / старт) * 100 : 0;
  const оборот = заСутки.reduce((s, p) => s + p.ton, 0);

  const доля = цель > 0 ? Math.max(0, Math.min(1, собрано / цель)) : 0;

  const имя = escape(token.name || token.ticker || "?");
  // Своего эмодзи у токенов нет — в приложении им рисуется ракета.
  const значок = логотип ? "🪙" : "🚀";
  const тикер = escape(String(token.ticker || "").toUpperCase());
  const знак = движение >= 0 ? "+" : "";
  const стрелкаЭмодзи = движение > 0 ? "🔺" : движение < 0 ? "🔻" : "▪️";

  const строки = [
    `${значок} <b>${имя}</b> · $${тикер}`,
    "",
    `💰 Цена: ${fmtЦены(цена, "GRAM")}`,
    // Капитализация всегда в долларах: рядом в ленте и на бирже она в
    // долларах. Курс не пришёл — честный прочерк, а не другая единица.
    `📊 Капа: ${капа > 0 ? fmtUsd(капа) : "—"} · ${стрелкаЭмодзи} ${знак}${движение.toFixed(2)}% за 24ч`,
  ];
  if (цель > 0) {
    строки.push("");
    // «На бирже» — только когда пара действительно заведена: контракт
    // закрывает кривую сам, а пару из собранной ликвидности заводят
    // отдельным действием, и до неё торговать негде.
    строки.push(state && state.graduated
      ? (token.dex_pool_address
        ? `🎉 Кривая закрыта, собрано ${fmtTon(собрано)} GRAM — торгуется на ${БИРЖА_СЕТИ.ton}`
        : `🎉 Кривая закрыта, собрано ${fmtTon(собрано)} GRAM — пара на бирже готовится`)
      : `🚀 Собрано для выхода на биржу: ${(доля * 100).toFixed(0)}%\n${fmtTon(собрано)} / ${fmtTon(цель)} GRAM`);
  }
  строки.push("");
  строки.push(`📈 Оборот 24ч: ${fmtTon(оборот)} GRAM`);
  строки.push(`🔄 Сделок: ${история.length} · ⏱ С запуска: ${fmtAge(token.created_at)}`);
  const пробная = строкаПробнойСети(token, "ton");
  if (пробная) строки.splice(2, 0, пробная);
  if (token.address) строки.push(`\n⛓ TON · <code>${escape(token.address)}</code>`);

  // В строке подсказки — то же, что и в карточке: капитализация в
  // долларах первой, потом движение и путь до листинга. Цена мемкоина ни
  // с чем не сравнима: у одного она в миллионных долях, у другого в
  // тысячных, а капа сопоставима.
  const описание = state
    ? `TON · ${капа > 0 ? fmtUsd(капа) : fmtЦены(цена, "GRAM")} · ${знак}${движение.toFixed(1)}% · ${fmtTon(собрано)}/${fmtTon(цель)} GRAM`
    : "TON · кривая ещё не отвечает — открой в приложении";

  // Закрытая кривая без пары на бирже не принимает ни покупок, ни
  // продаж: показывать кнопку, которую контракт отобьёт, — врать.
  const торгуется = !!(state && (state.graduated ? token.dex_pool_address : token.curve_address));
  return {
    ...основаКарточки(token, "ton", { цена, торгуется, лого: логотип }),
    text: строки.join("\n"),
    description: описание,
  };
}


function fmtUsd(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v > 0) return `$${v.toFixed(9).replace(/(\.\d*?)0+$/, "$1")}`;
  return "—";
}

/* Карточка токена с рынка: своей кривой у него нет, все цифры — из ленты
   или с биржи, поэтому и путь до листинга тут ни при чём, он уже там.
   Торгуется он в приложении: туда и ведёт кнопка. */
export async function externalCard(token) {
  const цепь = token.chain === "solana" ? "solana" : "ton";
  const знак = token.change24 >= 0 ? "+" : "";
  const стрелка = token.change24 > 0 ? "🔺" : token.change24 < 0 ? "🔻" : "▪️";
  const строки = [
    `${token.emoji || "🪙"} <b>${escape(token.name)}</b> · $${escape(token.ticker)}`,
    "",
    `💰 Цена: ${fmtUsd(token.priceUsd)}`,
    `📊 Капа: ${fmtUsd(token.mcapUsd)} · ${стрелка} ${знак}${token.change24.toFixed(2)}% за 24ч`,
    "",
    `📈 Оборот 24ч: ${fmtUsd(token.volUsd)} · 💧 Ликвидность: ${fmtUsd(token.liqUsd)}`,
  ];
  строки.push(`\n⛓ ${ИМЯ_СЕТИ[цепь]}${token.dex ? ` · ${escape(token.dex)}` : ""}${token.token_address ? ` · <code>${escape(token.token_address)}</code>` : ""}`);

  return {
    text: строки.join("\n"),
    title: `$${token.ticker} — ${token.name}`,
    description: `${ИМЯ_СЕТИ[цепь]} · ${fmtUsd(token.mcapUsd)} · ${знак}${token.change24.toFixed(1)}% · оборот ${fmtUsd(token.volUsd)}`,
    ticker: token.ticker,
    chain: цепь,
    монета: МОНЕТА[цепь],
    external: true,
    торгуется: false,
    link: `${APP_URL}?pool=${token.pool_address}`,
    chart: `${APP_URL}/api/chart?pool=${token.pool_address}&t=${свежесть()}`,
    ref: `p:${token.pool_address}`,
    botLink: ссылкаБота(`pool_${token.pool_address}`),
    thumb: token.logo_url || null,
  };
}

/* Общий вход: сперва своё, потом рынок. Свои токены впереди намеренно —
   бот всё-таки про Mintly, и запущенное здесь должно находиться первым. */
export async function searchAll(query, limit = 8) {
  // Свои токены и рыночные ищем одновременно. По очереди это стоило двух
  // ожиданий подряд, а подсказке в чате Telegram отводит доли секунды:
  // лишний поход в сеть — и она исчезает, не дождавшись ответа.
  const строка = String(query || "").trim();
  const [свои, чужие] = await Promise.all([
    findTokens(query, limit).catch(() => []),
    строка ? findExternal(строка, limit).catch(() => []) : Promise.resolve([]),
  ]);
  if (свои.length >= limit || !строка) return свои.slice(0, limit);
  // Один и тот же токен мог и запуститься здесь, и уехать на биржу:
  // показываем его один раз, своей карточкой.
  const адреса = new Set(свои.map((t) => t.address).filter(Boolean));
  const добор = чужие.filter((t) => !t.token_address || !адреса.has(t.token_address));
  return [...свои, ...добор].slice(0, limit);
}

/* Карточка для любого из двух видов. */
export function cardFor(token) {
  return token.external ? externalCard(token) : tokenCard(token);
}

/* Пересобрать карточку по короткой метке из кнопки «обновить».
   В callback_data помещается 64 байта, поэтому там только вид и
   опознаватель: «p» — пул на бирже, «t» — токен Mintly. */
export async function cardByRef(вид, ключ) {
  if (вид === "p") {
    const пул = await poolByAddress(ключ);
    return пул ? externalCard(пул) : null;
  }
  const admin = adminClient();
  if (!admin) return null;
  // Сеть и цепочка нужны карточке: без них токен Solana или EVM
  // собирался как TON-овский, и цифры брались не из той сети.
  const { data } = await admin
    .from("tokens")
    .select(`id, name, ticker, logo_url, address, curve_address, chain, network, created_at, owner_id${await естьКолонкаПула(admin) ? ", dex_pool_address" : ""}`)
    .eq("id", ключ)
    .maybeSingle();
  return data ? tokenCard(data) : null;
}

/* Ссылка на картинку с меткой текущей секунды. Нужна ровно там, где
   человек сам попросил обновить: обычная пятиминутная метка вернула бы
   ту же картинку из кэша Telegram, и кнопка выглядела бы сломанной. */
export function свежийГрафик(chart) {
  const адрес = String(chart || "").replace(/&t=\d+/, `&t=${Date.now()}`);
  if (!адрес) return адрес;
  // fresh=1 — просьба к рисовалке прочитать цепочку прямо сейчас, а не
  // брать историю из кеша: по нажатию «Обновить» человек ждёт именно
  // свежую картинку, а не ту, что успел записать обход.
  return адрес.includes("fresh=1") ? адрес : `${адрес}&fresh=1`;
}
