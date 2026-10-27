/* Биржа в приложении: фьючерсы на крипту, золото, серебро и индексы на
 * Hyperliquid (план — в документе «Mintly: торговля фьючерсами, золотом и
 * индексами»). Своей биржи нет: заявки уходят на Hyperliquid, а счёт там —
 * тот же EVM-кошелёк человека, что и в приложении. Новых ключей и адресов
 * не появляется, старые кошельки не трогаются.
 *
 *   GET  ?action=markets              — рынки: крипта, металлы, индексы, акции
 *   GET  ?action=candles&coin&interval — свечи для графика
 *   GET  ?action=account              — счёт: деньги на бирже, позиции, USDC в Arbitrum
 *   POST ?action=order   {asset, isBuy, usd, leverage} — сделка по рынку
 *   POST ?action=close   {asset}       — закрыть позицию целиком
 *   POST ?action=deposit-sol {amount}  — SOL из кошелька приложения на биржу (мост Unit)
 *   POST ?action=settle                — пришедший SOL продать в USDC и положить на счёт фьючерсов
 *   POST ?action=withdraw-sol {usd}    — с биржи обратно SOL в кошелёк приложения
 *   POST ?action=deposit {amount}      — USDC из Arbitrum на биржу (старый путь)
 *   POST ?action=withdraw {amount}     — с биржи обратно на свой адрес в Arbitrum
 *
 * Сеть — как у EVM-кошелька приложения: тестовая, пока EVM_MAINNET не 1
 * (или HYPERLIQUID_MAINNET=1 отдельно). */
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { encode } from "@msgpack/msgpack";
import { ТЕСТОВЫЕ, подписьEVMЧеловека } from "./wallet-evm.js";
import { отправитьНаБиржу, кошелёкДляБота, SOLANA_ТЕСТОВАЯ } from "./wallet-solana.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const БОЕВАЯ = process.env.HYPERLIQUID_MAINNET === "1" || (!ТЕСТОВЫЕ && process.env.HYPERLIQUID_MAINNET !== "0");
const API = БОЕВАЯ ? "https://api.hyperliquid.xyz" : "https://api.hyperliquid-testnet.xyz";
// Мост Hyperliquid и USDC в Arbitrum: депозит — обычный перевод USDC на мост.
const ARB_RPC = process.env.ARBITRUM_RPC || (БОЕВАЯ ? "https://arb1.arbitrum.io/rpc" : "https://sepolia-rollup.arbitrum.io/rpc");
const МОСТ = БОЕВАЯ ? "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" : "0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89";
const USDC = БОЕВАЯ ? "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" : "0x1baAbB04529D43a73232B713C0FE471f7c7334d5";
const НОЛЬ = "0x0000000000000000000000000000000000000000";
const ПРОСКАЛЬЗЫВАНИЕ = 0.05;

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

