/* Проверка кривой EVM на локальной сети (ganache в памяти).
 *
 * Запуск: node contracts/evm/test.mjs
 *
 * Что проверяем — ровно то, на чём теряют деньги:
 *   — запуск со стартовой покупкой и без;
 *   — покупка и продажа по формуле, обратная продажа не даёт больше,
 *     чем заплачено;
 *   — до выхода на биржу токен никуда, кроме фабрики, не переводится;
 *   — последняя покупка упирается в конец кривой, лишнее возвращается;
 *   — выход на биржу проходит, даже если пул заранее создали и подложили
 *     в него монету;
 *   — после выхода кривая закрыта, а токен свободно переводится;
 *   — комиссия уходит получателю, защита от проскальзывания работает.
 */
import assert from "node:assert/strict";
import ganache from "ganache";
import { ethers } from "ethers";
import { собрать } from "./build.mjs";

const к = собрать({ сТестами: true });
const провайдер = new ethers.BrowserProvider(ganache.provider({
  logging: { quiet: true },
  chain: { hardfork: "shanghai" },
  wallet: { totalAccounts: 6, defaultBalance: 10_000 },
}));
const [владелец, автор, покупатель, второй, комиссия, злоумышленник] = await Promise.all(
  [0, 1, 2, 3, 4, 5].map((i) => провайдер.getSigner(i)),
);

async function развернуть(имя, подпись, ...арг) {
  const ф = new ethers.ContractFactory(к[имя].abi, к[имя].bytecode, подпись);
  const c = await ф.deploy(...арг);
  await c.waitForDeployment();
  return c;
}

const weth = await развернуть("MockWETH", владелец);
const биржа = await развернуть("MockDexFactory", владелец);
const ВИРТ = ethers.parseEther("6");
const кривая = await развернуть("MintlyCurve", владелец, await weth.getAddress(), await биржа.getAddress(), ВИРТ, await комиссия.getAddress(), 100);
const адресКривой = await кривая.getAddress();
const токенABI = к.MintlyToken.abi;

let пройдено = 0;
async function проверка(имя, f) {
  await f();
  пройдено += 1;
  console.log("ok —", имя);
}

