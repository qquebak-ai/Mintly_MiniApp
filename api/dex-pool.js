/* Пул биржи токена площадки — резервы и цена после выхода с кривой.
 *
 * Один ответ на все сети, чтобы приложение одинаково решало «рынок
 * открыт» и считало оценку сделки: TON — пул STON.fi, Solana — Raydium
 * CPMM, EVM — пара Uniswap V2 / PancakeSwap V2, заведённая фабрикой.
 *
 * Запрос: GET /api/dex-pool?chain=ton|solana|bsc|base|eth&token=<адрес>[&pool=<адрес пула>]
 * Ответ: { ready, native, tokens, fee, price, pool } — резервы в целых
 * монетах и токенах, ставка пула в долях единицы, цена токена в монете.
 */
const ПАМЯТЬ_МС = 4000;
const кеш = new Map();

async function пулTon(token) {
  const { резервыПула } = await import("./_stonfi.js");
  const р = await резервыПула(token);
  return { native: Number(р.ton) / 1e9, tokens: Number(р.жетон) / 1e9, fee: Number(р.ставка) / 10_000, pool: р.пул.toString() };
}

async function пулSolana(pool) {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const { NATIVE_MINT } = await import("@solana/spl-token");
  const { прочитатьПул } = await import("./_raydium.js");
  const c = new Connection(process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");
  const п = await прочитатьПул(c, new PublicKey(pool));
  if (!п) return null;
  const solПервый = п.m0.equals(NATIVE_MINT);
  return {
    native: Number(solПервый ? п.резерв0 : п.резерв1) / 1e9,
    tokens: Number(solПервый ? п.резерв1 : п.резерв0) / 1e6,
    fee: 0.0025, pool,
  };
}

async function пулEvm(сеть, token) {
  const { СЕТИ } = await import("./wallet-evm.js");
  const с = СЕТИ[сеть];
  if (!с || !с.роутер) return null;
  const { Contract, JsonRpcProvider, formatUnits } = await import("ethers");
  const п = new JsonRpcProvider(с.rpc, с.chainId, { staticNetwork: true });
  const роутер = new Contract(с.роутер, ["function factory() view returns (address)", "function WETH() view returns (address)"], п);
  const [фабрика, weth] = await Promise.all([роутер.factory(), роутер.WETH()]);
  const пара = await new Contract(фабрика, ["function getPair(address, address) view returns (address)"], п).getPair(token, weth);
  if (!пара || /^0x0+$/.test(пара)) return null;
  const к = new Contract(пара, ["function getReserves() view returns (uint112, uint112, uint32)", "function token0() view returns (address)"], п);
  const [[r0, r1], t0] = await Promise.all([к.getReserves(), к.token0()]);
  const токенПервый = t0.toLowerCase() === token.toLowerCase();
  return {
    native: Number(formatUnits(токенПервый ? r1 : r0, 18)),
    tokens: Number(formatUnits(токенПервый ? r0 : r1, 18)),
    fee: сеть === "bsc" ? 0.0025 : 0.003, pool: пара,
  };
}

export default async function handler(req, res) {
  const сеть = String((req.query && req.query.chain) || "").toLowerCase();
  const token = String((req.query && req.query.token) || "").trim();
  const pool = String((req.query && req.query.pool) || "").trim();
  if (!token || token.length > 90) return res.status(400).json({ error: "bad_request" });
  const ключ = `${сеть}:${token}:${pool}`;
  const было = кеш.get(ключ);
  if (было && было.до > Date.now()) return res.status(200).json(было.тело);
  try {
    const р = сеть === "ton" ? await пулTon(token)
      : сеть === "solana" ? (pool ? await пулSolana(pool) : null)
        : ["bsc", "base", "eth"].includes(сеть) ? await пулEvm(сеть, token) : null;
    const тело = р && р.native > 0 && р.tokens > 0
      ? { ready: true, ...р, price: р.native / р.tokens }
      : { ready: false };
    кеш.set(ключ, { до: Date.now() + ПАМЯТЬ_МС, тело });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(тело);
  } catch (e) {
    return res.status(200).json({ ready: false, error: String((e && e.message) || e).slice(0, 120) });
  }
}
