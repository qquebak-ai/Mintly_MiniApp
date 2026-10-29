/* Биржа в приложении: фьючерсы на крипту, золото, серебро и индексы на
 * Hyperliquid (план — в документе «Mintly: торговля фьючерсами, золотом и
 * индексами»). Своей биржи нет: заявки уходят на Hyperliquid, а счёт там —
 * тот же EVM-кошелёк человека, что и в приложении. Новых ключей и адресов
 * не появляется, старые кошельки не трогаются.
 *
 *   GET  ?action=markets              — рынки: крипта, металлы, индексы, акции
 *   GET  ?action=candles&coin&interval — свечи для графика
 *   GET  ?action=account              — счёт: деньги на бирже, позиции, карта
 *   POST ?action=order   {asset, isBuy, usd, leverage} — сделка по рынку
 *   POST ?action=close   {asset}       — закрыть позицию целиком
 *   POST ?action=deposit-sol {amount}  — SOL из кошелька приложения на биржу (мост Unit)
 *   POST ?action=settle                — пришедший SOL продать в USDC и положить на счёт фьючерсов
 *   POST ?action=withdraw-sol {usd}    — с биржи обратно SOL в кошелёк приложения
 *   POST ?action=deposit {amount}      — USDC из Arbitrum на биржу (старый путь)
 *   POST ?action=withdraw {amount}     — с биржи обратно на свой адрес в Arbitrum
 *
 * Сеть — как у EVM-кошелька приложения: тестовая, пока EVM_MAINNET не 1
 * (или HYPERLIQUID_MAINNET=1 отдельно).
 *
 * Предел запросов. У Hyperliquid REST-запросы с одного адреса сервера
 * ограничены 1200 «весами» в минуту на всех людей сразу (обзор рынков —
 * 20, состояние счёта — 2). Раньше рынки всех площадок перечитывались раз
 * в три секунды, и одна открытая вкладка съедала предел втрое: биржа
 * отвечала 429, и раздел переставал работать у всех. Теперь живые цены
 * идут по сокету (подписка allMids весов не тратит), а тяжёлые запросы —
 * редко и из общего кеша. */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { encode } from "@msgpack/msgpack";
import { ТЕСТОВЫЕ, подписьEVMЧеловека } from "./wallet-evm.js";
import { отправитьНаБиржу, кошелёкДляБота, SOLANA_ТЕСТОВАЯ } from "./wallet-solana.js";
import { занять } from "./_walletLock.js";
import * as торговый from "./_tradingAccount.js";
import { наТорговый, сТоргового, довестиПереводы, МИН_ПЕРЕВОДА_USD } from "./_tradingTransfer.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const БОЕВАЯ = process.env.HYPERLIQUID_MAINNET === "1" || (!ТЕСТОВЫЕ && process.env.HYPERLIQUID_MAINNET !== "0");
/* Учебный счёт (api/_tradingAccount.js): в тестовых сетях позиции ведёт
   сам сервер, а цены, рынки и свечи берёт с основной биржи. Тестовая
   Hyperliquid для этого не годится: её цены и рынки — пробные (золото по
   $3, сотни площадок «test»), а пополнить её нечем — девнет-SOL мост Unit
   не принимает, и позиция с ним не открывалась вовсе. HYPERLIQUID_DEMO=0
   возвращает прежний путь через тестовую биржу. */
const ДЕМО = !БОЕВАЯ && process.env.HYPERLIQUID_DEMO !== "0";
const API = БОЕВАЯ ? "https://api.hyperliquid.xyz" : "https://api.hyperliquid-testnet.xyz";
const API_ДАННЫХ = БОЕВАЯ || ДЕМО ? "https://api.hyperliquid.xyz" : API;
const СОКЕТ = БОЕВАЯ || ДЕМО ? "wss://api.hyperliquid.xyz/ws" : "wss://api.hyperliquid-testnet.xyz/ws";
// Мост Hyperliquid и USDC в Arbitrum: депозит — обычный перевод USDC на мост.
const ARB_RPC = process.env.ARBITRUM_RPC || (БОЕВАЯ ? "https://arb1.arbitrum.io/rpc" : "https://sepolia-rollup.arbitrum.io/rpc");
const МОСТ = БОЕВАЯ ? "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" : "0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89";
const USDC = БОЕВАЯ ? "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" : "0x1baAbB04529D43a73232B713C0FE471f7c7334d5";
const НОЛЬ = "0x0000000000000000000000000000000000000000";
const ПРОСКАЛЬЗЫВАНИЕ = 0.05;
// Комиссия «по рынку» с запасом: залог должен покрыть и её, иначе заявка
// на всю сумму при большом плече падает с «недостаточно маржи».
const КОМИССИЯ = 0.0006;

/* Площадки HIP-3 (металлы, индексы, акции) — по списку, а не первые
   попавшиеся: в тестовой сети их сотни, почти все пробные, и раньше в
   раздел попадали «test», «scam» и «angry», а настоящая xyz — нет.
   Берём только площадки с залогом в USDC: деньги на бирже — в USDC, а
   площадку на USDH или USDT0 пополнить нечем, сделка там не прошла бы. */
const ПЛОЩАДКИ = ["xyz", "para", "mkts", "abcd", "km", "cash", "flx", "vntl", "hyna"];

/* Мост Unit: SOL из Solana приходит на биржу токеном USOL и уходит
   обратно так же. Адрес моста выдаёт их API, и подменённый адрес увёл бы
   деньги, поэтому каждый проверяется подписями хранителей Unit — нужно
   две из трёх (ключи — из документации Unit, «Guardian Signatures»). */
const UNIT_API = БОЕВАЯ ? "https://api.hyperunit.xyz" : "https://api.hyperunit-testnet.xyz";
const ХРАНИТЕЛИ = БОЕВАЯ ? {
  "unit-node": "04dc6f89f921dc816aa69b687be1fcc3cc1d48912629abc2c9964e807422e1047e0435cb5ba0fa53cb9a57a9c610b4e872a0a2caedda78c4f85ebafcca93524061",
  "hl-node": "048633ea6ab7e40cdacf37d1340057e84bb9810de0687af78d031e9b07b65ad4ab379180ab55075f5c2ebb96dab30d2c2fab49d5635845327b6a3c27d20ba4755b",
  "field-node": "04ae2ab20787f816ea5d13f36c4c4f7e196e29e867086f3ce818abb73077a237f841b33ada5be71b83f4af29f333dedc5411ca4016bd52ab657db2896ef374ce99",
} : {
  "node-1": "04bab844e8620c4a1ec304df6284cd6fdffcde79b3330a7bffb1e4cecfee72d02a7c1f3a4415b253dc8d6ca2146db170e1617605cc8a4160f539890b8a24712152",
  "hl-node-testnet": "04502d20a0d8d8aaea9395eb46d50ad2d8278c1b3a3bcdc200d531253612be23f5f2e9709bf3a3a50d1447281fa81aca0bf2ac2a6a3cb8a12978381d73c24bb2d9",
  "field-node": "04e674a796ff01d6b74f4ee4079640729797538cdb4926ec333ce1bd18414ef7f22c1a142fd76dca120614045273f30338cd07d79bc99872c76151756aaec0f8e8",
};
// Меньше этого мост не переводит (документация Unit) — деньги застрянут.
const МИН_SOL = 0.12;

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
async function хозяин(req, db) {
  const з = req.headers.authorization || "";
  const токен = з.startsWith("Bearer ") ? з.slice(7).trim() : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  return error || !data ? null : data.user;
}
async function ethersLib() { return import("ethers"); }

