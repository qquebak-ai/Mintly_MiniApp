/* Скорость сделок EVM (api/wallet-evm.js): «Обычно» против «Молнии»
 * на сети с блоком раз в секунду, быстрые сделки подряд, наценка.
 * Основа та же, что у test-server.mjs: настоящий обработчик, настоящая
 * фабрика в локальной сети ganache и база в памяти вместо Supabase.
 *
 * Запуск: node contracts/evm/test-speed.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ganache from "ganache";
import { ethers } from "ethers";
import { собрать } from "./build.mjs";

// --- локальная сеть с номером BNB Chain -----------------------------
const сервер = ganache.server({ logging: { quiet: true }, chain: { chainId: 56, hardfork: "shanghai" }, miner: { blockTime: 1 }, wallet: { totalAccounts: 3, defaultBalance: 1000 } });
await new Promise((r) => сервер.listen(8553, r));
const rpc = "http://127.0.0.1:8553";
const п = new ethers.JsonRpcProvider(rpc, 56, { staticNetwork: true });
const владелец = await п.getSigner(0);
const к = собрать({ сТестами: true });
const развернуть = async (имя, ...арг) => {
  const c = await new ethers.ContractFactory(к[имя].abi, к[имя].bytecode, владелец).deploy(...арг);
  await c.waitForDeployment();
  return c;
};
const weth = await развернуть("MockWETH");
const биржа = await развернуть("MockDexFactory");
const фабрика = await развернуть("MintlyCurve", await weth.getAddress(), await биржа.getAddress(), ethers.parseEther("6"), await владелец.getAddress(), 100);

process.env.EVM_RPC_BSC = rpc;
process.env.EVM_CHAIN_BSC = "56";
process.env.EVM_CURVE_BSC = await фабрика.getAddress();
process.env.APP_WALLET_KEY = crypto.randomBytes(32).toString("hex");
process.env.SUPABASE_URL = "https://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "x";

// --- база в памяти: ровно те вызовы, что делает обработчик ------------
const таблицы = { app_wallets: [], app_seeds: [], wallet_ops: [], profiles: [] };
const ЧЕЛОВЕК = { id: "u1" };
function запрос(имя) {
  const фильтры = [];
  let вставка = null, правка = null, счёт = false;
  const q = {
    select(_, opts) { if (opts && opts.count) счёт = true; return q; },
    eq(k, v) { фильтры.push((r) => r[k] === v); return q; },
    gt(k, v) { фильтры.push((r) => r[k] > v); return q; },
    insert(row) { вставка = row; return q; },
    update(row) { правка = row; return q; },
    upsert(row) { вставка = row; return q; },
    maybeSingle() { return q.then((r) => ({ data: (r.data || [])[0] || null, error: r.error })); },
    single() { return q.then((r) => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error })); },
    then(ok, fail) {
      const т = таблицы[имя];
      let итог;
      if (вставка) {
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...вставка };
        if (row.request_key && т.some((x) => x.request_key === row.request_key)) итог = { data: null, error: { message: "duplicate" } };
        else { т.push(row); итог = { data: [row], error: null }; }
      } else if (правка) {
        т.filter((r) => фильтры.every((f) => f(r))).forEach((r) => Object.assign(r, правка));
        итог = { data: null, error: null };
      } else {
        const d = т.filter((r) => фильтры.every((f) => f(r)));
        итог = счёт ? { count: d.length, data: null, error: null } : { data: d, error: null };
      }
      return Promise.resolve(итог).then(ok, fail);
    },
  };
  return q;
}
const фальшБаза = { from: запрос, auth: { getUser: async () => ({ data: { user: ЧЕЛОВЕК }, error: null }) } };

const модуль = await import("../../api/wallet-evm.js");
модуль.заменитьБазуДляПроверки(фальшБаза);
const обработчик = модуль.default;

async function вызвать(action, { method = "GET", query = {}, body = null } = {}) {
  let код = 0, ответ = null;
  const res = {
    setHeader() {},
    status(c) { код = c; return res; },
    json(j) { ответ = j; return res; },
  };
  await обработчик({ method, query: { action, ...query }, body, headers: { authorization: "Bearer t" } }, res);
  return { код, ответ };
}


// Деньги на кошелёк приложения.
const { ответ: состояние } = await вызвать("state");
const адрес = состояние.address;
await (await владелец.sendTransaction({ to: адрес, value: ethers.parseEther("50") })).wait();
const r0 = await вызвать("launch", { method: "POST", body: { chain: "bsc", name: "Speed", ticker: "spd", buyAmount: 0.1, requestKey: "L1" } });
assert.equal(r0.код, 200, JSON.stringify(r0.ответ));
const токен = r0.ответ.token;
// Предел частоты — шесть операций в минуту на человека: старые
// операции сдвигаем в прошлое, чтобы мерить скорость, а не предел.
const остыть = () => { for (const о of таблицы.wallet_ops) о.created_at = new Date(Date.now() - 120_000).toISOString(); };

async function купить(скорость, ключ) {
  остыть();
  const t0 = Date.now();
  const r = await вызвать("buy", { method: "POST", body: { chain: "bsc", token: токен, amount: 0.05, speed: скорость, requestKey: ключ } });
  assert.equal(r.код, 200, JSON.stringify(r.ответ));
  return Date.now() - t0;
}
const мерить = async (скорость, n) => { const т = []; for (let i = 0; i < n; i++) т.push(await купить(скорость, `${скорость}-${i}`)); return т; };
const обычно = await мерить("normal", 4);
const молния = await мерить("turbo", 4);
const ср = (а) => Math.round(а.reduce((x, y) => x + y, 0) / а.length);
console.log("обычно, мс:", обычно.join(" "), "среднее", ср(обычно));
console.log("молния, мс:", молния.join(" "), "среднее", ср(молния));
assert.ok(ср(молния) + 300 < ср(обычно), "«Молния» заметно быстрее «Обычно»");

// Быстрые нажатия: три покупки разом — у каждой свой номер, все проходят.
остыть();
const разом = await Promise.all(["a", "b", "c"].map((к) => вызвать("buy", { method: "POST", body: { chain: "bsc", token: токен, amount: 0.02, speed: "turbo", requestKey: `r-${к}` } })));
for (const r of разом) assert.equal(r.код, 200, JSON.stringify(r.ответ));
console.log("три покупки разом — прошли все");

// Наценка: «Молния» — 0.0002 BNB получателю комиссии фабрики сверх 1% сделки.
await new Promise((r) => setTimeout(r, 2500));
остыть();
const получатель = await фабрика.feeRecipient();
const было = await п.getBalance(получатель);
await купить("turbo", "fee-1");
await new Promise((r) => setTimeout(r, 2500));
const стало = await п.getBalance(получатель);
const разница = Number(ethers.formatEther(стало - было));
console.log("получателю комиссии пришло:", разница);
assert.ok(Math.abs(разница - (0.05 * 0.01 + 0.0002)) < 1e-9, `комиссия 1% + наценка, а пришло ${разница}`);
console.log("ok скорость EVM");
await сервер.close();
process.exit(0);
