/* Кошелёк приложения в сетях EVM: BNB Chain, Base и Ethereum.
 *
 * Адрес один на все три сети и выводится из той же фразы в двадцать
 * четыре слова, что и кошельки TON и Solana, по стандартному пути
 * m/44'/60'/0'/0/0. Это тот же адрес, который покажет MetaMask или
 * любой другой кошелёк, если ввести в него эту фразу: деньги не заперты
 * в приложении.
 *
 * Защита — та же, что у кошельков TON и Solana:
 *   — сервер подписывает только три вида действий: запуск токена на
 *     своей фабрике, покупку и продажу на ней же. Адрес контракта не
 *     приходит из запроса — он берётся из настроек сети;
 *   — ключ шифруется AES-256-GCM ключом площадки (APP_WALLET_KEY), а
 *     владелец подмешан связанными данными;
 *   — каждое действие пишется в журнал wallet_ops: повтор того же
 *     нажатия не уходит в сеть второй раз, шквал отсекается.
 *
 * Переменные окружения:
 *   APP_WALLET_KEY                         — тот же, что у других кошельков;
 *   EVM_CURVE_BSC, EVM_CURVE_BASE, EVM_CURVE_ETH — адреса фабрик
 *     (contracts/evm/deploy.mjs). Пока адреса нет, запуск в этой сети
 *     выключен, а адрес и баланс всё равно показываются;
 *   EVM_RPC_BSC, EVM_RPC_BASE, EVM_RPC_ETH  — свои узлы (необязательно).
 */

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const ПУТЬ_EVM = "m/44'/60'/0'/0/0";