async function инфоС(адрес, тело) {
  const r = await fetch(`${адрес}/info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(тело), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`hyperliquid info ${r.status}`);
  return r.json();
}
// Счёт и заявки — у биржи, где лежат деньги; рынки, свечи и цены — у той,
// откуда их берёт экран (в учебном режиме это основная).
const инфо = (тело) => инфоС(API, тело);
const инфоРынка = (тело) => инфоС(API_ДАННЫХ, тело);
const состояние = (адрес, dex) => инфо(dex ? { type: "clearinghouseState", user: адрес, dex } : { type: "clearinghouseState", user: адрес });

/* Живые цены — по сокету биржи: подписка allMids на основную биржу (там
   же цены спота, «@156» — USOL) и на каждую площадку HIP-3. Сокет один на
   весь сервер; оборвался — через три секунды открывается снова. */
const живые = new Map();
let живыеПри = 0;
// Когда последний раз пришли цены каждой площадки ("" — основная биржа):
// сделка учебного счёта берёт цену, только если она свежая.
const живыеПоПлощадке = new Map();
let сокетЦен = null;
let сокетЖдёт = false;
const подписаны = new Set();
function подписатьЦены(dex) {
  try { сокетЦен.send(JSON.stringify({ method: "subscribe", subscription: dex ? { type: "allMids", dex } : { type: "allMids" } })); } catch { /* переподпишемся при открытии */ }
}
function открытьСокетЦен() {
  if (typeof WebSocket === "undefined" || сокетЦен || сокетЖдёт) return;
  const с = new WebSocket(СОКЕТ);
  сокетЦен = с;
  let пинг = null;
  с.onopen = () => {
    for (const dex of подписаны) подписатьЦены(dex);
    // Молчащий сокет биржа закрывает через минуту — пингуем.
    пинг = setInterval(() => { try { с.send('{"method":"ping"}'); } catch { /* закрывается */ } }, 30_000);
  };
  с.onmessage = (e) => {
    let j;
    try { j = JSON.parse(String(e.data)); } catch { return; }
    if (!j || j.channel !== "allMids" || !j.data || !j.data.mids) return;
    for (const [к, v] of Object.entries(j.data.mids)) живые.set(к, Number(v));
    живыеПри = Date.now();
    живыеПоПлощадке.set(j.data.dex || "", живыеПри);
    сторож(j.data.mids);
  };
  с.onclose = () => {
    clearInterval(пинг);
    сокетЦен = null;
    сокетЖдёт = true;
    setTimeout(() => { сокетЖдёт = false; открытьСокетЦен(); }, 3000);
  };
  с.onerror = () => { try { с.close(); } catch { /* уже закрыт */ } };
}
function следитьЗаЦенами(площадки) {
  for (const dex of площадки) {
    if (подписаны.has(dex)) continue;
    подписаны.add(dex);
    if (сокетЦен && сокетЦен.readyState === 1) подписатьЦены(dex);
  }
  открытьСокетЦен();
}
const ценыЖивы = () => Date.now() - живыеПри < 20_000;

/* Раздел рынка по имени: у HIP-3 рынков имя с приставкой площадки
   («xyz:GOLD»), у основной биржи — просто тикер. */
function раздел(имя, свой) {
  const и = String(имя).toUpperCase().replace(/^[A-Z0-9]+:/, "");
  /* На основной бирже всё — крипта, кроме токенов золота: «SPX» там —
     мемкоин SPX6900, а не индекс. Металлы, индексы и акции — только у
     площадок HIP-3. */
  if (свой) return /^(PAXG|XAUT)$/.test(и) ? "metals" : "crypto";
  if (/^(GOLD|XAU|SILVER|XAG|PLATINUM|XPT|PALLADIUM|COPPER|ALUMINIUM|ALUMINUM|OIL|WTI|BRENT|NATGAS|CL)/.test(и)) return "metals";
  if (/^(SPX|SP500|US500|NDX|NAS100|NASDAQ|XYZ100|DOW|DJI|US30|DAX|NIKKEI|RUSSELL|VIX|ES|NQ|USA500)$/.test(и) || /^(US500|XYZ100)/.test(и)) return "indices";
  // Валюты и облигации — тоже не акции: кладём к индексам.
  if (/^(EUR|JPY|GBP|CHF|CNH|AUD|CAD|DXY|USBOND|US10Y|US2Y)$/.test(и)) return "indices";
  return "stocks";
}
// Пробные и мусорные рынки HIP-3 (их полно в тестовой сети) — не показываем.
const МУСОР = /(^|:)(TEST\d*|ABC|TOKEN\w*)$|^(test|scam|angry):/i;

/* Список рынков. Названия, плечи, объёмы и вчерашние цены меняются
   медленно — их перечитываем раз в две минуты (пока сокет цен жив; без
   него — раз в 10 секунд, чтобы цены не стояли). Цена на каждый запрос —
   живая из сокета. Номер актива для заявки у HIP-3 — 100000 + 10000 ×
   номер площадки в общем списке + номер рынка в её списке. */
let основа = { at: 0, рынки: [], площадки: [""] };
let идёт = null;
async function обновитьОснову() {
  const площадки = await инфоРынка({ type: "perpDexs" }).catch(() => [null]);
  const индексы = ПЛОЩАДКИ.map((имя) => (Array.isArray(площадки) ? площадки.findIndex((п) => п && п.name === имя) : -1)).filter((i) => i > 0);
  const ответы = await Promise.all([
    инфоРынка({ type: "metaAndAssetCtxs" }).catch(() => null),
    ...индексы.map((i) => инфоРынка({ type: "metaAndAssetCtxs", dex: площадки[i].name }).catch(() => null)),
  ]);
  const рынкиСписок = [];
  const взятые = [""];
  ответы.forEach((о, к) => {
    if (!Array.isArray(о) || !о[0] || !Array.isArray(о[0].universe)) return;
    const i = к === 0 ? 0 : индексы[к - 1];
    // Залог площадки — не USDC (номер токена 0): пополнить её нечем. На
    // учебном счёте залог свой, в долларах, — там годится любая площадка.
    if (i && !ДЕМО && Number(о[0].collateralToken || 0) !== 0) return;
    if (i) взятые.push(площадки[i].name);
    о[0].universe.forEach((р, n) => {
      const ц = (о[1] || [])[n] || {};
      if (р.isDelisted || (i && МУСОР.test(р.name))) return;
      const цена = Number(ц.markPx || ц.midPx) || 0;
      if (!(цена > 0)) return;
      рынкиСписок.push({
        asset: i ? 100000 + i * 10000 + n : n,
        coin: р.name,
        name: String(р.name).replace(/^[a-z0-9]+:/i, ""),
        dex: i ? площадки[i].name : "",
        section: раздел(р.name, !i),
        цена,
        вчера: Number(ц.prevDayPx) || 0,
        volume: Number(ц.dayNtlVlm) || 0,
        maxLeverage: Number(р.maxLeverage) || 1,
        szDecimals: Number(р.szDecimals) || 0,
        /* Только изолированная маржа (у многих HIP-3 и у части старых
           рынков). Плечо там ставится как изолированное: «перекрёстное»
           биржа отвергала, и заявка не проходила вовсе. */
        isolated: !!(р.onlyIsolated || р.marginMode === "strictIsolated" || р.marginMode === "noCross"),
      });
    });
  });
  if (!рынкиСписок.length) throw new Error("биржа не отдала рынки");
  рынкиСписок.sort((a, b) => b.volume - a.volume);
  основа = { at: Date.now(), рынки: рынкиСписок, площадки: взятые };
  следитьЗаЦенами(взятые);
  return основа;
}
async function собратьРынки() {
  const срок = ценыЖивы() ? 120_000 : 10_000;
  if (Date.now() - основа.at > срок || !основа.рынки.length) {
    if (!идёт) идёт = обновитьОснову().finally(() => { идёт = null; });
    // Первый раз ждём; дальше отдаём прежнее, пока свежее собирается.
    if (!основа.рынки.length) await идёт; else идёт.catch(() => {});
  }
  const список = [];
  const поНомеру = new Map();
  for (const р of основа.рынки) {
    const живая = ценыЖивы() ? живые.get(р.coin) : 0;
    const цена = живая > 0 ? живая : р.цена;
    const рынок = {
      asset: р.asset, coin: р.coin, name: р.name, dex: р.dex, section: р.section,
      price: цена, change: р.вчера > 0 ? ((цена - р.вчера) / р.вчера) * 100 : 0,
      volume: р.volume, maxLeverage: р.maxLeverage, szDecimals: р.szDecimals, isolated: р.isolated,
    };
    список.push(рынок);
    поНомеру.set(рынок.asset, рынок);
  }
  return { список, поНомеру, площадки: основа.площадки };
}

/* Значки рынков — те же, что у самой Hyperliquid (app.hyperliquid.xyz/
   coins/<монета>.svg). Отдаём их через свой сервер: из Telegram сайт
   биржи открывается не у всех, а свой адрес грузится всегда. Для монет
   без своего значка пробуем родственное имя: «kPEPE» (тысяча PEPE) —
   значок PEPE, акция с одной площадки — та же акция с другой. Нет
   значка — сайт биржи отвечает HTML-страницей, это не картинка. */
const значки = new Map();
async function значокМонеты(coin) {
  const было = значки.get(coin);
  if (было && Date.now() - было.at < (было.svg ? 7 * 86400e3 : 3600e3)) return было.svg;
  const имя = coin.replace(/^[a-z0-9]+:/i, "");
  const голое = /^k[A-Z]/.test(имя) ? имя.slice(1) : имя;
  const кандидаты = [...new Set([coin, имя, голое, `xyz:${голое}`, `flx:${голое}`, `felix:${голое}`])];
  let svg = null;
  for (const к of кандидаты) {
    try {
      const r = await fetch(`https://app.hyperliquid.xyz/coins/${к}.svg`, { signal: AbortSignal.timeout(5000) });
      const т = r.ok ? await r.text() : "";
      if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(т) && т.length < 200_000) { svg = т; break; }
    } catch { /* следующий кандидат */ }
  }
  if (значки.size > 3000) значки.clear();
  значки.set(coin, { svg, at: Date.now() });
  return svg;
}

/* Свечи — общим кешем на всех: один и тот же график у десяти человек —
   один запрос к бирже, а не десять (свечи весят 20+ из 1200 в минуту).
   Последнюю свечу телефон и так двигает живой ценой из списка рынков.
   Свечей — 300: график теперь листается пальцем назад, и сотни хватало
   на пару движений. До — конец окна для подгрузки истории левее; такие
   окна прошлого не меняются, их кеш живёт дольше. */
