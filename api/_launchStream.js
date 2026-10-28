/* Чужие запуски — в ленту сразу, как они появились в сети.
 *
 * Mintly показывает не только свои токены, а все свежие мемкоины с
 * площадок запуска. Обход биржевых лент (api/refresh-feed.js) ходит раз
 * в минуту, а пул на бирже у мемкоина появляется только после выхода с
 * кривой, — для «только что созданных» это поздно. Источников два:
 *
 *   • поток PumpPortal — pump.fun и letsbonk.fun: событие о создании
 *     приходит через доли секунды (сделки по токену — только с ключом,
 *     см. КЛЮЧ_PUMPPORTAL; без него цену ведёт Jupiter);
 *   • список свежих токенов Jupiter — все площадки сразу: Meteora DBC (на
 *     ней Bags, Believe, Jupiter Studio, Moonshot), Raydium LaunchLab,
 *     Boop, Heaven и тот же pump.fun. Токен там появляется через 5–20
 *     секунд после создания, сразу с картинкой и капитализацией; цену
 *     таких токенов дальше берём у Jupiter же. Он же — запасной путь,
 *     если поток PumpPortal оборвался: лента не застывает.
 *
 * Всё держит один процесс сервера (server/index.mjs), приложение
 * спрашивает готовое у api/new-launches.js. */

/* Сделки по токенам PumpPortal теперь отдаёт только с ключом, на котором
   лежит не меньше 0,02 SOL: без ключа каждая подписка возвращается
   отказом. Слать их впустую — сотни отказов в час в том же сокете, по
   которому идут новые токены, и повод площадке нас отключить. Свечи
   страницы токена берутся у Jupiter, поэтому без ключа сделки не просим
   вовсе; с ключом (PUMPPORTAL_API_KEY) всё работает как раньше. */
const КЛЮЧ_PUMPPORTAL = process.env.PUMPPORTAL_API_KEY || "";
const АДРЕС = КЛЮЧ_PUMPPORTAL
  ? `wss://pumpportal.fun/api/data?api-key=${encodeURIComponent(КЛЮЧ_PUMPPORTAL)}`
  : "wss://pumpportal.fun/api/data";
const JUP_НОВЫЕ = "https://lite-api.jup.ag/tokens/v2/recent";
const JUP_ЦЕНЫ = "https://lite-api.jup.ag/price/v3?ids=";
const ДЕРЖИМ = 300;               // столько последних запусков помним
const СЛЕДИМ_МС = 10 * 60 * 1000; // столько ведём сделки нового токена
const МЕТАДАННЫЕ_МС = 4000;
// Повторы чтения метаданных: IPFS в первые секунды часто ещё не раздаёт файл.
const ПОВТОРЫ_МС = [2000, 5000, 10000, 20000];
/* Шлюз IPFS. Общий ipfs.io (и dweb.link) теперь отвечают 429 «только
   через service worker» — картинки в ленте не грузились вовсе. Шлюз
   pump.fun на Pinata отдаёт те же файлы за доли секунды и умеет сразу
   уменьшить картинку. */
const ШЛЮЗ = "https://pump.mypinata.cloud/ipfs/";
const КАРТИНКА_БАЙТ = 600_000;
// Все картинки вместе — не больше 40 МБ: оригинал не с IPFS шлюз не
// уменьшает, и двести таких держали бы в памяти сервера сотни мегабайт.
const КАРТИНКИ_ВСЕГО = 40_000_000;
let картинокБайт = 0;
const картинки = new Map();       // mint -> { байты, тип } | Promise
function положитьКартинку(mint, готово) {
  картинки.set(mint, готово);
  картинокБайт += готово.байты.length;
  // Старые — вон, пока не уложимся (Map помнит порядок добавления).
  for (const [к, в] of картинки) {
    if (картинокБайт <= КАРТИНКИ_ВСЕГО) break;
    if (к === mint || !в || !в.байты) continue;
    картинокБайт -= в.байты.length;
    картинки.delete(к);
  }
}
function убратьКартинку(mint) {
  const в = картинки.get(mint);
  if (в && в.байты) картинокБайт -= в.байты.length;
  картинки.delete(mint);
}
const СДЕЛОК_НА_ТОКЕН = 600;

/* Сделка из потока — точка графика: цена в SOL за токен по виртуальным
   резервам кривой (так её считает сама площадка) и капитализация. */