async function инфо(тело) {
  const r = await fetch(`${API}/info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(тело), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`hyperliquid info ${r.status}`);
  return r.json();
}

/* Раздел рынка по имени: у HIP-3 рынков имя с приставкой площадки
   («xyz:GOLD»), у основной биржи — просто тикер. */
function раздел(имя, свой) {
  const и = String(имя).toUpperCase().replace(/^[A-Z0-9]+:/, "");
  /* На основной бирже всё — крипта, кроме токенов золота: «SPX» там —
     мемкоин SPX6900, а не индекс. Металлы, индексы и акции — только у
     площадок HIP-3. */
  if (свой) return /^(PAXG|XAUT)$/.test(и) ? "metals" : "crypto";
  if (/^(GOLD|XAU|SILVER|XAG|PLATINUM|XPT|PALLADIUM|COPPER|OIL|WTI|BRENT|NATGAS)/.test(и)) return "metals";
  if (/^(SPX|SP500|US500|NDX|NAS100|NASDAQ|XYZ100|DOW|DJI|US30|DAX|NIKKEI|RUSSELL|VIX|ES|NQ)$/.test(и) || /^(US500|XYZ100)/.test(и)) return "indices";
  return "stocks";
}
// Пробные и мусорные рынки HIP-3 (их полно в тестовой сети) — не показываем.
const МУСОР = /(^|:)(TEST\d*|ABC)$|^(test|scam|angry):/i;

/* Рынки собираются раз в три секунды на всех: основная биржа и до шести
   площадок HIP-3. Номер актива для заявки у HIP-3 — 100000 + 10000 ×
   номер площадки + номер в её списке. */
let рынки = { at: 0, список: [], поНомеру: new Map() };
let идёт = null;
async function собратьРынки() {
  if (Date.now() - рынки.at < 3000) return рынки;
  if (идёт) return идёт;
  идёт = (async () => {
    const площадки = await инфо({ type: "perpDexs" }).catch(() => [null]);
    const номера = [0, ...(Array.isArray(площадки) ? площадки.map((п, i) => (п ? i : null)).filter((i) => i) : [])].slice(0, 7);
    const ответы = await Promise.all(номера.map((i) => инфо(i ? { type: "metaAndAssetCtxs", dex: площадки[i].name } : { type: "metaAndAssetCtxs" }).catch(() => null)));
    const список = [];
    const поНомеру = new Map();
    ответы.forEach((о, к) => {
      if (!Array.isArray(о) || !о[0] || !Array.isArray(о[0].universe)) return;
      const i = номера[к];
      о[0].universe.forEach((р, n) => {
        const ц = (о[1] || [])[n] || {};
        if (р.isDelisted || (i && МУСОР.test(р.name))) return;
        const цена = Number(ц.markPx || ц.midPx) || 0;
        const вчера = Number(ц.prevDayPx) || 0;
        const рынок = {
          asset: i ? 100000 + i * 10000 + n : n,
          coin: р.name,
          name: String(р.name).replace(/^[a-z0-9]+:/i, ""),
          dex: i ? площадки[i].name : "",
          section: раздел(р.name, !i),
          price: цена,
          change: вчера > 0 ? ((цена - вчера) / вчера) * 100 : 0,
          volume: Number(ц.dayNtlVlm) || 0,
          maxLeverage: Number(р.maxLeverage) || 1,
          szDecimals: Number(р.szDecimals) || 0,
        };
        if (!(цена > 0)) return;
        список.push(рынок);
        поНомеру.set(рынок.asset, рынок);
      });
    });
    список.sort((a, b) => b.volume - a.volume);
    рынки = { at: Date.now(), список, поНомеру, площадки: номера.map((i) => (i ? площадки[i].name : "")) };
    return рынки;
  })().finally(() => { идёт = null; });
  return идёт;
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
  const nonce = Date.now();
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

/* Вывод с биржи — действие, которое подписывает сам владелец счёта
   (EIP-712 «HyperliquidTransaction:Withdraw»). */
async function вывести(w, сумма) {
  const time = Date.now();
  const signatureChainId = БОЕВАЯ ? "0xa4b1" : "0x66eee";
  const действие = { type: "withdraw3", hyperliquidChain: БОЕВАЯ ? "Mainnet" : "Testnet", signatureChainId, destination: w.address, amount: безХвоста(сумма), time };
  const { Signature } = await ethersLib();
  const подпись = await w.signTypedData(
    { name: "HyperliquidSignTransaction", version: "1", chainId: parseInt(signatureChainId, 16), verifyingContract: НОЛЬ },
    { "HyperliquidTransaction:Withdraw": [
      { name: "hyperliquidChain", type: "string" }, { name: "destination", type: "string" },
      { name: "amount", type: "string" }, { name: "time", type: "uint64" },
    ] },
    { hyperliquidChain: действие.hyperliquidChain, destination: действие.destination, amount: действие.amount, time },
  );
  const { r, s, v } = Signature.from(подпись);
  const ответ = await fetch(`${API}/exchange`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: действие, nonce: time, signature: { r, s, v } }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await ответ.json().catch(() => null);
  if (!j || j.status !== "ok") throw new Error((j && (j.response || j.error)) || "вывод не принят");
  return j;
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

/* Действия, которые подписывает сам владелец счёта (EIP-712
   «HyperliquidTransaction:*»): перевод между спотом и фьючерсами,
   отправка токена. Номер — поле time или nonce самого действия. */
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
async function междуСчетами(w, сумма, наФьючерсы) {
  try {
    return await действиеВладельца(w, "HyperliquidTransaction:UsdClassTransfer", [
      { name: "hyperliquidChain", type: "string" }, { name: "amount", type: "string" },
      { name: "toPerp", type: "bool" }, { name: "nonce", type: "uint64" },
    ], { type: "usdClassTransfer", amount: безХвоста(сумма), toPerp: наФьючерсы, nonce: Date.now() });
  } catch (e) {
    // У «единого» счёта спот и фьючерсы общие — переводить нечего.
    if (/unified|abstraction/i.test(String(e && e.message))) return null;
    throw e;
  }
}

/* USOL на споте биржи: пара USOL/USDC (номер заявки — 10000 + номер
   пары), полное имя токена для отправки и цена. Раз в 10 секунд. */
let спот = { at: 0 };
async function спотSOL() {
  if (Date.now() - спот.at < 10000) return спот;
  const [мета, цены] = await инфо({ type: "spotMetaAndAssetCtxs" });
  const т = мета.tokens.find((x) => x.name === "USOL");
  const пара = т && мета.universe.find((u) => u.tokens[0] === т.index && u.tokens[1] === 0);
  if (!пара) throw new Error("на бирже нет пары SOL");
  // Цены идут не в порядке списка пар — ищем по имени пары («@156»).
  const ц = цены.find((x) => x && x.coin === пара.name) || {};
  спот = { at: Date.now(), asset: 10000 + пара.index, токен: `${т.name}:${т.tokenId}`, szDecimals: т.szDecimals, цена: Number(ц.midPx || ц.markPx) || 0 };
  return спот;
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
  const usdc = Math.floor((б.get("USDC") || 0) * 100) / 100;
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

// Не чаще раза в 700 мс на человека: подписи и заявки не для очереди кликов.
const последний = new Map();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const действие = String((req.query && req.query.action) || "markets");
  try {
    if (действие === "markets") {
      const р = await собратьРынки();
      res.setHeader("Cache-Control", "public, max-age=2");
      return res.status(200).json({ network: БОЕВАЯ ? "mainnet" : "testnet", markets: р.список.slice(0, 300) });
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
      const coin = String(req.query.coin || "").slice(0, 40);
      const interval = ["1m", "5m", "15m", "1h", "4h", "1d"].includes(req.query.interval) ? req.query.interval : "15m";
      if (!coin) return res.status(400).json({ error: "bad_request" });
      const шаг = { "1m": 60e3, "5m": 300e3, "15m": 900e3, "1h": 3600e3, "4h": 14400e3, "1d": 86400e3 }[interval];
      const конец = Date.now();
      const свечи = await инфо({ type: "candleSnapshot", req: { coin, interval, startTime: конец - шаг * 200, endTime: конец } });
      res.setHeader("Cache-Control", "public, max-age=2");
      return res.status(200).json({ candles: (свечи || []).map((с) => ({ t: с.t, o: +с.o, h: +с.h, l: +с.l, c: +с.c, v: +с.v })) });
    }

    const db = admin();
    if (!db) return res.status(503).json({ error: "not_configured" });
    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const w = await подписьEVMЧеловека(db, user);

    if (действие === "account") {
      const р = await собратьРынки();
      const состояния = await Promise.all((р.площадки || [""]).map((dex) => инфо(dex ? { type: "clearinghouseState", user: w.address, dex } : { type: "clearinghouseState", user: w.address }).catch(() => null)));
      const основное = состояния[0] || {};
      const позиции = [];
      состояния.forEach((с) => (с && с.assetPositions || []).forEach((ап) => {
        const п = ап.position || {};
        if (!(Math.abs(Number(п.szi)) > 0)) return;
        const рынок = р.список.find((м) => м.coin === п.coin);
        позиции.push({
          coin: п.coin, asset: рынок ? рынок.asset : null, name: рынок ? рынок.name : п.coin,
          size: Number(п.szi), entry: Number(п.entryPx) || 0, pnl: Number(п.unrealizedPnl) || 0,
          value: Number(п.positionValue) || 0, leverage: (п.leverage && Number(п.leverage.value)) || 1,
          liquidation: Number(п.liquidationPx) || null,
        });
      }));
      const [arb, б, кош, sol] = await Promise.all([
        usdcВArbitrum(w.address).catch(() => ({ usdc: null, eth: null })),
        спотБалансы(w.address).catch(() => new Map()),
        кошелёкДляБота(user.id).catch(() => null),
        спотSOL().catch(() => null),
      ]);
      return res.status(200).json({
        address: w.address, network: БОЕВАЯ ? "mainnet" : "testnet",
        equity: Number(основное.marginSummary && основное.marginSummary.accountValue) || 0,
        withdrawable: Number(основное.withdrawable) || 0,
        positions: позиции, arbitrum: arb,
        // Спот: SOL с моста, ещё не проданный, и доллары вне фьючерсов.
        spot: { sol: б.get("USOL") || 0, usdc: б.get("USDC") || 0 },
        wallet: кош ? { address: кош.address, sol: кош.sol } : null,
        solPrice: sol ? sol.цена : 0, minSol: МИН_SOL,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const сейчас = Date.now();
    if (сейчас - (последний.get(user.id) || 0) < 700) return res.status(429).json({ error: "too_fast" });
    последний.set(user.id, сейчас);

    if (действие === "order" || действие === "close") {
      const р = await собратьРынки();
      const рынок = р.поНомеру.get(Number(тело.asset));
      if (!рынок) return res.status(400).json({ error: "no_market" });
      let isBuy = !!тело.isBuy, размер, reduceOnly = false;
      if (действие === "close") {
        const с = await инфо(рынок.dex ? { type: "clearinghouseState", user: w.address, dex: рынок.dex } : { type: "clearinghouseState", user: w.address });
        const п = ((с && с.assetPositions) || []).map((x) => x.position).find((x) => x && x.coin === рынок.coin);
        const szi = п ? Number(п.szi) : 0;
        if (!szi) return res.status(400).json({ error: "no_position" });
        isBuy = szi < 0; размер = Math.abs(szi); reduceOnly = true;
      } else {
        const usd = Number(тело.usd) || 0;
        const плечо = Math.max(1, Math.min(рынок.maxLeverage, Math.round(Number(тело.leverage) || 1)));
        if (!(usd >= 10)) return res.status(400).json({ error: "min_10_usd" });
        // Плечо задаётся до заявки: биржа помнит его по рынку.
        await отправитьДействие(w, { type: "updateLeverage", asset: рынок.asset, isCross: true, leverage: плечо });
        размер = (usd * плечо) / рынок.price;
      }
      const s = размерБиржи(размер, рынок.szDecimals);
      if (!(Number(s) > 0)) return res.status(400).json({ error: "too_small" });
      // «По рынку» — заявка IOC с запасом цены: исполнится сразу или не исполнится.
      const p = ценаБиржи(рынок.price * (isBuy ? 1 + ПРОСКАЛЬЗЫВАНИЕ : 1 - ПРОСКАЛЬЗЫВАНИЕ), рынок.szDecimals);
      const ответ = await отправитьДействие(w, {
        type: "order",
        orders: [{ a: рынок.asset, b: isBuy, p, s, r: reduceOnly, t: { limit: { tif: "Ioc" } } }],
        grouping: "na",
      });
      return res.status(200).json({ ok: true, response: ответ.response });
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
      const usd = Math.floor((Number(тело.usd) || 0) * 100) / 100;
      const кош = await кошелёкДляБота(user.id);
      if (!кош) return res.status(503).json({ error: "no_wallet" });
      if (SOLANA_ТЕСТОВАЯ === БОЕВАЯ) return res.status(400).json({ error: "network_mismatch" });
      const sol = await спотSOL();
      // Запас 3% — на цену заявки «по рынку»: биржа держит под неё доллары.
      const размер = размерБиржи(usd / (sol.цена * 1.03), sol.szDecimals);
      if (!(Number(размер) >= МИН_SOL + 0.01)) return res.status(400).json({ error: "min_sol", minUsd: Math.ceil((МИН_SOL + 0.01) * sol.цена * 1.03) });
      const куда = await адресUnit({ откуда: "hyperliquid", куда: "solana", кому: кош.address, вид: "ethereum" });
      await междуСчетами(w, usd, false);
      await заявкаСпота(w, sol, true, размер);
      const usol = (await спотБалансы(w.address)).get("USOL") || 0;
      if (!(usol >= МИН_SOL)) throw new Error("SOL не купился, деньги остались на бирже");
      await действиеВладельца(w, "HyperliquidTransaction:SpotSend", [
        { name: "hyperliquidChain", type: "string" }, { name: "destination", type: "string" },
        { name: "token", type: "string" }, { name: "amount", type: "string" }, { name: "time", type: "uint64" },
      ], { type: "spotSend", destination: куда, token: sol.токен, amount: безХвоста(usol), time: Date.now() });
      // Сдача от покупки — обратно на фьючерсы.
      await свести(w).catch(() => {});
      return res.status(200).json({ ok: true, sol: usol });
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
    return res.status(500).json({ error: "server", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