const СВЕЧЕЙ = 300;
const свечиКеш = new Map();
async function свечиРынка(coin, interval, до = null) {
  const шаг = { "1m": 60e3, "5m": 300e3, "15m": 900e3, "1h": 3600e3, "4h": 14400e3, "1d": 86400e3 }[interval];
  // Конец окна прошлого — по границе свечи: иначе каждый запрос был бы новым ключом кеша.
  const конецПрошлого = до ? Math.floor(Number(до) / шаг) * шаг - 1 : null;
  const ключ = `${coin}|${interval}|${конецПрошлого || ""}`;
  const было = свечиКеш.get(ключ);
  const срок = конецПрошлого ? 600_000 : interval === "1m" ? 10_000 : 30_000;
  if (было && Date.now() - было.at < срок) return было.ждём || было.свечи;
  const конец = конецПрошлого || Date.now();
  const ждём = инфоРынка({ type: "candleSnapshot", req: { coin, interval, startTime: конец - шаг * СВЕЧЕЙ, endTime: конец } })
    .then((с) => (с || []).map((x) => ({ t: x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v })));
  свечиКеш.set(ключ, { at: Date.now(), ждём, свечи: было ? было.свечи : [] });
  try {
    const свечи = await ждём;
    свечиКеш.set(ключ, { at: Date.now(), свечи });
    if (свечиКеш.size > 500) свечиКеш.delete(свечиКеш.keys().next().value);
    return свечи;
  } catch (e) {
    // Биржа не ответила — отдаём прошлые свечи, если были, и спросим снова.
    if (было && было.свечи && было.свечи.length) { свечиКеш.set(ключ, { at: 0, свечи: было.свечи }); return было.свечи; }
    свечиКеш.delete(ключ);
    throw e;
  }
}

/* Цена и размер в том виде, какой примет биржа: не больше пяти значащих
   цифр и не больше (6 − szDecimals) знаков после запятой у цены; размер —
   вниз до szDecimals. */
const безХвоста = (x) => String(Number(x));
function ценаБиржи(px, szDec) {
  return безХвоста(Number(Number(px).toPrecision(5)).toFixed(Math.max(0, 6 - szDec)));
}
function размерБиржи(sz, szDec) {
  const м = 10 ** szDec;
  return безХвоста((Math.floor(Number(sz) * м) / м).toFixed(szDec));
}
const вниз2 = (x) => Math.floor(Number(x) * 100) / 100;
const вверх2 = (x) => Math.ceil(Number(x) * 100) / 100;

/* Номер действия — время в мс, но строго растущий на каждый адрес: два
   действия одного счёта в одну миллисекунду (фоновое ожидание и нажатие
   человека) получили бы один номер, и биржа отвергла бы второе. */
const номера = new Map();
function номерДействия(адрес) {
  const к = String(адрес).toLowerCase();
  const n = Math.max(Date.now(), (номера.get(к) || 0) + 1);
  номера.set(к, n);
  if (номера.size > 20000) номера.clear();
  return n;
}

/* Подпись действия биржи (L1): msgpack действия + номер, хэш — внутри
   EIP-712 «Agent». Так подписывают и официальные SDK. */
async function подписатьДействие(w, действие, nonce) {
  const { keccak256, Signature } = await ethersLib();
  const тело = encode(действие);
  const буфер = new Uint8Array(тело.length + 9);
  буфер.set(тело);
  new DataView(буфер.buffer).setBigUint64(тело.length, BigInt(nonce));
  буфер[тело.length + 8] = 0; // без подсчёта (vault)
  const connectionId = keccak256(буфер);
  const подпись = await w.signTypedData(
    { name: "Exchange", version: "1", chainId: 1337, verifyingContract: НОЛЬ },
    { Agent: [{ name: "source", type: "string" }, { name: "connectionId", type: "bytes32" }] },
    { source: БОЕВАЯ ? "a" : "b", connectionId },
  );
  const { r, s, v } = Signature.from(подпись);
  return { r, s, v };
}
async function отправитьДействие(w, действие) {
  const nonce = номерДействия(w.address);
  const signature = await подписатьДействие(w, действие, nonce);
  const r = await fetch(`${API}/exchange`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: действие, nonce, signature, vaultAddress: null }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => null);
  if (!j || j.status !== "ok") throw new Error((j && (j.response || j.error)) || `биржа ответила ${r.status}`);
  // Внутри ответа заявки — своя ошибка по каждой (например, мало денег).
  const статусы = j.response && j.response.data && j.response.data.statuses;
  const ошибка = Array.isArray(статусы) && статусы.find((с) => с && с.error);
  if (ошибка) throw new Error(ошибка.error);
  return j;
}

/* Действия, которые подписывает сам владелец счёта (EIP-712
   «HyperliquidTransaction:*»): вывод, перевод между спотом и фьючерсами,
   между площадками, отправка токена. Номер — поле time или nonce. */