function записатьСделку(з, j, создание = false) {
  const vSol = Number(j.vSolInBondingCurve), vTok = Number(j.vTokensInBondingCurve);
  const цена = vSol > 0 && vTok > 0 ? vSol / vTok : 0;
  if (!(цена > 0)) return;
  if (!з.сделки) з.сделки = [];
  з.сделки.push([Date.now(), цена, Number(j.solAmount) || 0, создание ? 2 : j.txType === "sell" ? 0 : 1]);
  if (з.сделки.length > СДЕЛОК_НА_ТОКЕН) з.сделки.splice(0, з.сделки.length - СДЕЛОК_НА_ТОКЕН);
}

const лента = [];                 // свежие сверху
const поАдресу = new Map();
let сокет = null;
let пауза = 1000;
let запущен = false;
let таймерПодключения = null;
let последнееСообщение = 0;       // поток PumpPortal: когда было последнее событие
let попыткаПри = 0;               // когда открывали сокет
let jupiterПри = 0;               // когда список Jupiter последний раз ответил

/* Площадка по токену из списка Jupiter. У площадок свои «красивые»
   окончания адреса (…pump, …bonk, …BAGS, …moon), по ним понятнее всего;
   дальше — сайт площадки в ссылке токена (uselaunch.fun/c/<адрес>), и в
   конце — программа, на которой стоит кривая. */
