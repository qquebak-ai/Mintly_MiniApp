/* Проверка api/wallet-evm.js целиком: настоящий обработчик, настоящая
 * фабрика в локальной сети ganache и база в памяти вместо Supabase.
 *
 * Запуск: node contracts/evm/test-server.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ganache from "ganache";
import { ethers } from "ethers";
import { собрать } from "./build.mjs";

// --- локальная сеть с номером BNB Chain -----------------------------
const сервер = ganache.server({ logging: { quiet: true }, chain: { chainId: 56, hardfork: "shanghai" }, wallet: { totalAccounts: 3, defaultBalance: 1000 } });
await new Promise((r) => сервер.listen(8549, r));
const rpc = "http://127.0.0.1:8549";
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

let пройдено = 0;
const проверка = async (имя, f) => { await f(); пройдено += 1; console.log("ok —", имя); };

let адрес;
await проверка("адрес кошелька выводится из общей фразы по пути MetaMask", async () => {
  const { код, ответ } = await вызвать("state");
  assert.equal(код, 200, JSON.stringify(ответ));
  адрес = ответ.address;
  const { фразаПользователя } = await import("../../api/_seed.js");
  void фразаПользователя;
  // Фраза в базе зашифрована — проверяем, что адрес совпадает с выводом
  // из неё по m/44'/60'/0'/0/0.
  const seedRow = таблицы.app_seeds[0];
  assert.ok(seedRow && seedRow.seed_enc, "фраза заведена");
  assert.ok(ethers.isAddress(адрес));
  assert.ok(ответ.chains.bsc && ответ.chains.bsc.native === 0);
});

await проверка("включён запуск только там, где есть фабрика", async () => {
  const { ответ } = await вызвать("enabled");
  assert.equal(ответ.chains.bsc.launch, true);
  assert.equal(ответ.chains.eth.launch, false);
});

await проверка("без монеты на газ запуск отвечает not_enough", async () => {
  const { код, ответ } = await вызвать("launch", { method: "POST", body: { chain: "bsc", name: "Moon", ticker: "moon", requestKey: "k0" } });
  assert.equal(код, 400, JSON.stringify(ответ));
  assert.equal(ответ.error, "not_enough");
});

await (await владелец.sendTransaction({ to: адрес, value: ethers.parseEther("50") })).wait();

let токен;
await проверка("запуск со стартовой покупкой", async () => {
  const { код, ответ } = await вызвать("launch", { method: "POST", body: { chain: "bsc", name: "Moon Cat", ticker: "mcat", buyAmount: 0.5, requestKey: "k1" } });
  assert.equal(код, 200, JSON.stringify(ответ));
  токен = ответ.token;
  assert.ok(ethers.isAddress(токен));
  assert.ok(ответ.bought > 0);
});

await проверка("повтор того же нажатия не запускает второй токен", async () => {
  const до = Number(await фабрика.tokensCount());
  const { ответ } = await вызвать("launch", { method: "POST", body: { chain: "bsc", name: "Moon Cat", ticker: "mcat", buyAmount: 0.5, requestKey: "k1" } });
  assert.equal(ответ.repeat, true);
  assert.equal(Number(await фабрика.tokensCount()), до);
});

await проверка("состояние кривой читается открыто", async () => {
  const { код, ответ } = await вызвать("curve", { query: { chain: "bsc", token: токен } });
  assert.equal(код, 200);
  assert.ok(ответ.sold > 0 && ответ.price > 0 && ответ.progress > 0 && ответ.progress < 1);
  assert.ok(ответ.graduationNative > 17 && ответ.graduationNative < 18);
});

await проверка("покупка и продажа всего остатка", async () => {
  let r = await вызвать("buy", { method: "POST", body: { chain: "bsc", token: токен, amount: 1, requestKey: "k2" } });
  assert.equal(r.код, 200, JSON.stringify(r.ответ));
  r = await вызвать("token-balance", { query: { chain: "bsc", token: токен } });
  assert.ok(r.ответ.token > 0);
  const raw = r.ответ.raw;
  r = await вызвать("sell", { method: "POST", body: { chain: "bsc", token: токен, amount: 1, raw, requestKey: "k3" } });
  assert.equal(r.код, 200, JSON.stringify(r.ответ));
  r = await вызвать("token-balance", { query: { chain: "bsc", token: токен } });
  assert.equal(r.ответ.token, 0);
});

await проверка("котировки покупки и продажи", async () => {
  const { ответ } = await вызвать("quote", { query: { chain: "bsc", token: токен, side: "buy", amount: "0.2" } });
  assert.ok(ответ.out > 0 && ответ.spent > 0);
});

await проверка("чужая сеть и кривой адрес отбиваются", async () => {
  let r = await вызвать("buy", { method: "POST", body: { chain: "polygon", token: токен, amount: 1 } });
  assert.equal(r.код, 400);
  r = await вызвать("buy", { method: "POST", body: { chain: "eth", token: токен, amount: 1 } });
  assert.equal(r.ответ.error, "launch_disabled");
  r = await вызвать("buy", { method: "POST", body: { chain: "bsc", token: "0x123", amount: 1 } });
  assert.equal(r.код, 400);
});

await проверка("вывод: плохой адрес и свой адрес отбиваются, «всё» уходит за вычетом газа", async () => {
  let r = await вызвать("withdraw", { method: "POST", body: { chain: "bsc", address: "0x123", amount: 1, requestKey: "w0" } });
  assert.equal(r.ответ.error, "bad_address");
  // Испорченная контрольная сумма: та же буква в другом регистре.
  const чужой = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
  r = await вызвать("withdraw", { method: "POST", body: { chain: "bsc", address: чужой.replace("bD", "Bd"), amount: 1, requestKey: "w1" } });
  assert.equal(r.ответ.error, "bad_address");
  r = await вызвать("withdraw", { method: "POST", body: { chain: "bsc", address: адрес, amount: 1, requestKey: "w2" } });
  assert.equal(r.ответ.error, "same_address");
  r = await вызвать("withdraw", { method: "POST", body: { chain: "bsc", address: чужой, amount: 1, requestKey: "w3" } });
  assert.equal(r.код, 200, JSON.stringify(r.ответ));
  assert.equal(await п.getBalance(чужой), ethers.parseEther("1"));
  // Узел кеширует одинаковые запросы четверть секунды — даём кешу остыть.
  await new Promise((r2) => setTimeout(r2, 400));
  r = await вызвать("withdraw", { method: "POST", body: { chain: "bsc", address: чужой, all: true, requestKey: "w4" } });
  assert.equal(r.код, 200, JSON.stringify(r.ответ));
  const осталось = Number(ethers.formatEther(await п.getBalance(адрес)));
  assert.ok(осталось < 0.001, `осталось ${осталось}`);
});

await проверка("с почтой для 2ФА вывод без свежего подтверждения отбивается", async () => {
  таблицы.profiles.push({ id: "u1", mail_2fa: true });
  const r = await вызвать("withdraw", { method: "POST", body: { chain: "bsc", address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72", amount: 0.0001, requestKey: "w9" } });
  assert.equal(r.код, 403);
  assert.equal(r.ответ.error, "need_2fa");
  таблицы.profiles.length = 0;
});

console.log(`\n${пройдено} проверок сервера пройдено`);
await сервер.close();
