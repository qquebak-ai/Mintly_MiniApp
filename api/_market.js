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

// Сеть задаётся одним переключателем на всё приложение (см.
// TON_TESTNET_NETWORK в src/App.tsx). Здесь по умолчанию тестовая —
// вернуть боевую можно переменной окружения TON_TESTNET=0.
// Боевая сеть по умолчанию. Тестовая включается явно: TON_TESTNET=1.
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
export const NETWORK = TESTNET ? "testnet" : "mainnet";

/* Сеть Solana — своя. Кривая TON давно в боевой сети, а программа Solana
   ещё в devnet, и токены оттуда лежат в базе с network = "devnet".
   Искать их надо: человек, спросивший бота про свой токен, должен его
   найти, — а вот в витрину «самые собравшие» они не попадают: там
   сравниваются деньги, а в пробной сети их нет. */
export const SOL_NETWORK = /devnet/.test(process.env.SOLANA_RPC || "") ? "devnet"
  : /testnet/.test(process.env.SOLANA_RPC || "") ? "testnet" : "mainnet";
export const СЕТИ = [...new Set([NETWORK, SOL_NETWORK])];

export const APP_URL = process.env.APP_URL || "https://mintly.company";

/* Метка свежести для ссылки на картинку. Telegram кэширует превью по
   адресу надолго: без неё в чате неделю висел бы график недельной
   давности. Шаг в пять минут — компромисс: картинка не устаревает
   заметно, но и не перерисовывается на каждый просмотр. */
function свежесть() {
  return Math.floor(Date.now() / 300000);
}

// Витрина приложения показывает не только запущенное здесь: лента
// «Мемпада» приходит из GeckoTerminal, и в чате бот обязан находить то
// же самое. Ключа этот источник не требует, но и щедрым не бывает —
// поэтому на один ответ уходит не больше пары запросов.
const GT = "https://api.geckoterminal.com/api/v2";
const GT_NETWORK = "ton";

// Адрес TON в любом из принятых написаний: EQ/UQ/kQ/0Q и 46 знаков
// base64url. Годится, чтобы отличить адрес от тикера, а разбирать его
// по-настоящему тут незачем — сверка идёт по строке в базе.
const ADDR_RE = /^[EUkK0][QqPp][A-Za-z0-9_-]{46}$/;

export function looksLikeAddress(s) {
  return ADDR_RE.test(String(s || "").trim());
}

const nano = (v) => Number(v) / 1e9;

/* Цепочка токена.
 *
 * Колонка chain появилась не сразу, и у токенов постарше она пустая: бот
 * показывал мемкоин Solana как TON-овский — цену в TON, шкалу до 85 TON
 * и оборот, которого в этой сети нет. Поэтому колонке верим, а когда её
 * нет — смотрим на сам адрес. Спутать их нельзя: адрес TON это 48
 * символов base64url с приставкой EQ/UQ/kQ/0Q, а mint Solana — 32-44
 * символа base58, где нет ни нуля, ни заглавной O, ни I с l. */