const ПРОГРАММЫ_JUPITER = {
  "pump.fun": "pump.fun", "raydium-launchlab": "LaunchLab", "met-dbc": "Meteora",
  moonshot: "Moonshot", boop: "Boop", heaven: "Heaven", "bags.fm": "Bags", bags: "Bags",
  believe: "Believe", "jup-studio": "Jupiter", "letsbonk.fun": "letsbonk",
};
function площадкаJupiter(т) {
  const mint = String(т.id || "");
  if (/pump$/.test(mint)) return "pump.fun";
  if (/bonk$/.test(mint)) return "letsbonk";
  if (/BAGS$/.test(mint)) return "Bags";
  if (/moon$/.test(mint)) return "Moonshot";
  if (/jups?$/.test(mint)) return "Jupiter";
  if (/boop$/.test(mint)) return "Boop";
  const сайт = String(т.website || "");
  const м = сайт.match(/^https?:\/\/(?:www\.)?([a-z0-9-]{3,24})\.[a-z]{2,5}\//i);
  if (м && сайт.includes(mint)) return м[1].toLowerCase();
  // Без площадки — пул заведён сразу на бирже (PumpSwap, Raydium, Meteora).
  return ПРОГРАММЫ_JUPITER[т.launchpad] || (т.launchpad ? String(т.launchpad).slice(0, 20) : "DEX");
}

/* Клоны: один и тот же токен (имя и тикер) запускают пачками — по
   десятку копий за минуту, и лента целиком забивалась одинаковыми
   строками. Повтор в пределах десяти минут не показываем: остаётся
   первый запуск. */
const ключКлона = (з) => `${String(з.symbol || "").trim()}|${String(з.name || "").trim()}`.toLowerCase();
function клон(з) {
  const к = ключКлона(з);
  const граница = Date.now() - СЛЕДИМ_МС;
  return лента.some((x) => x.at > граница && x.mint !== з.mint && ключКлона(x) === к);
}

/* Свежий токен — на своё место по времени создания: из Jupiter он
   приходит на секунды позже, чем из потока, и не должен встать выше
   тех, что созданы после него. */
function вставить(з) {
  let i = 0;
  while (i < лента.length && лента[i].at > з.at) i += 1;
  лента.splice(i, 0, з);
  поАдресу.set(з.mint, з);
  // Старые уходят — и их сделки и картинки больше не нужны.
  while (лента.length > ДЕРЖИМ) {
    const старый = лента.pop();
    поАдресу.delete(старый.mint);
    убратьКартинку(старый.mint);
  }
}

/* Цена от Jupiter — точка графика и капитализация. Одинаковую цену
   подряд не пишем: опрос раз в несколько секунд, а сделок может и не
   быть — график не должен набиваться одинаковыми точками. */
function ценаJupiter(з, usd, сол, mcapUsd = 0) {
  if (!(usd > 0) || !(сол > 0)) return;
  const ценаSol = usd / сол;
  if (!з.сделки) з.сделки = [];
  const посл = з.сделки[з.сделки.length - 1];
  if (!посл || Math.abs(посл[1] - ценаSol) / посл[1] > 1e-7) {
    з.сделки.push([Date.now(), ценаSol, 0, з.сделки.length ? 1 : 2]);
    if (з.сделки.length > СДЕЛОК_НА_ТОКЕН) з.сделки.splice(0, з.сделки.length - СДЕЛОК_НА_ТОКЕН);
  }
  з.mcapSol = mcapUsd > 0 ? mcapUsd / сол : ценаSol * (з.выпуск || 1e9);
  з.изменён = Date.now();
}

async function опросJupiter() {
  let список;
  try {
    const r = await fetch(JUP_НОВЫЕ, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return;
    список = await r.json();
  } catch { return; }
  if (!Array.isArray(список)) return;
  jupiterПри = Date.now();
  const сол = await курсSOL();
  const граница = Date.now() - СЛЕДИМ_МС;
  for (const т of список) {
    const mint = т && typeof т.id === "string" ? т.id : "";
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) continue;
    const при = Date.parse((т.firstPool && т.firstPool.createdAt) || т.createdAt) || Date.now();
    if (при < граница) continue;
    const значок = typeof т.icon === "string" && /^(https?|ipfs):\/\//.test(т.icon) ? черезШлюз(т.icon) : null;
    const было = поАдресу.get(mint);
    if (было) {
      // Уже знаем из потока pump.fun — добираем то, чего там не нашлось.
      if (!было.картинка && значок) { было.картинка = значок; было.logo = true; было.изменён = Date.now(); забратьКартинку(было).catch(() => {}); }
      if (было.источник === "jupiter") ценаJupiter(было, Number(т.usdPrice), сол, Number(т.mcap));
      continue;
    }
    const з = {
      mint,
      name: String(т.name || т.symbol || "").slice(0, 64),
      symbol: String(т.symbol || "").slice(0, 16),
      uri: null,
      площадка: площадкаJupiter(т),
      curve: (т.firstPool && т.firstPool.id) || null,
      creator: typeof т.dev === "string" ? т.dev : null,
      mcapSol: 0,
      выпуск: Number(т.totalSupply) || 1e9,
      at: при,
      изменён: Date.now(),
      logo: !!значок,
      картинка: значок,
      источник: "jupiter",
      twitter: typeof т.twitter === "string" ? т.twitter : undefined,
      website: typeof т.website === "string" ? т.website : undefined,
    };
    if (!з.symbol || клон(з)) continue;
    ценаJupiter(з, Number(т.usdPrice), сол, Number(т.mcap));
    вставить(з);
    if (значок) забратьКартинку(з).catch(() => {});
  }
}

// Цены токенов из Jupiter — пачкой, пока токен свежий.
async function опросЦенJupiter() {
  const граница = Date.now() - СЛЕДИМ_МС;
  const свои = лента.filter((з) => з.источник === "jupiter" && з.at > граница).slice(0, 50);
  if (!свои.length) return;
  const сол = await курсSOL();
  if (!(сол > 0)) return;
  try {
    const r = await fetch(JUP_ЦЕНЫ + свои.map((з) => з.mint).join(","), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return;
    const j = await r.json();
    for (const з of свои) {
      const ц = j && j[з.mint];
      if (ц && Number(ц.usdPrice) > 0) ценаJupiter(з, Number(ц.usdPrice), сол);
    }
  } catch { /* спросим в следующий раз */ }
}

// Любая ссылка на IPFS (ipfs://…, …/ipfs/<cid>…) — через быстрый шлюз.
function черезШлюз(адрес) {
  const с = String(адрес || "");
  const м = с.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/) || с.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/);
  return м ? ШЛЮЗ + м[1] : с;
}

/* Картинка и описание лежат в метаданных по ссылке из события (IPFS).
   Без картинки токен показываем сразу, она подъедет со следующим
   опросом; сервер тут же забирает и саму картинку — к телефону она
   приходит уже из памяти сервера. */
async function дочитатьМетаданные(з, попытка = 0) {
  if (!з.uri) return;
  try {
    const ответ = await fetch(черезШлюз(з.uri), { signal: AbortSignal.timeout(МЕТАДАННЫЕ_МС) });
    if (!ответ.ok) throw new Error(String(ответ.status));
    const j = await ответ.json();
    if (j && typeof j.image === "string" && /^(https?|ipfs):\/\//.test(j.image)) {
      з.картинка = черезШлюз(j.image);
      з.logo = true;
      забратьКартинку(з).catch(() => {});
    }
    if (j && typeof j.twitter === "string") з.twitter = j.twitter;
    if (j && typeof j.telegram === "string") з.telegram = j.telegram;
    if (j && typeof j.website === "string") з.website = j.website;
    з.изменён = Date.now();
  } catch {
    if (попытка < ПОВТОРЫ_МС.length) setTimeout(() => дочитатьМетаданные(з, попытка + 1), ПОВТОРЫ_МС[попытка]);
  }
}