export const СЕТИ = {
  bsc: {
    chainId: 56, имя: "BNB Chain", монета: "BNB",
    rpc: process.env.EVM_RPC_BSC || "https://bsc-dataseed.bnbchain.org",
    фабрика: (process.env.EVM_CURVE_BSC || "").trim(),
    стейблы: [
      { тикер: "USDT", адрес: "0x55d398326f99059fF775485246999027B3197955", знаков: 18 },
      { тикер: "USDC", адрес: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", знаков: 18 },
    ],
  },
  base: {
    chainId: 8453, имя: "Base", монета: "ETH",
    rpc: process.env.EVM_RPC_BASE || "https://mainnet.base.org",
    фабрика: (process.env.EVM_CURVE_BASE || "").trim(),
    стейблы: [
      { тикер: "USDC", адрес: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", знаков: 6 },
      { тикер: "USDT", адрес: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", знаков: 6 },
    ],
  },
  eth: {
    chainId: 1, имя: "Ethereum", монета: "ETH",
    rpc: process.env.EVM_RPC_ETH || "https://ethereum-rpc.publicnode.com",
    фабрика: (process.env.EVM_CURVE_ETH || "").trim(),
    стейблы: [
      { тикер: "USDT", адрес: "0xdAC17F958D2ee523a2206206994597C13D831ec7", знаков: 6 },
      { тикер: "USDC", адрес: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", знаков: 6 },
    ],
  },
};

// Только то, что сервер вызывает у фабрики и токена.
const ABI_КРИВОЙ = [
  "function create(string n, string s, string u, uint256 minTokensOut) payable returns (address)",
  "function buy(address token, uint256 minTokensOut) payable",
  "function sell(address token, uint256 tokensIn, uint256 minNativeOut)",
  "function quoteBuy(address token, uint256 amountIn) view returns (uint256 tokensOut, uint256 spent)",
  "function quoteSell(address token, uint256 tokensIn) view returns (uint256)",
  "function curves(address) view returns (address creator, uint128 realNative, uint128 sold, bool graduated)",
  "function virtualNative() view returns (uint256)",
  "function launchFee() view returns (uint256)",
  "event Created(address indexed token, address indexed creator, string name, string symbol, string uri)",
];
const ABI_ТОКЕНА = ["function balanceOf(address) view returns (uint256)"];
const ВИРТ_ТОКЕНОВ = 1_073_000_000n * 10n ** 18n;
const ПРОДАЁТСЯ = 800_000_000n * 10n ** 18n;

let эфир = null;
async function ethersLib() {
  if (!эфир) эфир = await import("ethers");
  return эфир;
}

const провайдеры = new Map();
async function провайдер(сеть) {
  if (!провайдеры.has(сеть)) {
    const { JsonRpcProvider, Network } = await ethersLib();
    const с = СЕТИ[сеть];
    провайдеры.set(сеть, new JsonRpcProvider(с.rpc, Network.from(с.chainId), { staticNetwork: true }));
  }
  return провайдеры.get(сеть);
}

// Для проверки на локальной сети (contracts/evm/test-server.mjs): база
// в памяти вместо Supabase. В работе не задаётся.
let тестоваяБаза = null;
export function заменитьБазуДляПроверки(db) { тестоваяБаза = db; }

function admin() {
  if (тестоваяБаза) return тестоваяБаза;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function разобратьКлюч(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const b = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, "hex") : Buffer.from(s, "base64");
    return b.length === 32 ? b : null;
  } catch { return null; }
}

const меткаКлюча = (к) => crypto.createHash("sha256").update(к).digest("hex").slice(0, 8);
function ключи() {
  const текущий = разобратьКлюч(process.env.APP_WALLET_KEY);
  if (!текущий) return null;
  const прежний = разобратьКлюч(process.env.APP_WALLET_KEY_OLD);
  const набор = new Map([[меткаКлюча(текущий), текущий]]);
  if (прежний) набор.set(меткаКлюча(прежний), прежний);
  return { текущий, метка: меткаКлюча(текущий), набор };
}

function зашифровать(данные, ключ, владелец) {
  const соль = crypto.randomBytes(12);
  const шифр = crypto.createCipheriv("aes-256-gcm", ключ, соль);
  шифр.setAAD(Buffer.from(String(владелец)));
  const тело = Buffer.concat([шифр.update(данные), шифр.final()]);
  return Buffer.concat([соль, шифр.getAuthTag(), тело]).toString("base64");
}

function расшифровать(строка, набор, владелец) {
  const b = Buffer.from(String(строка.secret_enc), "base64");
  const порядок = строка.key_id && набор.набор.has(строка.key_id) ? [набор.набор.get(строка.key_id)] : [...набор.набор.values()];
  for (const ключ of порядок) {
    try {
      const шифр = crypto.createDecipheriv("aes-256-gcm", ключ, b.subarray(0, 12));
      шифр.setAuthTag(b.subarray(12, 28));
      шифр.setAAD(Buffer.from(String(владелец)));
      return Buffer.concat([шифр.update(b.subarray(28)), шифр.final()]).toString("utf8");
    } catch { /* следующий ключ */ }
  }
  throw new Error("ключ кошелька не читается");
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7).trim() : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

const ПОЛЯ = "user_id, chain, address, secret_enc, key_id";

/* Строка кошелька: одна на все три сети, chain = "evm". Ключ выводится
   из общей фразы один раз и дальше хранится зашифрованным — как у TON. */
async function кошелёк(db, user, набор) {
  const { data } = await db.from("app_wallets").select(ПОЛЯ).eq("user_id", user.id).eq("chain", "evm").maybeSingle();
  if (data) return data;
  const { HDNodeWallet } = await ethersLib();
  const { фразаПользователя } = await import("./_seed.js");
  const фраза = await фразаПользователя(db, user, набор);
  const к = HDNodeWallet.fromPhrase(фраза, undefined, ПУТЬ_EVM);
  const строка = {
    user_id: user.id,
    chain: "evm",
    address: к.address,
    secret_enc: зашифровать(Buffer.from(`hex:${к.privateKey.slice(2)}`), набор.текущий, user.id),
    key_id: набор.метка,
  };
  const { error } = await db.from("app_wallets").insert(строка);
  if (error) {
    const { data: снова } = await db.from("app_wallets").select(ПОЛЯ).eq("user_id", user.id).eq("chain", "evm").maybeSingle();
    if (снова) return снова;
    throw new Error(error.message);
  }
  return строка;
}

async function подписант(строка, набор, user, сеть) {
  const { Wallet } = await ethersLib();
  const тайна = расшифровать(строка, набор, user.id);
  if (!тайна.startsWith("hex:")) throw new Error("ключ кошелька не того вида");
  const w = new Wallet("0x" + тайна.slice(4), await провайдер(сеть));
  // Адрес из ключа обязан совпасть с записанным: иначе строку подменили.
  if (w.address.toLowerCase() !== String(строка.address).toLowerCase()) throw new Error("ключ не от этого адреса");
  return w;
}

/* Остатки по всем трём сетям разом. Сеть, которая не ответила, — null,
   а не ноль: ноль при деньгах на кошельке хуже честного «не знаем». */
async function остатки(адрес) {
  const { Contract, formatUnits } = await ethersLib();
  const итог = {};
  await Promise.all(Object.entries(СЕТИ).map(async ([ключ, с]) => {
    try {
      const п = await провайдер(ключ);
      const [родная, ...стейблы] = await Promise.all([
        п.getBalance(адрес),
        ...с.стейблы.map((т) => new Contract(т.адрес, ABI_ТОКЕНА, п).balanceOf(адрес).catch(() => null)),
      ]);
      итог[ключ] = {
        native: Number(formatUnits(родная, 18)),
        coin: с.монета,
        tokens: Object.fromEntries(с.стейблы.map((т, i) => [т.тикер, стейблы[i] == null ? null : Number(formatUnits(стейблы[i], т.знаков))])),
      };
    } catch {
      итог[ключ] = { native: null, coin: с.монета, tokens: {} };
    }
  }));
  return итог;
}

const ОПЕРАЦИЙ_В_МИНУТУ = 6;
async function начать(db, user, { дело, сеть, сумма = 0, ключЗапроса = null, ip = null }) {
  const минуту = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("wallet_ops").select("id", { count: "exact", head: true }).eq("user_id", user.id).gt("created_at", минуту);
  if ((count || 0) >= ОПЕРАЦИЙ_В_МИНУТУ) throw Object.assign(new Error("слишком часто"), { код: 429 });
  const { data, error } = await db.from("wallet_ops")
    .insert({ user_id: user.id, chain: сеть, kind: дело, amount: сумма, request_key: ключЗапроса, ip })
    .select("id").single();
  if (error) {
    if (ключЗапроса) {
      const { data: прошлая } = await db.from("wallet_ops").select("id, signature").eq("user_id", user.id).eq("request_key", ключЗапроса).maybeSingle();
      if (прошлая) return { повтор: true, id: прошлая.id, signature: прошлая.signature };
    }
    throw new Error(error.message);
  }
  return { повтор: false, id: data.id };
}
async function завершить(db, id, signature) {
  if (id) await db.from("wallet_ops").update({ signature: signature || null }).eq("id", id);
}

/* Состояние кривой в виде, который понимает приложение: собрано, продано,
   цена одного токена в монете сети и доля пути до биржи. */
export async function состояниеКривой(сеть, токен) {
  const с = СЕТИ[сеть];
  if (!с || !с.фабрика) return null;
  const { Contract, formatUnits } = await ethersLib();
  const к = new Contract(с.фабрика, ABI_КРИВОЙ, await провайдер(сеть));
  const [c, вирт] = await Promise.all([к.curves(токен), к.virtualNative()]);
  if (c.creator === "0x0000000000000000000000000000000000000000") return null;
  const x = вирт + c.realNative;
  const y = ВИРТ_ТОКЕНОВ - c.sold;
  const цена = Number(formatUnits((x * 10n ** 18n) / y, 18));
  return {
    creator: c.creator,
    realNative: Number(formatUnits(c.realNative, 18)),
    sold: Number(formatUnits(c.sold, 18)),
    graduated: c.graduated,
    price: цена,
    progress: Number((c.sold * 10000n) / ПРОДАЁТСЯ) / 10000,
    // Сколько будет собрано к выходу на биржу: вирт·(1073/273 − 1).
    graduationNative: Number(formatUnits((вирт * ВИРТ_ТОКЕНОВ) / (ВИРТ_ТОКЕНОВ - ПРОДАЁТСЯ) - вирт, 18)),
    coin: с.монета,
  };
}

function сетьИз(значение) {
  const с = String(значение || "").trim();
  return Object.prototype.hasOwnProperty.call(СЕТИ, с) ? с : null;
}
const адресОк = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || ""));

export default async function handler(req, res) {
  const действие = String((req.query && req.query.action) || "");
  const набор = ключи();
  const db = admin();

  // Что включено: адрес кошелька есть всегда, когда есть ключ площадки,
  // а запуск — только в сетях, где развёрнута фабрика.
  if (действие === "enabled") {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(200).json({
      enabled: !!(db && набор),
      chains: Object.fromEntries(Object.entries(СЕТИ).map(([к, с]) => [к, { launch: !!с.фабрика, coin: с.монета, name: с.имя }])),
    });
  }

  // Состояние кривой и котировки — открытые: их видит любой, кто смотрит
  // на токен, и ключ для них не нужен.
  if (действие === "curve" || действие === "quote") {
    const сеть = сетьИз(req.query.chain);
    const токен = String(req.query.token || "");
    if (!сеть || !адресОк(токен)) return res.status(400).json({ error: "bad_request" });
    try {
      if (действие === "curve") {
        res.setHeader("Cache-Control", "public, max-age=3");
        const st = await состояниеКривой(сеть, токен);
        return st ? res.status(200).json(st) : res.status(404).json({ error: "unknown" });
      }
      const с = СЕТИ[сеть];
      if (!с.фабрика) return res.status(404).json({ error: "no_factory" });
      const { Contract, parseUnits, formatUnits } = await ethersLib();
      const к = new Contract(с.фабрика, ABI_КРИВОЙ, await провайдер(сеть));
      const сумма = String(req.query.amount || "0");
      if (String(req.query.side) === "sell") {
        // «Всё» приходит дробным числом и при округлении может выйти на
        // пылинку больше проданного — контракт такое отвергает.
        let tokensIn = parseUnits(Number(сумма).toFixed(18), 18);
        const c = await к.curves(токен);
        if (tokensIn > c.sold) tokensIn = c.sold;
        const out = await к.quoteSell(токен, tokensIn);
        return res.status(200).json({ out: Number(formatUnits(out, 18)) });
      }
      const [tokens, spent] = await к.quoteBuy(токен, parseUnits(сумма, 18));
      return res.status(200).json({ out: Number(formatUnits(tokens, 18)), spent: Number(formatUnits(spent, 18)) });
    } catch (e) {
      return res.status(502).json({ error: "rpc", detail: String((e && e.shortMessage) || (e && e.message) || e).slice(0, 160) });
    }
  }

  if (!db || !набор) return res.status(503).json({ error: "not_configured" });

  try {
    const user = await хозяин(req, db);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    const строка = await кошелёк(db, user, набор);

    if (действие === "state") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ address: строка.address, chains: await остатки(строка.address) });
    }

    if (действие === "token-balance") {
      const сеть = сетьИз(req.query.chain);
      const токен = String(req.query.token || "");
      if (!сеть || !адресОк(токен)) return res.status(400).json({ error: "bad_request" });
      const { Contract, formatUnits } = await ethersLib();
      const b = await new Contract(токен, ABI_ТОКЕНА, await провайдер(сеть)).balanceOf(строка.address);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ token: Number(formatUnits(b, 18)), raw: b.toString() });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const сеть = сетьИз(тело.chain);
    if (!сеть) return res.status(400).json({ error: "bad_chain" });
    const с = СЕТИ[сеть];
    if (!с.фабрика) return res.status(400).json({ error: "launch_disabled" });
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
    const ключЗапроса = String(тело.requestKey || "").slice(0, 64) || null;
    const { Contract, parseUnits, formatUnits } = await ethersLib();
    // Проскальзывание: от 0,5% до 20%, по умолчанию 5% — мемкоин на
    // кривой двигается быстро.
    const проск = BigInt(Math.max(50, Math.min(2000, Number(тело.slippageBps) || 500)));

    if (действие === "launch") {
      const имя = String(тело.name || "").trim().slice(0, 64);
      const тикер = String(тело.ticker || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
      const метаданные = String(тело.metadataUrl || "");
      const своё = `${SUPABASE_URL}/storage/v1/object/public/token-assets/${user.id}/`;
      if (!имя || !тикер) return res.status(400).json({ error: "bad_request" });
      if (метаданные && (!метаданные.startsWith(своё) || метаданные.length > 300)) return res.status(400).json({ error: "bad_metadata" });
      const покупка = Math.max(0, Number(тело.buyAmount) || 0);
      if (покупка > 1000) return res.status(400).json({ error: "bad_request" });

      const оп = await начать(db, user, { дело: "launch", сеть, сумма: покупка, ключЗапроса, ip });
      if (оп.повтор) return res.status(200).json({ ok: true, repeat: true, tx: оп.signature });

      const w = await подписант(строка, набор, user, сеть);
      const к = new Contract(с.фабрика, ABI_КРИВОЙ, w);
      const плата = await к.launchFee();
      const value = плата + parseUnits(покупка.toFixed(18), 18);
      const tx = await к.create(имя, тикер, метаданные, 0, { value });
      const r = await tx.wait(1, 120_000);
      if (!r || r.status !== 1) throw new Error("запуск не прошёл");
      let токен = null;
      for (const l of r.logs) {
        try {
          const e = к.interface.parseLog(l);
          if (e && e.name === "Created") { токен = e.args.token; break; }
        } catch { /* чужой лог */ }
      }
      await завершить(db, оп.id, tx.hash);
      let куплено = 0;
      if (токен && покупка > 0) {
        const b = await new Contract(токен, ABI_ТОКЕНА, await провайдер(сеть)).balanceOf(строка.address);
        куплено = Number(formatUnits(b, 18));
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, token: токен, factory: с.фабрика, tx: tx.hash, wallet: строка.address, bought: куплено });
    }

    if (действие === "buy" || действие === "sell") {
      const токен = String(тело.token || "");
      const сумма = Number(тело.amount) || 0;
      if (!адресОк(токен) || !(сумма > 0)) return res.status(400).json({ error: "bad_request" });
      const оп = await начать(db, user, { дело: действие, сеть, сумма, ключЗапроса, ip });
      if (оп.повтор) return res.status(200).json({ ok: true, repeat: true, tx: оп.signature });
      const w = await подписант(строка, набор, user, сеть);
      const к = new Contract(с.фабрика, ABI_КРИВОЙ, w);
      let tx;
      if (действие === "buy") {
        const value = parseUnits(сумма.toFixed(18), 18);
        const [ожидаем] = await к.quoteBuy(токен, value);
        tx = await к.buy(токен, (ожидаем * (10000n - проск)) / 10000n, { value });
      } else {
        // Продают в токенах; «всё» приходит точной строкой raw, чтобы
        // округление не оставило пылинку на кошельке.
        const tokensIn = тело.raw && /^\d+$/.test(String(тело.raw)) ? BigInt(тело.raw) : parseUnits(сумма.toFixed(18), 18);
        const ожидаем = await к.quoteSell(токен, tokensIn);
        tx = await к.sell(токен, tokensIn, (ожидаем * (10000n - проск)) / 10000n);
      }
      const r = await tx.wait(1, 120_000);
      if (!r || r.status !== 1) throw new Error("сделка не прошла");
      await завершить(db, оп.id, tx.hash);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, tx: tx.hash });
    }

    return res.status(400).json({ error: "bad_action" });
  } catch (e) {
    const код = e && e.код ? e.код : 500;
    const текст = String((e && e.shortMessage) || (e && e.message) || e);
    // Нехватка монеты на газ — частая и понятная причина: говорим прямо.
    if (/insufficient funds/i.test(текст)) return res.status(400).json({ error: "not_enough" });
    return res.status(код).json({ error: код === 429 ? "rate_limited" : "failed", detail: текст.slice(0, 200) });
  }
}
