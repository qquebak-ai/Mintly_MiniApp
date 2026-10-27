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
 *   POST ?action=deposit {amount}      — USDC из Arbitrum на биржу
 *   POST ?action=withdraw {amount}     — с биржи обратно на свой адрес в Arbitrum
 *
 * Сеть — как у EVM-кошелька приложения: тестовая, пока EVM_MAINNET не 1
 * (или HYPERLIQUID_MAINNET=1 отдельно). */
import { createClient } from "@supabase/supabase-js";
import { encode } from "@msgpack/msgpack";
import { ТЕСТОВЫЕ, подписьEVMЧеловека } from "./wallet-evm.js";

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
      const arb = await usdcВArbitrum(w.address).catch(() => ({ usdc: null, eth: null }));
      return res.status(200).json({
        address: w.address, network: БОЕВАЯ ? "mainnet" : "testnet",
        equity: Number(основное.marginSummary && основное.marginSummary.accountValue) || 0,
        withdrawable: Number(основное.withdrawable) || 0,
        positions: позиции, arbitrum: arb,
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