/* Картинка в памяти сервера: уменьшенная шлюзом до 128 точек — это
   килобайты, а не мегабайты оригинала. Держим не больше, чем запусков. */
async function забратьКартинку(з) {
  const было = картинки.get(з.mint);
  if (было) return было;
  const ждём = (async () => {
    const адрес = з.картинка.startsWith(ШЛЮЗ) ? `${з.картинка}${з.картинка.includes("?") ? "&" : "?"}img-width=128&img-height=128&img-fit=cover` : з.картинка;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(адрес, { signal: AbortSignal.timeout(6000) });
        const тип = String(r.headers.get("content-type") || "");
        if (r.ok && /^image\//.test(тип)) {
          const байты = Buffer.from(await r.arrayBuffer());
          if (байты.length && байты.length <= КАРТИНКА_БАЙТ) {
            const готово = { байты, тип };
            картинки.delete(з.mint); // убираем ожидание, чтобы счёт байтов был верным
            положитьКартинку(з.mint, готово);
            return готово;
          }
        }
      } catch { /* следующая попытка */ }
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
    убратьКартинку(з.mint);
    return null;
  })();
  картинки.set(з.mint, ждём);
  return ждём;
}

export async function картинкаЗапуска(mint) {
  const з = поАдресу.get(mint);
  const было = картинки.get(mint);
  if (было) return было;
  if (!з || !з.картинка) return null;
  return забратьКартинку(з);
}

function послать(тело) {
  try { if (сокет && сокет.readyState === 1) сокет.send(JSON.stringify(тело)); } catch { /* сокет закрывается */ }
}

function принять(событие) {
  let j;
  try { j = JSON.parse(String(событие.data)); } catch { return; }
  if (!j || !j.mint) return;
  if (j.txType === "create") {
    if (поАдресу.has(j.mint)) return;
    const з = {
      mint: j.mint,
      name: String(j.name || "").slice(0, 64),
      symbol: String(j.symbol || "").slice(0, 16),
      uri: typeof j.uri === "string" ? j.uri : null,
      площадка: j.pool === "bonk" ? "letsbonk" : "pump.fun",
      curve: j.bondingCurveKey || null,
      creator: j.traderPublicKey || null,
      mcapSol: Number(j.marketCapSol) || 0,
      at: Date.now(),
      изменён: Date.now(),
      logo: null,
      источник: "pumpportal",
    };
    if (клон(з)) return;
    // Первая покупка автора идёт в том же событии — это первая точка графика.
    записатьСделку(з, j, true);
    вставить(з);
    if (КЛЮЧ_PUMPPORTAL) послать({ method: "subscribeTokenTrade", keys: [з.mint] });
    дочитатьМетаданные(з);
    return;
  }
  // Сделка по токену, за которым следим: капитализация после неё.
  const з = поАдресу.get(j.mint);
  if (з && Number(j.marketCapSol) > 0) {
    з.mcapSol = Number(j.marketCapSol);
    з.изменён = Date.now();
    записатьСделку(з, j);
  }
}

// Раз в минуту отпускаем сделки токенов старше десяти минут.
function отпуститьСтарые() {
  if (!КЛЮЧ_PUMPPORTAL) return;
  const граница = Date.now() - СЛЕДИМ_МС;
  const ключи = лента.filter((з) => з.источник === "pumpportal" && з.at < граница && !з.отпущен).map((з) => { з.отпущен = true; return з.mint; });
  if (ключи.length) послать({ method: "unsubscribeTokenTrade", keys: ключи });
}

/* Переподключение. Раньше сокет пересоздавался только по событию
   «закрыт»: повисшее подключение (вечное «соединяюсь» или открытый, но
   замолчавший поток) его не присылало, и лента на сервере застывала на
   часы — в приложении стояли токены четырёхчасовой давности. */
function переподключить(причина) {
  const с = сокет;
  сокет = null;
  if (с) {
    с.onopen = с.onmessage = с.onclose = с.onerror = null;
    try { с.close(); } catch { /* уже закрыт */ }
  }
  if (причина) console.warn(`[запуски] PumpPortal: ${причина} — заново через ${Math.round(пауза / 1000)} с`);
  clearTimeout(таймерПодключения);
  таймерПодключения = setTimeout(подключить, пауза);
  пауза = Math.min(30_000, пауза * 2);
}

