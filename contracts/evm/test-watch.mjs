/* Проверка наблюдателя EVM (api/_evmWatch.js): события фабрики дают
 * живую цену, переводы на кошелёк площадки — пополнения в журнале.
 *
 * Запуск: node contracts/evm/test-watch.mjs
 */
import assert from "node:assert/strict";
import ganache from "ganache";
import { ethers } from "ethers";
import { собрать } from "./build.mjs";

const сервер = ganache.server({ logging: { quiet: true }, chain: { chainId: 97, hardfork: "shanghai" }, wallet: { totalAccounts: 4, defaultBalance: 1000 } });
await new Promise((r) => сервер.listen(8551, r));
const rpc = "http://127.0.0.1:8551";
const п = new ethers.JsonRpcProvider(rpc, 97, { staticNetwork: true });
const [владелец, трейдер, , человек] = await Promise.all([0, 1, 2, 3].map((i) => п.getSigner(i)));
const к = собрать({ сТестами: true });
const развернуть = async (имя, ...арг) => {
  const c = await new ethers.ContractFactory(к[имя].abi, к[имя].bytecode, владелец).deploy(...арг);
  await c.waitForDeployment();
  return c;
};
const weth = await развернуть("MockWETH");
const биржа = await развернуть("MockDexFactory");
const фабрика = await развернуть("MintlyCurve", await weth.getAddress(), await биржа.getAddress(), ethers.parseEther("6"), await владелец.getAddress(), 100);
const адресФабрики = await фабрика.getAddress();

process.env.EVM_RPC_BSC = rpc;
process.env.EVM_CHAIN_BSC = "97";
process.env.EVM_CURVE_BSC = адресФабрики;
// Остальные сети — в никуда: наблюдатель просто не получит от них блоков.
process.env.EVM_RPC_BASE = "http://127.0.0.1:9";
process.env.EVM_RPC_ETH = "http://127.0.0.1:9";

// Токен, запущенный до наблюдателя: его цену должен принести засев.
const плата = await фабрика.launchFee();
const ф = фабрика.connect(трейдер);
async function запустить(имя) {
  const tx = await ф.create(имя, имя, "", 0, { value: плата + ethers.parseEther("0.5") });
  const r = await tx.wait();
  for (const l of r.logs) { try { const e = фабрика.interface.parseLog(l); if (e && e.name === "Created") return e.args.token; } catch { /* чужой */ } }
  throw new Error("нет Created");
}
const ранний = (await запустить("EARLY")).toLowerCase();

// База в памяти: кошелёк человека и токены.
const таблицы = {
  app_wallets: [{ user_id: "u1", chain: "evm", address: (await человек.getAddress()) }],
  tokens: [{ chain: "bsc", network: "testnet", address: ранний, created_at: new Date().toISOString() }],
  wallet_ops: [],
};
function запрос(имя) {
  const ф2 = [];
  let вставка = null, диапазон = null, предел = null;
  const q = {
    select() { return q; }, eq(k, v) { ф2.push((r) => r[k] === v); return q; }, in(k, v) { ф2.push((r) => v.includes(r[k])); return q; },
    order() { return q; }, limit(n) { предел = n; return q; }, range(a, b) { диапазон = [a, b]; return q; },
    insert(row) { вставка = row; return q; },
    then(ok, fail) {
      const т = таблицы[имя];
      let итог;
      if (вставка) {
        if (вставка.request_key && т.some((x) => x.user_id === вставка.user_id && x.request_key === вставка.request_key)) итог = { data: null, error: { message: "duplicate" } };
        else { т.push({ ...вставка }); итог = { data: [вставка], error: null }; }
      } else {
        let d = т.filter((r) => ф2.every((f) => f(r)));
        if (диапазон) d = d.slice(диапазон[0], диапазон[1] + 1);
        if (предел) d = d.slice(0, предел);
        итог = { data: d, error: null };
      }
      return Promise.resolve(итог).then(ok, fail);
    },
  };
  return q;
}
const наблюдатель = await import("../../api/_evmWatch.js");
const { прочитатьЖивое } = await import("../../api/_live.js");
наблюдатель.заменитьБазуНаблюдателяEVM({ from: запрос });
await наблюдатель.наблюдатьЗаEVM();
const ждать = (мс) => new Promise((r) => setTimeout(r, мс));

// Первый шаг только запоминает блок — сделки после него.
await ждать(2500);
assert.ok(наблюдатель.наблюдательEVMЖив(), "наблюдатель жив");

const новый = (await запустить("LIVE")).toLowerCase();
await (await ф.buy(новый, 0, { value: ethers.parseEther("1") })).wait();
await ждать(2500);
const з = прочитатьЖивое(`bsc:${новый}`);
assert.ok(з && з.событие, "цена нового токена пришла событием");
const с = з.событие;
// Собрано: 0,5 при запуске + 1 покупкой, за вычетом 1% комиссии.
assert.ok(Math.abs(с.raised - 1.485) < 0.002, `собрано ${с.raised}`);
const ожидаемаяЦена = (6 + с.raised) / (1_073_000_000 - с.sold);
assert.ok(Math.abs(с.price / ожидаемаяЦена - 1) < 1e-6, `цена ${с.price} против ${ожидаемаяЦена}`);
assert.equal(с.graduated, false);

// Продажа двигает цену вниз.
const токен = new ethers.Contract(новый, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], трейдер);
const есть = await токен.balanceOf(await трейдер.getAddress());
await (await ф.sell(новый, есть / 2n, 0)).wait();
await ждать(2500);
const после = прочитатьЖивое(`bsc:${новый}`).событие;
assert.ok(после.price < с.price && после.raised < с.raised, "продажа опустила цену");

// Засев: токен, запущенный до наблюдателя, получил цену без событий.
await ждать(4000);
const р = прочитатьЖивое(`bsc:${ранний}`);
assert.ok(р && р.событие && р.событие.price > 0, "засев принёс цену раннего токена");
assert.ok(Math.abs(р.событие.raised - 0.495) < 0.002, `засев: собрано ${р.событие.raised}`);

// Пополнение: перевод монеты на кошелёк человека.
await (await владелец.sendTransaction({ to: await человек.getAddress(), value: ethers.parseEther("0.25") })).wait();
await ждать(2500);
const пополнения = таблицы.wallet_ops.filter((о) => о.kind === "deposit");
assert.equal(пополнения.length, 1, JSON.stringify(таблицы.wallet_ops));
assert.equal(пополнения[0].user_id, "u1");
assert.equal(пополнения[0].chain, "bsc");
assert.ok(Math.abs(пополнения[0].amount - 0.25) < 1e-12);
assert.equal(пополнения[0].address.toLowerCase(), (await владелец.getAddress()).toLowerCase());

// Свой перевод приложения наблюдатель второй раз не пишет.
const свой = await владелец.sendTransaction({ to: await человек.getAddress(), value: ethers.parseEther("0.1") });
наблюдатель.свойПереводEVM(свой.hash);
await свой.wait();
await ждать(2500);
assert.equal(таблицы.wallet_ops.filter((о) => о.kind === "deposit").length, 1, "свой перевод не задвоен");

console.log("ok наблюдатель EVM: цена событиями, засев, пополнения");
await сервер.close();
process.exit(0);