async function действиеВладельца(w, тип, поля, действие) {
  const { Signature } = await ethersLib();
  const signatureChainId = БОЕВАЯ ? "0xa4b1" : "0x66eee";
  const полное = { ...действие, hyperliquidChain: БОЕВАЯ ? "Mainnet" : "Testnet", signatureChainId };
  const подпись = await w.signTypedData(
    { name: "HyperliquidSignTransaction", version: "1", chainId: parseInt(signatureChainId, 16), verifyingContract: НОЛЬ },
    { [тип]: поля },
    Object.fromEntries(поля.map((п) => [п.name, полное[п.name]])),
  );
  const { r, s, v } = Signature.from(подпись);
  const ответ = await fetch(`${API}/exchange`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: полное, nonce: полное.time ?? полное.nonce, signature: { r, s, v } }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await ответ.json().catch(() => null);
  if (!j || j.status !== "ok") throw new Error((j && (j.response || j.error)) || "биржа не приняла");
  return j;
}
const ПОЛЯ = {
  вывод: [
    { name: "hyperliquidChain", type: "string" }, { name: "destination", type: "string" },
    { name: "amount", type: "string" }, { name: "time", type: "uint64" },
  ],
  междуСчетами: [
    { name: "hyperliquidChain", type: "string" }, { name: "amount", type: "string" },
    { name: "toPerp", type: "bool" }, { name: "nonce", type: "uint64" },
  ],
  токен: [
    { name: "hyperliquidChain", type: "string" }, { name: "destination", type: "string" },
    { name: "token", type: "string" }, { name: "amount", type: "string" }, { name: "time", type: "uint64" },
  ],
  площадки: [
    { name: "hyperliquidChain", type: "string" }, { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" }, { name: "destinationDex", type: "string" },
    { name: "token", type: "string" }, { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" }, { name: "nonce", type: "uint64" },
  ],
};

/* Вывод с биржи на свой адрес в Arbitrum (старый путь). */
async function вывести(w, сумма) {
  return действиеВладельца(w, "HyperliquidTransaction:Withdraw", ПОЛЯ.вывод,
    { type: "withdraw3", destination: w.address, amount: безХвоста(сумма), time: номерДействия(w.address) });
}
async function междуСчетами(w, сумма, наФьючерсы) {
  try {
    return await действиеВладельца(w, "HyperliquidTransaction:UsdClassTransfer", ПОЛЯ.междуСчетами,
      { type: "usdClassTransfer", amount: безХвоста(сумма), toPerp: наФьючерсы, nonce: номерДействия(w.address) });
  } catch (e) {
    // У «единого» счёта спот и фьючерсы общие — переводить нечего.
    if (/unified|abstraction/i.test(String(e && e.message))) return null;
    throw e;
  }
}
/* Залог между основной биржей ("") и площадкой HIP-3: у каждой площадки
   свой счёт, и без перевода сделка на золото или индекс не проходила —
   деньги лежали на основной бирже. */
async function междуПлощадками(w, откуда, куда, сумма) {
  const { usdc } = await спотМета();
  try {
    return await действиеВладельца(w, "HyperliquidTransaction:SendAsset", ПОЛЯ.площадки, {
      type: "sendAsset", destination: w.address.toLowerCase(), sourceDex: откуда, destinationDex: куда,
      token: usdc, amount: безХвоста(сумма), fromSubAccount: "", nonce: номерДействия(w.address),
    });
  } catch (e) {
    // Счёт с общим залогом площадок — переводить нечего.
    if (/abstraction|unified/i.test(String(e && e.message))) return null;
    throw e;
  }
}

const ключХранителя = (hex) => crypto.createPublicKey({ format: "jwk", key: {
  kty: "EC", crv: "P-256",
  x: Buffer.from(hex.slice(2, 66), "hex").toString("base64url"),
  y: Buffer.from(hex.slice(66), "hex").toString("base64url"),
} });
/* Адрес моста. Подписан текст «узел:user-<вид адреса>-<сеть получателя>-
   <получатель>-<адрес>»; адреса постоянные, поэтому проверенный храним. */
const адресаUnit = new Map();
async function адресUnit({ откуда, куда, кому, вид }) {
  const путь = `${откуда}/${куда}/sol/${кому}`;
  if (адресаUnit.has(путь)) return адресаUnit.get(путь);
  const r = await fetch(`${UNIT_API}/gen/${путь}`, { signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => null);
  if (!j || typeof j.address !== "string") throw new Error("мост Unit не ответил");
  let верных = 0;
  for (const [узел, hex] of Object.entries(ХРАНИТЕЛИ)) {
    const подпись = j.signatures && j.signatures[узел];
    if (!подпись) continue;
    const текст = `${узел}:user-${вид}-${куда}-${кому}-${j.address}`;
    try {
      if (crypto.verify("sha256", Buffer.from(текст), { key: ключХранителя(hex), dsaEncoding: "ieee-p1363" }, Buffer.from(подпись, "base64"))) верных++;
    } catch { /* битая подпись — просто не считается */ }
  }
  if (верных < 2) throw new Error("адрес моста не подтверждён");
  адресаUnit.set(путь, j.address);
  return j.address;
}

/* Спот: пара USOL/USDC (номер заявки — 10000 + номер пары), полные имена
   токенов для отправки. Справочник — раз в 10 минут, цена — живая из
   сокета («@156»), а без сокета — из справочника. */
let спотКеш = { at: 0 };
async function спотМета() {
  if (Date.now() - спотКеш.at < 600_000 && спотКеш.sol) return спотКеш;
  const [мета, цены] = await инфо({ type: "spotMetaAndAssetCtxs" });
  const т = мета.tokens.find((x) => x.name === "USOL");
  const пара = т && мета.universe.find((u) => u.tokens[0] === т.index && u.tokens[1] === 0);
  if (!пара) throw new Error("на бирже нет пары SOL");
  const usdc = мета.tokens.find((x) => x.index === 0);
  // Цены идут не в порядке списка пар — ищем по имени пары («@156»).
  const ц = цены.find((x) => x && x.coin === пара.name) || {};
  спотКеш = {
    at: Date.now(),
    usdc: `${usdc.name}:${usdc.tokenId}`,
    sol: { пара: пара.name, asset: 10000 + пара.index, токен: `${т.name}:${т.tokenId}`, szDecimals: т.szDecimals, цена: Number(ц.midPx || ц.markPx) || 0 },
  };
  следитьЗаЦенами([""]);
  return спотКеш;
}
async function спотSOL() {
  const { sol } = await спотМета();
  const живая = ценыЖивы() ? живые.get(sol.пара) : 0;
  return живая > 0 ? { ...sol, цена: живая } : sol;
}
async function спотБалансы(адрес) {
  const с = await инфо({ type: "spotClearinghouseState", user: адрес });
  const м = new Map();
  for (const б of (с && с.balances) || []) м.set(б.coin, Math.max(0, Number(б.total) - Number(б.hold || 0)));
  return м;
}
// У спота знаков после запятой у цены — до 8 − szDecimals.
const ценаСпота = (px, szDec) => безХвоста(Number(Number(px).toPrecision(5)).toFixed(Math.max(0, 8 - szDec)));
async function заявкаСпота(w, sol, купить, размер) {
  const p = ценаСпота(sol.цена * (купить ? 1.03 : 0.97), sol.szDecimals);
  return отправитьДействие(w, { type: "order", orders: [{ a: sol.asset, b: купить, p, s: размер, r: false, t: { limit: { tif: "Ioc" } } }], grouping: "na" });
}

/* Пришедший с моста SOL — в доллары на счёт фьючерсов: продать USOL
   (меньше $10 биржа не берёт — такой остаток ждёт следующего), затем
   весь USDC спота перевести на фьючерсы. */
async function свести(w) {
  const sol = await спотSOL();
  let б = await спотБалансы(w.address);
  const размер = размерБиржи(б.get("USOL") || 0, sol.szDecimals);
  let продано = 0;
  if (Number(размер) * sol.цена >= 10.5) {
    await заявкаСпота(w, sol, false, размер);
    продано = Number(размер);
    б = await спотБалансы(w.address);
  }
  const usdc = вниз2(б.get("USDC") || 0);
  if (usdc >= 1) await междуСчетами(w, usdc, true);
  return { sold: продано, usdc: usdc >= 1 ? usdc : 0 };
}

async function usdcВArbitrum(адрес) {
  const { JsonRpcProvider, Contract, formatUnits } = await ethersLib();
  const п = new JsonRpcProvider(ARB_RPC, undefined, { staticNetwork: true });
  const к = new Contract(USDC, ["function balanceOf(address) view returns (uint256)"], п);
  const [usdc, газ] = await Promise.all([к.balanceOf(адрес), п.getBalance(адрес)]);
  return { usdc: Number(formatUnits(usdc, 6)), eth: Number(formatUnits(газ, 18)) };
}

/* Позиция «по рынку» — заявка IOC с запасом цены: исполнится сразу или
   не исполнится. */
async function заявкаПозиции(w, рынок, isBuy, размер, reduceOnly) {
  const s = размерБиржи(размер, рынок.szDecimals);
  if (!(Number(s) > 0)) throw new Error("too_small");
  const p = ценаБиржи(рынок.price * (isBuy ? 1 + ПРОСКАЛЬЗЫВАНИЕ : 1 - ПРОСКАЛЬЗЫВАНИЕ), рынок.szDecimals);
  return отправитьДействие(w, {
    type: "order",
    orders: [{ a: рынок.asset, b: isBuy, p, s, r: reduceOnly, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
  });
}
// Сколько залога нужно под позицию: сам залог плюс комиссия с объёма.
const залогСКомиссией = (usd, плечо) => usd * (1 + плечо * КОМИССИЯ) + 0.05;
async function открытьПозицию(w, рынок, isBuy, usd, плечо) {
  // Площадка HIP-3: недостающий залог — с основной биржи на её счёт.
  if (рынок.dex) {
    const с = await состояние(w.address, рынок.dex);
    const есть = Number(с && с.withdrawable) || 0;
    const добавить = вверх2(залогСКомиссией(usd, плечо) - есть);
    if (добавить > 0) await междуПлощадками(w, "", рынок.dex, добавить);
    запомнитьПлощадку(w.address, рынок.dex);
  }
  // Плечо задаётся до заявки: биржа помнит его по рынку.
  await отправитьДействие(w, { type: "updateLeverage", asset: рынок.asset, isCross: !рынок.isolated, leverage: плечо });
  return заявкаПозиции(w, рынок, isBuy, (usd * плечо) / рынок.price, false);
}
/* Свободно для сделки на рынке: основная биржа плюс уже лежащее на счёте
   его площадки (для HIP-3). */
async function свободноДля(w, рынок) {
  const [о, п] = await Promise.all([
    состояние(w.address, ""),
    рынок && рынок.dex ? состояние(w.address, рынок.dex).catch(() => null) : null,
  ]);
  return (Number(о && о.withdrawable) || 0) + (Number(п && п.withdrawable) || 0);
}

/* Площадки, где у человека бывают деньги или позиции. Все площадки
   опрашиваем раз в минуту, в остальное время — только основную и эти:
   иначе каждый опрос счёта стоил бы десяток запросов к бирже. */
const площадкиЛюдей = new Map();
function запомнитьПлощадку(адрес, dex) {
  const к = String(адрес).toLowerCase();
  const з = площадкиЛюдей.get(к) || { at: 0, набор: new Set(), спот: null };
  з.набор.add(dex);
  площадкиЛюдей.set(к, з);
}
async function счётЧеловека(адрес, р) {
  const к = String(адрес).toLowerCase();
  const з = площадкиЛюдей.get(к);
  const полный = !з || Date.now() - з.at > 60_000;
  const список = полный ? р.площадки : ["", ...з.набор];
  const [состояния, спот] = await Promise.all([
    Promise.all(список.map((dex) => состояние(адрес, dex).catch(() => null))),
    полный ? спотБалансы(адрес).catch(() => null) : Promise.resolve(з.спот),
  ]);
  if (полный) {
    const набор = new Set(список.filter((dex, i) => dex && состояния[i] && (
      Number(состояния[i].marginSummary && состояния[i].marginSummary.accountValue) > 0.01 ||
      (состояния[i].assetPositions || []).length > 0)));
    if (з) for (const dex of з.набор) набор.add(dex);
    площадкиЛюдей.set(к, { at: Date.now(), набор, спот });
    if (площадкиЛюдей.size > 20000) площадкиЛюдей.delete(площадкиЛюдей.keys().next().value);
  }
  return { состояния: список.map((dex, i) => ({ dex, с: состояния[i] })), спот };
}

/* Плата моста за пополнение в SOL — у Unit (раз в 10 минут). */
let платаМоста = { at: 0, sol: 0.02 };
async function платаЗаМост() {
  if (Date.now() - платаМоста.at > 600e3) {
    try {
      const j = await (await fetch(`${UNIT_API}/v2/estimate-fees`, { signal: AbortSignal.timeout(5000) })).json();
      const п = Number(j && j.solana && j.solana["deposit-fee-in-units"]);
      if (п > 0 && п < 1) платаМоста = { at: Date.now(), sol: п };
    } catch { /* остаётся прошлая */ }
  }
  return платаМоста.sol;
}

/* Сколько SOL с карты нужно, чтобы на бирже стало ещё usd долларов:
   по цене продажи с запасом 3% плюс плата моста. Меньше минимума моста
   и меньше $11 (на споте не продать дешевле $10) не шлём. */
async function пополнитьСКарты(user, w, usd) {
  if (SOLANA_ТЕСТОВАЯ === БОЕВАЯ) throw Object.assign(new Error("network_mismatch"), { код: 400 });
  const sol = await спотSOL();
  if (!(sol.цена > 0)) throw new Error("нет цены SOL");
  const плата = await платаЗаМост();
  const нужно = Math.max(МИН_SOL, (Math.max(usd, 11) / (sol.цена * 0.97)) + плата);
  const сумма = Math.ceil(нужно * 1e4) / 1e4;
  const куда = await адресUnit({ откуда: "solana", куда: "hyperliquid", кому: w.address, вид: "solana" });
  await отправитьНаБиржу({ user_id: user.id, сумма, куда });
  return сумма;
}

/* С биржи на карту: доллары фьючерсов → спот → купить USOL → отправить
   на адрес моста, выданный под Solana-кошелёк приложения. */
async function вывестиНаКарту(w, user, usd) {
  const кош = await кошелёкДляБота(user.id);
  if (!кош) throw new Error("no_wallet");
  if (SOLANA_ТЕСТОВАЯ === БОЕВАЯ) throw Object.assign(new Error("network_mismatch"), { код: 400 });
  const sol = await спотSOL();
  // Запас 3% — на цену заявки «по рынку»: биржа держит под неё доллары.
  const размер = размерБиржи(usd / (sol.цена * 1.03), sol.szDecimals);
  if (!(Number(размер) >= МИН_SOL + 0.01) || Number(размер) * sol.цена < 10.5) throw Object.assign(new Error("min_sol"), { код: 400 });
  // Адрес — до любых переводов: не подтвердился — деньги остаются на месте.
  const куда = await адресUnit({ откуда: "hyperliquid", куда: "solana", кому: кош.address, вид: "ethereum" });
  await междуСчетами(w, usd, false);
  try {
    await заявкаСпота(w, sol, true, размер);
  } catch (e) {
    // Не купилось — доллары обратно на фьючерсы, чтобы не висели на споте.
    await свести(w).catch(() => {});
    throw e;
  }
  const usol = (await спотБалансы(w.address)).get("USOL") || 0;
  if (!(usol >= МИН_SOL)) throw new Error("SOL не купился, деньги остались на бирже");
  await действиеВладельца(w, "HyperliquidTransaction:SpotSend", ПОЛЯ.токен,
    { type: "spotSend", destination: куда, token: sol.токен, amount: безХвоста(usol), time: номерДействия(w.address) });
  // Сдача от покупки — обратно на фьючерсы.
  await свести(w).catch(() => {});
  return usol;
}
/* После закрытия: залог с площадок HIP-3 без позиций — на основную
   биржу; позиций не осталось нигде — всё свободное уходит на карту. */
async function вернутьНаКарту(w, user) {
  if (ждут.has(user.id)) return null;
  const р = await собратьРынки();
  const состояния = await Promise.all(р.площадки.map((dex) => состояние(w.address, dex).catch(() => null)));
  for (let i = 1; i < р.площадки.length; i += 1) {
    const с = состояния[i];
    if (!с || (с.assetPositions || []).length) continue;
    const лишнее = вниз2(Number(с.withdrawable) || 0);
    if (лишнее >= 0.5) await междуПлощадками(w, р.площадки[i], "", лишнее).catch((e) => console.warn("[hyperliquid] залог с площадки", e && e.message));
  }
  const открыты = состояния.some((с) => с && (с.assetPositions || []).some((ап) => Math.abs(Number(ап.position && ап.position.szi)) > 0));
  if (открыты) return null;
  const свободно = вниз2(Number((await состояние(w.address, "")).withdrawable) || 0);
  // Остаток меньше минимума моста ждёт на бирже и уйдёт в следующую сделку.
  try { return await вывестиНаКарту(w, user, свободно); } catch (e) { if (e && e.message === "min_sol") return null; throw e; }
}

/* Сделки, ждущие пополнения с карты. Раз в 5 секунд: пришедший SOL —
   в доллары на фьючерсы, и как только их прибавилось — открываем
   позицию на то, что дошло (плата моста и цена могли съесть чуть-чуть).
   Живёт в памяти процесса: после перезапуска деньги не теряются — они
   на бирже и уйдут в следующую сделку или вернутся на карту. Чем
   кончилось — помним минуту, телефон покажет это человеку. */
const ждут = new Map();
const итогиОжидания = new Map();
let таймерОжидания = null;
function итогОжидания(id, итог) {
  итогиОжидания.set(id, { ...итог, at: Date.now() });
  for (const [к, и] of итогиОжидания) if (Date.now() - и.at > 120_000) итогиОжидания.delete(к);
}
function запуститьОжидание() {
  if (таймерОжидания) return;
  таймерОжидания = setInterval(async () => {
    if (!ждут.size) { clearInterval(таймерОжидания); таймерОжидания = null; return; }
    for (const [id, з] of ждут) {
      if (з.идёт) continue;
      let отпустить = null;
      try { отпустить = занять(`hl:${id}`, 60_000); } catch { continue; }
      з.идёт = true;
      try {
        await свести(з.w);
        const рынок = (await собратьРынки()).поНомеру.get(з.asset);
        const есть = await свободноДля(з.w, рынок);
        if (есть > з.было + 1) {
          ждут.delete(id);
          const usd = вниз2(Math.min(з.usd, есть / (1 + з.плечо * КОМИССИЯ) - 0.06));
          if (рынок && usd >= 10) {
            await открытьПозицию(з.w, рынок, з.isBuy, usd, Math.min(з.плечо, рынок.maxLeverage));
            итогОжидания(id, { ok: true, usd, name: рынок.name, isBuy: з.isBuy });
          } else итогОжидания(id, { ok: false, error: "min_10_usd" });
        } else if (Date.now() > з.до) {
          ждут.delete(id);
          итогОжидания(id, { ok: false, error: "timeout" });
        }
      } catch (e) {
        console.warn("[hyperliquid] ожидание пополнения", e && e.message);
        if (!ждут.has(id) || Date.now() > з.до) {
          ждут.delete(id);
          итогОжидания(id, { ok: false, error: String((e && e.message) || e).slice(0, 160) });
        }
      } finally { з.идёт = false; if (отпустить) отпустить(); }
    }
  }, 5000);
  if (таймерОжидания.unref) таймерОжидания.unref();
}

/* Карта (Solana-кошелёк приложения) для экрана биржи — раз в 15 секунд:
   счёт опрашивается каждые пять, и каждый раз база плюс узел Solana. */
const карты = new Map();
async function картаЧеловека(id) {
  const б = карты.get(id);
  if (б && Date.now() - б.at < 15_000) return б.к;
  const к = await кошелёкДляБота(id).catch(() => (б ? б.к : null));
  карты.set(id, { at: Date.now(), к });
  if (карты.size > 20000) карты.clear();
  return к;
}

/* --- Торговый счёт (api/_tradingAccount.js) ---------------------------- */

const площадкаМонеты = (coin) => { const м = /^([a-z0-9]+):/i.exec(String(coin || "")); return м ? м[1] : ""; };
const ценаТекстом = (v) => (v >= 1000 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : Number(v).toPrecision(4));

/* Свежая цена монеты для сделки. Из сокета — если площадка присылала цены
   последние 10 секунд; иначе спрашиваем биржу напрямую (вес 2), не чаще
   раза в две секунды на площадку. Устаревшая цена — ноль: сделка по ней не
   пройдёт (price_stale), иначе по старой цене можно было бы купить то, что
   уже подорожало. */
const опросЦен = new Map();
async function свежаяЦена(coin) {
  const dex = площадкаМонеты(coin);
  const свежо = () => Date.now() - (живыеПоПлощадке.get(dex) || 0) < 10_000;
  if (свежо() && живые.get(coin) > 0) return живые.get(coin);
  следитьЗаЦенами([dex]);
  let о = опросЦен.get(dex);
  if (!о || Date.now() - о.at > 2000) {
    о = {
      at: Date.now(),
      ждём: инфоРынка(dex ? { type: "allMids", dex } : { type: "allMids" }).then((mids) => {
        if (!mids || typeof mids !== "object") return;
        for (const [к, v] of Object.entries(mids)) живые.set(к, Number(v));
        живыеПоПлощадке.set(dex, Date.now());
        сторож(mids);
      }),
    };
    опросЦен.set(dex, о);
  }
  try { await о.ждём; } catch { return 0; }
  return свежо() && живые.get(coin) > 0 ? живые.get(coin) : 0;
}
// Для показа счёта годится и цена минутной давности.
const ценаДляЭкрана = (coin) => (Date.now() - (живыеПоПлощадке.get(площадкаМонеты(coin)) || 0) < 60_000 ? живые.get(coin) || 0 : 0);

/* Сторож позиций: каждое сообщение цен проверяет тейки, стопы и
   ликвидации на этих рынках — сразу, а не опросом раз в минуту: иначе стоп
   срабатывал бы по цене, далёкой от своей, а ликвидация — уже за точкой
   банкротства. */
function сторож(mids) {
  if (!ДЕМО && !БОЕВАЯ) return;
  let нужные;
  try { нужные = торговый.монетыСПозициями(); } catch { return; }
  if (!нужные.size) return;
  const цены = new Map();
  for (const coin of нужные) { const v = Number(mids[coin]); if (v > 0) цены.set(coin, v); }
  if (!цены.size) return;
  if (ДЕМО) {
    for (const с of торговый.проверитьЦены(цены)) сообщитьОСрабатывании(с.uid, с.event).catch(() => {});
  } else {
    for (const т of торговый.сработавшиеБоевые(цены)) закрытьПоУровню(т).catch((e) => console.warn("[hyperliquid] тейк/стоп", e && e.message));
  }
}

const СЛОВО_УРОВНЯ = { tp: "Тейк", sl: "Стоп", liq: "Ликвидация" };
async function сообщитьОСрабатывании(uid, з) {
  if (!з || !СЛОВО_УРОВНЯ[з.kind]) return;
  const db = admin();
  if (!db) return;
  const { data } = await db.from("profiles").select("telegram_id").eq("id", uid).maybeSingle();
  if (!data || !data.telegram_id) return;
  const { уведомить } = await import("./_trading.js");
  const pnl = Number(з.pnl) || 0;
  await уведомить(data.telegram_id,
    `${СЛОВО_УРОВНЯ[з.kind]} <b>${з.name}</b>: ${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)} · ${з.side > 0 ? "лонг" : "шорт"} закрыт по $${ценаТекстом(Number(з.price) || 0)}`,
    "wallet");
}

/* Тейк или стоп на основной бирже сработал: закрываем позицию заявкой «по
   рынку». Позиции уже нет или она перевернулась — уровень снимаем: он был
   про ту, прежнюю. */
const закрываем = new Set();
async function закрытьПоУровню({ uid, coin, причина }) {
  const метка = `${uid}|${coin}`;
  if (закрываем.has(метка)) return;
  закрываем.add(метка);
  let отпустить = null;
  try {
    try { отпустить = занять(`hl:${uid}`, 60_000); } catch { return; } // занят — попробует следующая цена
    const db = admin();
    if (!db) return;
    const w = await подписьEVMЧеловека(db, { id: uid });
    const р = await собратьРынки();
    const рынок = р.список.find((м) => м.coin === coin);
    if (!рынок) return;
    const с = await состояние(w.address, рынок.dex);
    const п = ((с && с.assetPositions) || []).map((x) => x.position).find((x) => x && x.coin === coin);
    const szi = п ? Number(п.szi) : 0;
    const уровень = торговый.тейкСтопыБоевые(uid)[coin];
    if (!szi || !уровень || Math.sign(szi) !== уровень.сторона) { торговый.тейкСтопБоевой(uid, { coin }); return; }
    await заявкаПозиции(w, рынок, szi < 0, Math.abs(szi), true);
    торговый.тейкСтопБоевой(uid, { coin });
    const з = торговый.записатьСобытие(uid, {
      kind: причина, coin, name: рынок.name, dex: рынок.dex, side: Math.sign(szi), size: Math.abs(szi),
      price: рынок.price, entry: Number(п.entryPx) || 0, pnl: Number(п.unrealizedPnl) || 0,
      lev: (п.leverage && Number(п.leverage.value)) || 1,
    });
    сообщитьОСрабатывании(uid, з).catch(() => {});
  } finally {
    if (отпустить) отпустить();
    закрываем.delete(метка);
  }
}

function проверитьУровни(сторона, цена, liq, tp, sl) {
  const ош = (к) => Object.assign(new Error(к), { код: 400 });
  if (tp != null && !(сторона > 0 ? tp > цена : tp < цена)) throw ош("tp_side");
  if (sl != null && !(сторона > 0 ? sl < цена : sl > цена)) throw ош("sl_side");
  if (sl != null && liq > 0 && (сторона > 0 ? sl <= liq : sl >= liq)) throw ош("sl_beyond_liq");
}
const уровеньИз = (v) => (v == null || v === "" || !(Number(v) > 0) ? null : Number(v));

// Ключ запроса из тела: повтор того же нажатия узнаётся по нему.
const ключЗапроса = (тело) => {
  const к = String((тело && тело.requestKey) || "");
  return /^[A-Za-z0-9_-]{8,48}$/.test(к) ? к : crypto.randomUUID();
};

/* Учебный счёт: всё, что касается денег человека на бирже, — здесь, без
   Hyperliquid. Сделка — мгновенная: проверка и списание в памяти, запись
   на диск, ответ. */
const последнийУчебный = new Map();
async function учебный(req, res, действие, user) {
  if (действие === "account") {
    const [, кош, sol] = await Promise.all([
      собратьРынки().catch(() => null),
      картаЧеловека(user.id),
      свежаяЦена("SOL").catch(() => 0),
    ]);
    const с = торговый.счётДляЭкрана(user.id, ценаДляЭкрана);
    // Площадки открытых позиций держат сокет цен подписанным — сторожу нужны цены.
    if (с.positions.length) следитьЗаЦенами([...new Set(с.positions.map((п) => п.dex || ""))]);
    return res.status(200).json({
      demo: true, network: "demo", ...с,
      wallet: кош ? { address: кош.address, sol: кош.sol } : null,
      solPrice: sol || ценаДляЭкрана("SOL"),
      fee: торговый.КОМИССИЯ, spread: торговый.СПРЕД, minNotional: торговый.МИН_ОБЪЁМ,
      minMargin: торговый.МИН_ЗАЛОГ, minTransfer: МИН_ПЕРЕВОДА_USD, tpsl: true,
    });
  }
  if (действие === "trades") {
    const coin = req.query && req.query.coin ? String(req.query.coin).slice(0, 40) : null;
    return res.status(200).json({ events: торговый.журнал(user.id, { coin, предел: 80 }) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const ключ = ключЗапроса(тело);
  // Повтор уже исполненного нажатия — тот же ответ, раньше предела частоты:
  // иначе переспрос после обрыва связи получал бы «слишком быстро».
  const было = торговый.ответПоКлючу(user.id, ключ);
  if (было) return res.status(200).json(было);
  const сейчас = Date.now();
  if (сейчас - (последнийУчебный.get(user.id) || 0) < 250) return res.status(429).json({ error: "too_fast" });
  последнийУчебный.set(user.id, сейчас);
  if (последнийУчебный.size > 50000) последнийУчебный.clear();

  if (действие === "order" || действие === "close" || действие === "tpsl") {
    const р = await собратьРынки();
    const рынок = р.поНомеру.get(Number(тело.asset)) || (тело.coin ? р.список.find((м) => м.coin === String(тело.coin)) : null);
    if (!рынок) return res.status(400).json({ error: "no_market" });
    const цена = await свежаяЦена(рынок.coin);
    if (действие === "order") {
      const ответ = торговый.открыть(user.id, {
        рынок, цена, isBuy: !!тело.isBuy, usd: тело.usd, плечо: тело.leverage, tp: тело.tp, sl: тело.sl, ключ,
      });
      следитьЗаЦенами([рынок.dex || ""]);
      return res.status(200).json(ответ);
    }
    if (действие === "close") return res.status(200).json(торговый.закрыть(user.id, { coin: рынок.coin, цена, ключ }));
    return res.status(200).json(торговый.тейкСтоп(user.id, { coin: рынок.coin, цена, tp: тело.tp, sl: тело.sl }));
  }
  if (действие === "transfer") {
    // Свой замок, не замок сделок: перевод ждёт сеть до полуминуты, а
    // сделки в это время должны идти.
    let отпустить;
    try { отпустить = занять(`ta:${user.id}`, 120_000); } catch { return res.status(409).json({ error: "busy" }); }
    try {
      const цена = await свежаяЦена("SOL");
      const ответ = тело.direction === "out"
        ? await сТоргового({ uid: user.id, usd: тело.amount, ключ, цена })
        : await наТорговый({ uid: user.id, sol: тело.amount, ключ, цена });
      карты.delete(user.id);
      return res.status(200).json(ответ);
    } finally { отпустить(); }
  }
  // Мост, спот и Arbitrum — пути настоящей биржи; у учебного счёта их нет.
  return res.status(400).json({ error: "demo_mode" });
}

/* Сделки основной биржи для истории — её же журнал исполнений. Тейк и
   стоп приложения узнаются по своей записи рядом по времени. */
async function сделкиБоевые(w, uid, coin = null) {
  const заявки = await инфо({ type: "userFills", user: w.address }).catch(() => []);
  const свои = торговый.журнал(uid, { предел: 200 });
  return (Array.isArray(заявки) ? заявки : [])
    .filter((f) => f && !String(f.coin).startsWith("@") && (!coin || f.coin === coin))
    .slice(0, 80)
    .map((f) => {
      const dir = String(f.dir || "");
      const закрытие = /^Close/i.test(dir);
      let kind = f.liquidation ? "liq" : закрытие ? "close" : "open";
      if (kind === "close") {
        const з = свои.find((x) => (x.kind === "tp" || x.kind === "sl") && x.coin === f.coin && Math.abs(x.at - f.time) < 15_000);
        if (з) kind = з.kind;
      }
      return {
        id: `f-${f.tid || f.hash}`, at: Number(f.time) || 0, kind, coin: f.coin,
        name: String(f.coin).replace(/^[a-z0-9]+:/i, ""), side: /Short/i.test(dir) ? -1 : 1,
        size: Number(f.sz) || 0, price: Number(f.px) || 0, fee: Number(f.fee) || 0,
        pnl: закрытие || f.liquidation ? (Number(f.closedPnl) || 0) - (Number(f.fee) || 0) : 0,
      };
    });
}

/* События биржи для истории кошелька (api/wallet-history.js): сделки,
   тейки, стопы и ликвидации. Переводы карта ⇄ счёт там уже есть — из
   журнала кошелька, с подписью транзакции. */
export async function событияДляИстории(user) {
  if (ДЕМО) return торговый.журнал(user.id, { предел: 80 }).filter((з) => з.kind !== "in" && з.kind !== "out");
  if (!БОЕВАЯ) return [];
  const db = admin();
  if (!db) return [];
  const w = await подписьEVMЧеловека(db, user);
  return сделкиБоевые(w, user.id);
}

/* Сторож запускается вместе с сервером (server/index.mjs): позиции и
   тейки должны жить и тогда, когда экран биржи никто не открыл. */
let сторожЗапущен = false;
export function запуститьСторожа() {
  if (сторожЗапущен || (!ДЕМО && !БОЕВАЯ)) return false;
  сторожЗапущен = true;
  const площадкиПозиций = () => [...new Set([...торговый.монетыСПозициями()].map(площадкаМонеты))];
  const есть = площадкиПозиций();
  if (есть.length) следитьЗаЦенами(есть);
  // Сокет молчит — сторож всё равно должен видеть цену: опрос раз в 5 секунд.
  const опрос = setInterval(() => {
    const монеты = [...торговый.монетыСПозициями()];
    for (const dex of new Set(монеты.map(площадкаМонеты))) {
      if (Date.now() - (живыеПоПлощадке.get(dex) || 0) > 15_000) свежаяЦена(монеты.find((c) => площадкаМонеты(c) === dex)).catch(() => {});
    }
  }, 5000);
  if (опрос.unref) опрос.unref();
  if (ДЕМО) {
    довестиПереводы().catch((e) => console.warn("[торговый счёт] сверка", e && e.message));
    const сверка = setInterval(() => { довестиПереводы().catch((e) => console.warn("[торговый счёт] сверка", e && e.message)); }, 15_000);
    if (сверка.unref) сверка.unref();
  }
  return true;
}

/* Пополнение через мост на основной бирже: пришедший SOL сервер сам
   продаёт в доллары и кладёт на счёт фьючерсов — человеку не нужно для
   этого держать открытым экран биржи. */
const сводим = new Map();
let таймерСвода = null;
function свестиПозже(user, w) {
  сводим.set(user.id, { w, до: Date.now() + 15 * 60e3 });
  if (таймерСвода) return;
  таймерСвода = setInterval(async () => {
    if (!сводим.size) { clearInterval(таймерСвода); таймерСвода = null; return; }
    for (const [id, з] of сводим) {
      if (Date.now() > з.до) { сводим.delete(id); continue; }
      let отпустить = null;
      try { отпустить = занять(`hl:${id}`, 60_000); } catch { continue; }
      try {
        const и = await свести(з.w);
        if (и && и.usdc > 0) сводим.delete(id);
      } catch (e) {
        console.warn("[hyperliquid] свод пополнения", e && e.message);
      } finally { отпустить(); }
    }
  }, 15_000);
  if (таймерСвода.unref) таймерСвода.unref();
}

// Не чаще раза в 700 мс на человека: подписи и заявки не для очереди кликов.
const последний = new Map();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const действие = String((req.query && req.query.action) || "markets");
  let отпустить = null;
  try {
    if (действие === "markets") {
      const р = await собратьРынки();
      res.setHeader("Cache-Control", "public, max-age=1");
      return res.status(200).json({ network: БОЕВАЯ ? "mainnet" : ДЕМО ? "demo" : "testnet", demo: ДЕМО, markets: р.список.slice(0, 300) });
    }
    if (действие === "icon") {
      const coin = String(req.query.coin || "");
      if (!/^[A-Za-z0-9:]{1,40}$/.test(coin)) return res.status(400).json({ error: "bad_request" });
      const svg = await значокМонеты(coin);
      if (!svg) { res.setHeader("Cache-Control", "public, max-age=3600"); return res.status(404).json({ error: "no_icon" }); }
      res.setHeader("Content-Type", "image/svg+xml");
      // Чужой SVG с нашего адреса: скрипты в нём не должны исполниться,
      // даже если файл откроют напрямую, а не через <img>.
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(200).send(svg);
    }
    if (действие === "candles") {
      const coin = String(req.query.coin || "");
      const interval = ["1m", "5m", "15m", "1h", "4h", "1d"].includes(req.query.interval) ? req.query.interval : "15m";
      if (!/^[A-Za-z0-9:@]{1,40}$/.test(coin)) return res.status(400).json({ error: "bad_request" });
      // Подгрузка истории левее: конец окна — время самой левой свечи на экране.
      const до = Number(req.query.before) || null;
      if (до && !(до > 1.5e12 && до < Date.now() + 86400e3)) return res.status(400).json({ error: "bad_request" });
      const свечи = await свечиРынка(coin, interval, до);
      res.setHeader("Cache-Control", до ? "public, max-age=300" : "public, max-age=5");
      return res.status(200).json({ candles: свечи });
    }

    const db = admin();
    if (!db) return res.status(503).json({ error: "not_configured" });
    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    if (ДЕМО) return await учебный(req, res, действие, user);
    const w = await подписьEVMЧеловека(db, user);

    if (действие === "account") {
      const р = await собратьРынки();
      const [{ состояния, спот }, кош, sol] = await Promise.all([
        счётЧеловека(w.address, р),
        картаЧеловека(user.id),
        спотSOL().catch(() => null),
      ]);
      let equity = 0, withdrawable = 0;
      const позиции = [];
      for (const { с } of состояния) {
        if (!с) continue;
        equity += Number(с.marginSummary && с.marginSummary.accountValue) || 0;
        withdrawable += Number(с.withdrawable) || 0;
        for (const ап of с.assetPositions || []) {
          const п = ап.position || {};
          if (!(Math.abs(Number(п.szi)) > 0)) continue;
          const рынок = р.список.find((м) => м.coin === п.coin);
          позиции.push({
            coin: п.coin, asset: рынок ? рынок.asset : null, name: рынок ? рынок.name : п.coin,
            size: Number(п.szi), entry: Number(п.entryPx) || 0, pnl: Number(п.unrealizedPnl) || 0,
            value: Number(п.positionValue) || 0, leverage: (п.leverage && Number(п.leverage.value)) || 1,
            liquidation: Number(п.liquidationPx) || null, margin: Number(п.marginUsed) || 0,
          });
        }
      }
      const итог = итогиОжидания.get(user.id);
      if (итог) итогиОжидания.delete(user.id);
      const уровни = торговый.тейкСтопыБоевые(user.id);
      for (const п of позиции) {
        const у = уровни[п.coin];
        п.tp = у && Math.sign(п.size) === у.сторона ? у.tp : null;
        п.sl = у && Math.sign(п.size) === у.сторона ? у.sl : null;
      }
      return res.status(200).json({
        address: w.address, network: БОЕВАЯ ? "mainnet" : "testnet", demo: false, tpsl: БОЕВАЯ,
        equity, withdrawable, cash: withdrawable, positions: позиции, minNotional: 10, minMargin: 10, fee: КОМИССИЯ,
        // Спот: SOL с моста, ещё не проданный, и доллары вне фьючерсов.
        spot: { sol: (спот && спот.get("USOL")) || 0, usdc: (спот && спот.get("USDC")) || 0 },
        wallet: кош ? { address: кош.address, sol: кош.sol } : null,
        solPrice: sol ? sol.цена : 0, minSol: МИН_SOL,
        // Сколько долларов дала бы карта на бирже — по цене SOL на споте.
        walletUsd: кош && sol ? Math.max(0, кош.sol - 0.01 - платаМоста.sol) * sol.цена * 0.97 : 0,
        pending: ждут.has(user.id) ? { usd: ждут.get(user.id).usd, asset: ждут.get(user.id).asset } : null,
        pendingResult: итог || null,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const сейчас = Date.now();
    if (действие !== "settle") {
      if (сейчас - (последний.get(user.id) || 0) < 700) return res.status(429).json({ error: "too_fast" });
      последний.set(user.id, сейчас);
      if (последний.size > 50000) последний.clear();
    }
    /* Один денежный шаг на человека за раз: продажа пришедшего SOL,
       вывод на карту и сделка не должны идти вперемешку — иначе вывод
       покупал USOL, а сведение тут же продавало его обратно. */
    try { отпустить = занять(`hl:${user.id}`, 90_000); } catch { return res.status(409).json({ error: "busy" }); }

    if (действие === "order") {
      const р = await собратьРынки();
      const рынок = р.поНомеру.get(Number(тело.asset));
      if (!рынок) return res.status(400).json({ error: "no_market" });
      let usd = вниз2(Number(тело.usd) || 0);
      const плечо = Math.max(1, Math.min(рынок.maxLeverage, Math.round(Number(тело.leverage) || 1)));
      if (!(usd >= 10)) return res.status(400).json({ error: "min_10_usd" });
      const свободно = await свободноДля(w, рынок);
      /* Не хватает чуть-чуть (комиссия, копейки курса) — открываем на то,
         что есть, а не гоняем SOL по мосту ради пары долларов. */
      if (свободно < залогСКомиссией(usd, плечо) && свободно >= usd * 0.97) usd = вниз2(свободно / (1 + плечо * КОМИССИЯ) - 0.06);
      const tp = уровеньИз(тело.tp), sl = уровеньИз(тело.sl);
      if (tp || sl) проверитьУровни(тело.isBuy ? 1 : -1, рынок.price, 0, tp, sl);
      if (свободно >= залогСКомиссией(usd, плечо)) {
        if (!(usd >= 10)) return res.status(400).json({ error: "min_10_usd" });
        const ответ = await открытьПозицию(w, рынок, !!тело.isBuy, usd, плечо);
        if (tp || sl) торговый.тейкСтопБоевой(user.id, { coin: рынок.coin, сторона: тело.isBuy ? 1 : -1, tp, sl });
        return res.status(200).json({ ok: true, usd, response: ответ.response });
      }
      /* Деньги на сделку лежат на торговом счёте — его пополняют заранее
         (action=transfer). Добор с карты по мосту остался только для
         прежних клиентов, которые просят его явно. */
      if (!тело.сКарты) return res.status(400).json({ error: "not_enough" });
      if (ждут.has(user.id)) return res.status(409).json({ error: "pending" });
      const sol = await пополнитьСКарты(user, w, залогСКомиссией(usd, плечо) - свободно);
      ждут.set(user.id, { w, user, asset: рынок.asset, isBuy: !!тело.isBuy, usd, плечо, было: свободно, до: Date.now() + 10 * 60e3 });
      запуститьОжидание();
      return res.status(200).json({ ok: true, pending: true, sol });
    }

    if (действие === "close") {
      const р = await собратьРынки();
      const рынок = р.поНомеру.get(Number(тело.asset));
      if (!рынок) return res.status(400).json({ error: "no_market" });
      const с = await состояние(w.address, рынок.dex);
      const п = ((с && с.assetPositions) || []).map((x) => x.position).find((x) => x && x.coin === рынок.coin);
      const szi = п ? Number(п.szi) : 0;
      if (!szi) return res.status(400).json({ error: "no_position" });
      const ответ = await заявкаПозиции(w, рынок, szi < 0, Math.abs(szi), true);
      торговый.тейкСтопБоевой(user.id, { coin: рынок.coin });
      /* Последняя позиция закрыта — деньги возвращаются на карту, чтобы
         весь баланс жил в одном месте. Без ожидания ответа: мост — минуты.
         Под тем же замком, что и остальные денежные шаги. */
      setTimeout(async () => {
        let свой = null;
        try { свой = занять(`hl:${user.id}`, 90_000); } catch { return; }
        try { await вернутьНаКарту(w, user); } catch (e) { console.warn("[hyperliquid] возврат на карту", e && e.message); } finally { свой(); }
      }, 1500);
      return res.status(200).json({ ok: true, response: ответ.response });
    }

    if (действие === "tpsl") {
      const р = await собратьРынки();
      const рынок = р.поНомеру.get(Number(тело.asset));
      if (!рынок) return res.status(400).json({ error: "no_market" });
      const с = await состояние(w.address, рынок.dex);
      const п = ((с && с.assetPositions) || []).map((x) => x.position).find((x) => x && x.coin === рынок.coin);
      const szi = п ? Number(п.szi) : 0;
      if (!szi) return res.status(400).json({ error: "no_position" });
      const было = торговый.тейкСтопыБоевые(user.id)[рынок.coin] || {};
      const tp = тело.tp === undefined ? было.tp ?? null : уровеньИз(тело.tp);
      const sl = тело.sl === undefined ? было.sl ?? null : уровеньИз(тело.sl);
      проверитьУровни(Math.sign(szi), рынок.price, Number(п.liquidationPx) || 0, tp, sl);
      торговый.тейкСтопБоевой(user.id, { coin: рынок.coin, сторона: Math.sign(szi), tp, sl });
      return res.status(200).json({ ok: true, tp, sl });
    }

    if (действие === "trades") {
      const coin = req.query && req.query.coin ? String(req.query.coin).slice(0, 40) : null;
      return res.status(200).json({ events: await сделкиБоевые(w, user.id, coin) });
    }

    /* Торговый счёт на основной бирже — это сам счёт Hyperliquid: пополнение
       идёт SOL по мосту Unit (минуты), вывод — обратно на карту. */
    if (действие === "transfer") {
      if (тело.direction === "out") {
        const usd = вниз2(Number(тело.amount) || 0);
        return res.status(200).json({ ok: true, sol: await вывестиНаКарту(w, user, usd) });
      }
      const сумма = Math.floor((Number(тело.amount) || 0) * 1e6) / 1e6;
      if (!(сумма >= МИН_SOL)) return res.status(400).json({ error: "min_sol", min: МИН_SOL });
      if (SOLANA_ТЕСТОВАЯ === БОЕВАЯ) return res.status(400).json({ error: "network_mismatch" });
      const куда = await адресUnit({ откуда: "solana", куда: "hyperliquid", кому: w.address, вид: "solana" });
      const итог = await отправитьНаБиржу({ user_id: user.id, сумма, куда, ключЗапроса: `hl:in:${ключЗапроса(тело)}`, вид: "trading_in" });
      свестиПозже(user, w);
      карты.delete(user.id);
      return res.status(200).json({ ok: true, pending: true, bridge: true, signature: итог.signature, amount: сумма });
    }

    if (действие === "deposit-sol") {
      const сумма = Math.floor((Number(тело.amount) || 0) * 1e6) / 1e6;
      if (!(сумма >= МИН_SOL)) return res.status(400).json({ error: "min_sol", min: МИН_SOL });
      // Тестовая биржа принимает SOL только из тестовой сети Solana, и наоборот.
      if (SOLANA_ТЕСТОВАЯ === БОЕВАЯ) return res.status(400).json({ error: "network_mismatch" });
      const куда = await адресUnit({ откуда: "solana", куда: "hyperliquid", кому: w.address, вид: "solana" });
      const итог = await отправитьНаБиржу({ user_id: user.id, сумма, куда, ключЗапроса: тело.requestKey ? String(тело.requestKey).slice(0, 80) : null });
      return res.status(200).json({ ok: true, signature: итог.signature, amount: сумма });
    }

    if (действие === "settle") {
      return res.status(200).json({ ok: true, ...(await свести(w)) });
    }

    if (действие === "withdraw-sol") {
      const usd = вниз2(Number(тело.usd) || 0);
      return res.status(200).json({ ok: true, sol: await вывестиНаКарту(w, user, usd) });
    }

    if (действие === "deposit") {
      const сумма = Number(тело.amount) || 0;
      // Мост не зачисляет меньше 5 USDC — они просто пропадут.
      if (!(сумма >= 5)) return res.status(400).json({ error: "min_5_usdc" });
      const { JsonRpcProvider, Contract, parseUnits } = await ethersLib();
      const п = new JsonRpcProvider(ARB_RPC, undefined, { staticNetwork: true });
      const к = new Contract(USDC, ["function transfer(address,uint256) returns (bool)"], w.connect(п));
      const tx = await к.transfer(МОСТ, parseUnits(String(сумма), 6));
      return res.status(200).json({ ok: true, tx: tx.hash });
    }

    if (действие === "withdraw") {
      const сумма = Number(тело.amount) || 0;
      if (!(сумма > 1)) return res.status(400).json({ error: "bad_amount" });
      await вывести(w, сумма);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (e) {
    const код = (e && e.код) || 500;
    return res.status(код).json({ error: код === 400 ? String(e.message) : "server", detail: String((e && e.message) || e).slice(0, 200) });
  } finally {
    if (отпустить) отпустить();
  }
}

// Для проверки подписей на тестовой бирже (contracts/…/test-hl.mjs).
export const дляПроверки = { действиеВладельца, отправитьДействие, междуПлощадками, ПОЛЯ, номерДействия, собратьРынки, свечиРынка, спотМета };