function подключить() {
  if (typeof WebSocket === "undefined") { console.warn("[запуски] в этом Node нет WebSocket"); return; }
  let с;
  try { с = new WebSocket(АДРЕС); } catch (e) { return переподключить(`сокет не создан (${e && e.message})`); }
  сокет = с;
  попыткаПри = Date.now();
  с.onopen = () => {
    if (сокет !== с) return;
    пауза = 1000;
    последнееСообщение = Date.now();
    послать({ method: "subscribeNewToken" });
    // После переподключения — снова сделки тех, кого ещё сопровождаем.
    const свежие = КЛЮЧ_PUMPPORTAL ? лента.filter((з) => з.источник === "pumpportal" && !з.отпущен).map((з) => з.mint) : [];
    if (свежие.length) послать({ method: "subscribeTokenTrade", keys: свежие });
  };
  с.onmessage = (e) => { if (сокет !== с) return; последнееСообщение = Date.now(); принять(e); };
  с.onclose = (e) => { if (сокет === с) переподключить(`закрыт (${e && e.code})`); };
  с.onerror = () => { if (сокет === с) переподключить("ошибка сокета"); };
}

// Сторож потока: не открылся за 20 секунд или молчит полторы минуты —
// пересоздаём (новый токен на pump.fun появляется каждые несколько секунд).
function сторож() {
  const с = сокет;
  if (!с) return;
  if (с.readyState === 0 && Date.now() - попыткаПри > 20_000) return переподключить("не открылся за 20 с");
  if (с.readyState === 1 && Date.now() - последнееСообщение > 90_000) return переподключить("молчит 90 с");
  if (с.readyState > 1) return переподключить("закрыт без события");
}

export function запуститьЛентуЗапусков() {
  if (запущен) return false;
  запущен = true;
  подключить();
  setInterval(отпуститьСтарые, 60_000).unref?.();
  setInterval(сторож, 15_000).unref?.();
  // Jupiter: свежие токены всех площадок раз в 5 секунд, их цены — раз в 6.
  опросJupiter();
  setInterval(опросJupiter, 5_000).unref?.();
  setInterval(опросЦенJupiter, 6_000).unref?.();
  return true;
}

/* Запуски новее отметки — в виде строк ленты приложения. Отметка — время
   прошлого ответа: телефон спрашивает раз в секунду и получает только
   новое и изменившееся. */
export function свежиеЗапуски(после = 0) {
  return лента
    .filter((з) => з.изменён > после)
    .slice(0, 80)
    .map((з) => {
      // Изменение с момента создания: первая точка графика против последней.
      const первая = з.сделки && з.сделки[0];
      const последняя = з.сделки && з.сделки[з.сделки.length - 1];
      const change = первая && последняя && первая[1] > 0 && последняя !== первая ? (последняя[1] / первая[1] - 1) * 100 : 0;
      return {
        mint: з.mint, name: з.name, symbol: з.symbol, platform: з.площадка,
        // Картинка — со своего сервера (см. забратьКартинку).
        logo: з.logo ? `/api/new-launches?logo=${з.mint}` : null,
        curve: з.curve, creator: з.creator, mcapSol: з.mcapSol, createdAt: new Date(з.at).toISOString(),
        change: Number.isFinite(change) ? Math.round(change * 10) / 10 : 0,
        twitter: з.twitter || null, telegram: з.telegram || null, website: з.website || null,
      };
    });
}

/* Сделки токена с момента создания — для графика на его странице.
   [время мс, цена в SOL, сумма в SOL, 1 покупка / 0 продажа / 2 создание]. */
export function сделкиЗапуска(mint) {
  const з = поАдресу.get(mint);
  return з ? { createdAt: з.at, mcapSol: з.mcapSol, trades: з.сделки || [] } : null;
}

/* Курс SOL в долларах — отдаём вместе с лентой: у телефона свой курс
   приезжает не сразу, и пока его нет, капитализация в ленте была $0.
   Берём середину рынка SOL на Hyperliquid, раз в полминуты. */
let курс = { at: 0, usd: 0 };
export async function курсSOL() {
  if (Date.now() - курс.at > 30_000) {
    курс.at = Date.now();
    try {
      const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "allMids" }), signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      const usd = Number(j && j.SOL);
      if (usd > 0) курс.usd = usd;
    } catch { /* остаётся прошлый */ }
  }
  return курс.usd;
}

// Жива, если идёт хотя бы один источник: поток pump.fun или список Jupiter.
export function лентаЖива() { return !!(сокет && сокет.readyState === 1) || Date.now() - jupiterПри < 30_000; }