async function запустить(от, value = 0n) {
  const tx = await кривая.connect(от).create("Moon Cat", "MCAT", "https://x/metadata.json", 0, { value });
  const r = await tx.wait();
  const событие = r.logs.map((l) => { try { return кривая.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Created");
  return new ethers.Contract(событие.args.token, токенABI, провайдер);
}

let токен;
await проверка("запуск без покупки: весь выпуск на фабрике", async () => {
  токен = await запустить(автор);
  assert.equal(await токен.balanceOf(адресКривой), ethers.parseEther("1000000000"));
  assert.equal(await токен.name(), "Moon Cat");
  const c = await кривая.curves(await токен.getAddress());
  assert.equal(c.creator, await автор.getAddress());
  assert.equal(c.sold, 0n);
});

const адресТокена = () => токен.getAddress();

await проверка("покупка: токены по формуле и комиссия 1% получателю", async () => {
  const сумма = ethers.parseEther("1");
  const [ожидаем] = await кривая.quoteBuy(await адресТокена(), сумма);
  const комиссияДо = await провайдер.getBalance(await комиссия.getAddress());
  await (await кривая.connect(покупатель).buy(await адресТокена(), ожидаем, { value: сумма })).wait();
  const есть = await токен.balanceOf(await покупатель.getAddress());
  assert.equal(есть, ожидаем);
  // Проверка формулы вручную: x·y = k.
  const net = сумма - сумма / 100n;
  const k = ВИРТ * ethers.parseEther("1073000000");
  const y = ethers.parseEther("1073000000") - (k + ВИРТ + net - 1n) / (ВИРТ + net);
  assert.ok(есть === y || есть === y + 1n || есть + 1n === y, `формула: ${есть} vs ${y}`);
  const комиссияПосле = await провайдер.getBalance(await комиссия.getAddress());
  assert.equal(комиссияПосле - комиссияДо, сумма / 100n);
});

await проверка("защита от проскальзывания на покупке", async () => {
  const сумма = ethers.parseEther("0.5");
  const [ожидаем] = await кривая.quoteBuy(await адресТокена(), сумма);
  await assert.rejects(кривая.connect(второй).buy(await адресТокена(), ожидаем + 1n, { value: сумма }));
});

await проверка("до выхода на биржу токен не переводится другому человеку", async () => {
  const есть = await токен.balanceOf(await покупатель.getAddress());
  await assert.rejects(токен.connect(покупатель).transfer(await второй.getAddress(), есть / 2n));
  await (await токен.connect(покупатель).approve(await второй.getAddress(), есть)).wait();
  await assert.rejects(токен.connect(второй).transferFrom(await покупатель.getAddress(), await второй.getAddress(), 1n));
});

await проверка("продажа: монета по формуле, не больше заплаченного", async () => {
  const есть = await токен.balanceOf(await покупатель.getAddress());
  const ожидаем = await кривая.quoteSell(await адресТокена(), есть);
  const до = await провайдер.getBalance(await покупатель.getAddress());
  const r = await (await кривая.connect(покупатель).sell(await адресТокена(), есть, ожидаем)).wait();
  const после = await провайдер.getBalance(await покупатель.getAddress());
  const газ = r.gasUsed * r.gasPrice;
  assert.equal(после - до + газ, ожидаем);
  assert.ok(ожидаем < ethers.parseEther("1"), "продажа не может дать больше покупки");
  assert.equal(await токен.balanceOf(await покупатель.getAddress()), 0n);
});

await проверка("продать больше, чем продано с кривой, нельзя", async () => {
  await assert.rejects(кривая.connect(покупатель).sell(await адресТокена(), 1n, 0));
});

await проверка("запуск со стартовой покупкой отдаёт токены автору", async () => {
  const т = await запустить(автор, ethers.parseEther("0.3"));
  assert.ok((await т.balanceOf(await автор.getAddress())) > 0n);
});

await проверка("злоумышленник создаёт пул заранее и подкладывает монету", async () => {
  await (await биржа.connect(злоумышленник).createPair(await адресТокена(), await weth.getAddress())).wait();
  const пара = await биржа.getPair(await адресТокена(), await weth.getAddress());
  await (await weth.connect(злоумышленник).deposit({ value: ethers.parseEther("1") })).wait();
  await (await weth.connect(злоумышленник).transfer(пара, ethers.parseEther("1"))).wait();
  const p = new ethers.Contract(пара, к.MockPair.abi, злоумышленник);
  await (await p.sync()).wait();
});

await проверка("последняя покупка закрывает кривую, лишнее возвращается, пул пополнен", async () => {
  const много = ethers.parseEther("100");
  const до = await провайдер.getBalance(await второй.getAddress());
  const r = await (await кривая.connect(второй).buy(await адресТокена(), 0, { value: много })).wait();
  const после = await провайдер.getBalance(await второй.getAddress());
  const ушло = до - после - r.gasUsed * r.gasPrice;
  const c = await кривая.curves(await адресТокена());
  assert.equal(c.graduated, true);
  assert.equal(c.sold, ethers.parseEther("800000000"));
  assert.ok(ушло < много, "лишнее должно вернуться");
  // Сколько собрано: 6·(1073/273 − 1) ≈ 17.58 монеты.
  const собрано = Number(ethers.formatEther(c.realNative));
  assert.ok(собрано > 17.5 && собрано < 17.7, `собрано ${собрано}`);
  const пара = await биржа.getPair(await адресТокена(), await weth.getAddress());
  assert.equal(await токен.balanceOf(пара), ethers.parseEther("200000000"));
  assert.equal(await weth.balanceOf(пара), c.realNative + ethers.parseEther("1"));
  const p = new ethers.Contract(пара, к.MockPair.abi, провайдер);
  assert.equal(await p.lpHolder(), "0x000000000000000000000000000000000000dEaD");
  assert.equal(await токен.balanceOf(адресКривой), 0n);
  assert.equal(await токен.listed(), true);
  // Монета фабрики целиком ушла в пул и комиссию — на фабрике не застряло.
});

await проверка("после выхода кривая закрыта, токен переводится свободно", async () => {
  await assert.rejects(кривая.connect(покупатель).buy(await адресТокена(), 0, { value: ethers.parseEther("0.1") }));
  await assert.rejects(кривая.connect(второй).sell(await адресТокена(), 1n, 0));
  await (await токен.connect(второй).transfer(await покупатель.getAddress(), 5n)).wait();
  assert.equal(await токен.balanceOf(await покупатель.getAddress()), 5n);
});

await проверка("настройки меняет только владелец, комиссия не выше 2%", async () => {
  await assert.rejects(кривая.connect(злоумышленник).setFees(await злоумышленник.getAddress(), 0, 0));
  await assert.rejects(кривая.connect(владелец).setFees(await комиссия.getAddress(), 300, 0));
  await (await кривая.connect(владелец).setFees(await комиссия.getAddress(), 50, 0)).wait();
  assert.equal(await кривая.feeBps(), 50n);
});

await проверка("образец токена нельзя присвоить", async () => {
  const образец = new ethers.Contract(await кривая.tokenImpl(), токенABI, злоумышленник);
  await assert.rejects(образец.initialize("x", "x", "x", 1n));
});

const остаток = await провайдер.getBalance(адресКривой);
console.log(`\n${пройдено} проверок пройдено, на фабрике осталось ${ethers.formatEther(остаток)} монеты (собранное на открытых кривых)`);