export function цепочкаТокена(token) {
  if (token && token.chain) return token.chain === "solana" ? "solana" : "ton";
  const адрес = String((token && token.address) || "").trim();
  const похожНаSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(адрес) && !/^(EQ|UQ|kQ|0Q)/.test(адрес);
  return похожНаSolana ? "solana" : "ton";
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
   долларах, а токены площадки живут в двух сетях. Источника два — если
   первый молчит, второй обычно отвечает; протухшее значение лучше
   прочерка, поэтому кеш возвращается даже устаревшим. */
let курсSolКеш = { значение: 0, ts: 0 };

export async function курсSol() {
  if (курсSolКеш.значение > 0 && Date.now() - курсSolКеш.ts < 300000) return курсSolКеш.значение;
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

export async function курсTon() {
  if (курсКеш.значение > 0 && Date.now() - курсКеш.ts < 300000) return курсКеш.значение;
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
  } catch (err) { /* курса нет — покажем в TON */ }
  return курсКеш.значение;
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

function poolToToken(row, tokensById, dexById) {
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

/* Есть ли в базе колонка с парой на бирже. Ответ не меняется в течение
   жизни процесса, поэтому спрашиваем один раз. */
let колонкаПула = null;
async function естьКолонкаПула(admin) {
  if (колонкаПула !== null) return колонкаПула;
  const { error } = await admin.from("tokens").select("dex_pool_address").limit(1);
  колонкаПула = !error;
  return колонкаПула;
}

/* Поиск по бирже: тикер, название или адрес. GeckoTerminal ищет по
   пулам, поэтому один и тот же токен приходит несколько раз — оставляем
   пул с самой большой ликвидностью, он и есть настоящий рынок. */
export async function findExternal(query, limit = 5) {
  // В тестовой сети бирж нет: их токены здесь не купить, и показывать
  // чужие графики вперемешку со своими значит путать сети.
  if (TESTNET) return [];
  const q = String(query || "").trim().replace(/^\$/, "");
  if (!q) return [];
  const json = await gt(`/search/pools?query=${encodeURIComponent(q)}&network=${GT_NETWORK}&include=base_token,dex`);
  if (!json || !Array.isArray(json.data)) return [];
  const { tokensById, dexById } = поCatalog(json);
  const лучшие = new Map();
  for (const row of json.data) {
    const t = poolToToken(row, tokensById, dexById);
    if (!t) continue;
    const ключ = t.token_address || t.ticker;
    const было = лучшие.get(ключ);
    if (!было || t.liqUsd > было.liqUsd) лучшие.set(ключ, t);
  }
  // Точное совпадение тикера — вперёд: по запросу «NOT» человек ждёт
  // Notcoin, а не «Not Meme» с чуть большей ликвидностью.
  const точно = q.toLowerCase();
  return [...лучшие.values()]
    .sort((a, b) => {
      const ta = a.ticker.toLowerCase() === точно ? 0 : 1;
      const tb = b.ticker.toLowerCase() === точно ? 0 : 1;
      return ta - tb || b.liqUsd - a.liqUsd;
    })
    .slice(0, limit);
}

/* То, что торгуют прямо сейчас, — та же лента, что на главной. */
export async function trendingExternal(limit = 5) {
  if (TESTNET) return [];
  const json = await gt(`/networks/${GT_NETWORK}/trending_pools?include=base_token,dex`);
  if (!json || !Array.isArray(json.data)) return [];
  const { tokensById, dexById } = поCatalog(json);
  const лучшие = new Map();
  for (const row of json.data) {
    const t = poolToToken(row, tokensById, dexById);
    if (!t) continue;
    const ключ = t.token_address || t.ticker;
    if (!лучшие.has(ключ)) лучшие.set(ключ, t);
  }
  return [...лучшие.values()].slice(0, limit);
}

/* Один пул по адресу — для ссылок вида «?pool=…». */
export async function poolByAddress(address) {
  const json = await gt(`/networks/${GT_NETWORK}/pools/${address}?include=base_token,dex`);
  if (!json || !json.data) return null;
  const { tokensById, dexById } = поCatalog(json);
  return poolToToken(json.data, tokensById, dexById);
}

/* Поиск. Адрес ищем точным совпадением, всё остальное — по тикеру и
   названию. Порядок: сперва точное совпадение тикера, потом остальные,
   свежие выше. */
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

  let ряд;
  if (looksLikeAddress(q)) {
    const { data } = await admin
      .from("tokens")
      .select(колонки)
      .in("network", СЕТИ)
      .or(`address.eq.${q},curve_address.eq.${q}`)
      .limit(limit);
    ряд = data || [];
  } else if (q) {
    // Экранируем запятую и скобки: строка уходит в or() как выражение
    // PostgREST, и запятая в ней разделяет условия.
    const чисто = q.replace(/[,()]/g, " ").trim();
    if (!чисто) return [];
    const { data } = await admin
      .from("tokens")
      .select(колонки)
      .in("network", СЕТИ)
      .or(`ticker.ilike.%${чисто}%,name.ilike.%${чисто}%`)
      .order("created_at", { ascending: false })
      .limit(limit);
    ряд = data || [];
    const точно = чисто.toLowerCase();
    ряд.sort((a, b) => {
      const ta = String(a.ticker || "").toLowerCase() === точно ? 0 : 1;
      const tb = String(b.ticker || "").toLowerCase() === точно ? 0 : 1;
      return ta - tb;
    });
  } else {
    // Пустой запрос — витрина: самые собравшие. Собранное лежит в
    // token_notify, её обходит расписание уведомлений.
    const { data } = await admin
      .from("tokens")
      .select(`${колонки}, token_notify (last_real_ton)`)
      .eq("network", NETWORK)
      .order("created_at", { ascending: false })
      .limit(30);
    ряд = (data || [])
      .map((t) => ({ ...t, _собрано: Number((t.token_notify && t.token_notify[0] && t.token_notify[0].last_real_ton) || 0) }))
      .sort((a, b) => b._собрано - a._собрано)
      .slice(0, limit);
  }
  return ряд;
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

function fmtPrice(ton) {
  const v = Number(ton) || 0;
  if (v <= 0) return "—";
  if (v >= 0.001) return `${v.toFixed(5)} TON`;
  // Экспонента вида 8.96e−7 в чате читается как ошибка, а не как цена.
  // Показываем десятичной дробью, сколько бы нулей ни было.
  return `${v.toFixed(11).replace(/0+$/, "")} TON`;
}

/* Количество токенов: их миллионы и миллиарды, и мерка от TON тут не
   годится — «400000.0K» не число, а шум. */
function fmtCount(n) {
  const v = Number(n) || 0;
  // Хвостовые нули срезаем только после точки: иначе «400» превращалось
  // в «4», и проданное падало в сто раз.
  const без = (s) => s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (v >= 1e9) return `${без((v / 1e9).toFixed(v >= 1e10 ? 0 : 2))}B`;
  if (v >= 1e6) return `${без((v / 1e6).toFixed(v >= 1e8 ? 0 : 1))}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
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

/* Полная сводка по одному токену: и текст сообщения, и короткая строка
   для списка в inline-подсказке. */
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

/* Ниже этого капитализацию не показываем: минимальная стартовая покупка
   как раз столько и даёт, а «$0» у токена, который только что запустили,
   читается как поломка. То же число стоит в приложении. */
const МИН_КАПА_USD = 5;

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
    feeBps: BigInt(Number(data.fee_bps) || 100),
    graduated: !!data.graduated,
    // Цена уже посчитана обходом — брать её оттуда точнее, чем считать
    // по резервам без виртуальных: их в кеше нет.
    ценаГотовая: Number(data.price_ton) || 0,
  };
}

/* Карточка своего токена в Solana.
 *
 * Отдельно от TON не по прихоти: там другая цепочка, своя программа
 * кривой и своя монета. Раньше такой токен шёл общим путём, состояние
 * искалось у TON и не находилось — в чате он выглядел мёртвым, хотя
 * кривая живёт и торгуется.
 *
 * Капитализация, как и везде, в долларах и по обороту: цена за то, что
 * кривая уже продала. За весь выпуск считать нельзя — виртуальный резерв
 * задаёт цену ещё до первой сделки, и у пустого токена выходила
 * капитализация в тысячи долларов, одна и та же у всех.
 */
async function карточкаSolana(token) {
  const { состояние } = await import("./solana-launch.js");
  const [s, курс] = await Promise.all([
    состояние(token.address).catch(() => null),
    курсSol().catch(() => 0),
  ]);

  const имя = escape(token.name || token.ticker || "?");
  const тикер = escape(String(token.ticker || "").toUpperCase());
  const капа = s && курс > 0 ? Math.max(s.ценаSol * s.продано * курс, МИН_КАПА_USD) : 0;
  const доля = s && s.solЦель > 0 ? Math.max(0, Math.min(1, s.solСобрано / s.solЦель)) : 0;

  const строки = [
    `${token.logo_url ? "🪙" : "🚀"} <b>${имя}</b> · $${тикер}`,
    "",
    `💰 Цена: ${s ? `${s.ценаSol.toFixed(9).replace(/0+$/, "")} SOL` : "—"}`,
    `📊 Капа: ${капа > 0 ? fmtUsd(капа) : "—"}`,
  ];
  if (s) {
    строки.push("");
    строки.push(s.закрыта
      ? `🎉 Кривая закрыта, собрано ${s.solСобрано.toFixed(2)} SOL`
      : `🚀 Собрано для выхода на биржу: ${(доля * 100).toFixed(0)}%\n${s.solСобрано.toFixed(2)} / ${s.solЦель.toFixed(0)} SOL`);
  }
  // Пробная сеть — первым делом после названия: в чате карточка живёт
  // сама по себе, и без этой строки монету из devnet покупают всерьёз.
  if (token.network && token.network !== "mainnet") {
    строки.splice(2, 0, `⚠️ Пробная сеть (${escape(token.network)}) — монеты здесь ничего не стоят`);
  }
  строки.push(`\n⛓ Solana · <code>${escape(token.address || "")}</code>`);

  return {
    text: строки.join("\n"),
    title: `$${тикер} — ${имя}`,
    description: s
      ? `${капа > 0 ? fmtUsd(капа) : "—"} · ${s.solСобрано.toFixed(2)}/${s.solЦель.toFixed(0)} SOL`
      : "Кривая ещё не отвечает — открой в приложении",
    link: `${APP_URL}?token=${token.id}`,
    chart: `${APP_URL}/api/chart?token=${token.id}&t=${свежесть()}`,
    ref: `t:${token.id}`,
    // Признак цепочки для бота: сделка по такому токену идёт внутренним
    // кошельком площадки, а не TonConnect'ом, и суммы в ней — в SOL.
    sol: true,
    mint: token.address || null,
    ценаSol: s ? s.ценаSol : 0,
    закрыта: !!(s && s.закрыта),
    curve: null,
    pool: null,
    jetton: token.address || null,
    ticker: тикер,
    botLink: `https://t.me/${(process.env.TG_BOT || "MintlyAppbot").replace(/^@/, "")}?start=tok_${token.id}`,
    thumb: token.logo_url || null,
  };
}

export async function tokenCard(token) {
  if (цепочкаТокена(token) === "solana") return await карточкаSolana(token);

  const [state, история, логотип, курс] = await Promise.all([
    // Сначала кеш, и только если он пуст или протух — цепочка.
    состояниеИзКеша(token.id).then((к) => к || curveState(token.curve_address)),
    tradeHistory(token.id),
    token.logo_url ? Promise.resolve(token.logo_url) : логотипЖетона(token.address),
    курсTon(),
  ]);

  const цена = state && state.ценаГотовая > 0 ? state.ценаГотовая : priceFromState(state);
  const собрано = state ? nano(state.realTon) : 0;
  const цель = state ? nano(state.graduationTon) : 0;
  const выпуск = state ? nano(state.tokensSold) : 0;
  // Капитализация — цена за то, что в обороте (кривая уже продала), и
  // сразу в долларах: в TON её приходилось пересчитывать в уме.
  const капаTon = цена > 0 ? цена * выпуск : 0;
  const капа = курс > 0 ? Math.max(капаTon * курс, МИН_КАПА_USD) : 0;

  // Движение за сутки считаем по своим сделкам: первая за 24 часа против
  // текущей цены кривой. Сделок нет — движения тоже нет, и рисовать
  // «+0.00%» честнее, чем выдумывать.
  const сутки = Date.now() - 24 * 3600 * 1000;
  const заСутки = история.filter((p) => p.at >= сутки);
  const старт = заСутки.length ? заСутки[0].price : (история.length ? история[0].price : 0);
  const движение = старт > 0 && цена > 0 ? ((цена - старт) / старт) * 100 : 0;
  const оборот = заСутки.reduce((s, p) => s + p.ton, 0);

  const доля = цель > 0 ? Math.max(0, Math.min(1, собрано / цель)) : 0;
  const делений = 12;
  const полоса = "█".repeat(Math.round(доля * делений)) + "░".repeat(делений - Math.round(доля * делений));

  const имя = escape(token.name || token.ticker || "?");
  // Своего эмодзи у токенов нет — в приложении им рисуется ракета.
  const значок = логотип ? "🪙" : "🚀";
  const тикер = escape(String(token.ticker || "").toUpperCase());
  const знак = движение >= 0 ? "+" : "";
  const стрелка = движение > 0 ? "▲" : движение < 0 ? "▼" : "•";

  const стрелкаЭмодзи = движение > 0 ? "🔺" : движение < 0 ? "🔻" : "▪️";

  const строки = [
    `${значок} <b>${имя}</b> · $${тикер}`,
    "",
    `💰 Цена: ${fmtPrice(цена)}`,
    // Капитализация всегда в долларах: в TON её приходилось
    // пересчитывать в уме, а рядом в ленте и на бирже она в долларах.
    // Курс не пришёл — честный прочерк, а не другая единица.
    `📊 Капа: ${капа > 0 ? fmtUsd(капа) : "—"} · ${стрелкаЭмодзи} ${знак}${движение.toFixed(2)}% за 24ч`,
  ];
  if (цель > 0) {
    строки.push("");
    // «На бирже» — только когда пара действительно заведена: контракт
    // закрывает кривую сам, а пару из собранной ликвидности заводят
    // отдельным действием, и до неё торговать негде.
    строки.push(state && state.graduated
      ? (token.dex_pool_address
        ? `🎉 Кривая закрыта, собрано ${fmtTon(собрано)} TON — торгуется на бирже`
        : `🎉 Кривая закрыта, собрано ${fmtTon(собрано)} TON — пара на бирже готовится`)
      : `🚀 Собрано для выхода на биржу: ${(доля * 100).toFixed(0)}%\n${fmtTon(собрано)} / ${fmtTon(цель)} TON`);
  }
  строки.push("");
  строки.push(`📈 Оборот 24ч: ${fmtTon(оборот)} TON`);
  строки.push(`🔄 Сделок: ${история.length} · ⏱ С момента листинга: ${fmtAge(token.created_at)}`);
  if (token.address) строки.push(`\n<code>${escape(token.address)}</code>`);

  // В строке подсказки — то же, что и в карточке: капитализация в
  // долларах первой, потом движение и путь до листинга. Раньше здесь
  // стояла цена, по которой мемкоин ни с чем не сравнить: у одного она
  // в миллионных долях, у другого в тысячных, а капа сопоставима.
  const описание = state
    ? `${капа > 0 ? fmtUsd(капа) : fmtPrice(цена)} · ${знак}${движение.toFixed(1)}% · ${fmtTon(собрано)}/${fmtTon(цель)} TON`
    : "Кривая ещё не отвечает — открой в приложении";

  return {
    text: строки.join("\n"),
    title: `$${тикер} — ${имя}`,
    description: описание,
    link: `${APP_URL}?token=${token.id}`,
    chart: `${APP_URL}/api/chart?token=${token.id}&t=${свежесть()}`,
    ref: `t:${token.id}`,
    // Закрытая кривая не принимает ни покупок, ни продаж: показывать
    // кнопку, которую контракт отобьёт, — врать. Такой токен торгуется
    // дальше в приложении, оттуда и идёт сделка.
    curve: state && !state.graduated ? token.curve_address || null : null,
    // После закрытия кривой рынок переезжает в собственный пул токена.
    // Сделка там собирается так же, только другим телом сообщения.
    pool: state && state.graduated ? token.dex_pool_address || null : null,
    jetton: token.address || null,
    ticker: тикер,
    botLink: `https://t.me/${(process.env.TG_BOT || "MintlyAppbot").replace(/^@/, "")}?start=tok_${token.id}`,
    thumb: логотип || null,
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

/* Карточка токена, который в приложении просто показывается: своей
   кривой у него нет, все цифры — с биржи, поэтому и путь до листинга
   тут не при чём, он уже там. */
export async function externalCard(token) {
  const знак = token.change24 >= 0 ? "+" : "";
  const стрелка = token.change24 > 0 ? "▲" : token.change24 < 0 ? "▼" : "•";
  const строки = [
    `${token.emoji || "🪙"} <b>${escape(token.name)}</b>  $${escape(token.ticker)}`,
    "",
    `Цена   <code>${fmtUsd(token.priceUsd)}</code>`,
    `Капа   <code>${fmtUsd(token.mcapUsd)}</code>   ${стрелка} ${знак}${token.change24.toFixed(2)}% за 24ч`,
  ];
  строки.push("");
  строки.push(`Объём 24ч ${fmtUsd(token.volUsd)} · Ликвидность ${fmtUsd(token.liqUsd)}${token.dex ? ` · ${escape(token.dex)}` : ""}`);
  if (token.address) строки.push(`\n<code>${escape(token.address)}</code>`);

  return {
    text: строки.join("\n"),
    title: `$${token.ticker} — ${token.name}`,
    description: `${fmtUsd(token.priceUsd)} · ${знак}${token.change24.toFixed(1)}% · ликвидность ${fmtUsd(token.liqUsd)}`,
    ticker: token.ticker,
    // Адрес самого жетона нужен для покупки: своп собирается по нему.
    // В тестовой сети его не отдаём — покупать нечем, и кнопка торговли
    // просто не появится.
    jetton: TESTNET ? null : token.token_address || null,
    link: `${APP_URL}?pool=${token.pool_address}`,
    chart: `${APP_URL}/api/chart?pool=${token.pool_address}&t=${свежесть()}`,
    ref: `p:${token.pool_address}`,
    botLink: `https://t.me/${(process.env.TG_BOT || "MintlyAppbot").replace(/^@/, "")}?start=pool_${token.pool_address}`,
    thumb: token.logo_url || null,
  };
}

/* Общий вход: сперва своё, потом биржа. Свои токены впереди намеренно —
   бот всё-таки про Mintly, и запущенное здесь должно находиться первым. */
export async function searchAll(query, limit = 8) {
  // Свои токены и биржевые ищем одновременно. По очереди это стоило двух
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
  const { data } = await admin
    .from("tokens")
    .select(`id, name, ticker, logo_url, address, curve_address, created_at, owner_id${await естьКолонкаПула(admin) ? ", dex_pool_address" : ""}`)
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
