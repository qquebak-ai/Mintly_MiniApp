/* Фабрики Mintly в сетях EVM — одной командой на сервере.
 *
 *   sudo -u mintly node /srv/mintly/server/evm-factories.mjs
 *
 * Без фабрики сеть в приложении видна, но запускать и торговать в ней
 * нельзя (api/wallet-evm.js, launch: false). Скрипт:
 *   1. заводит ключ развёртывания EVM_DEPLOYER_KEY в .env.server, если
 *      его ещё нет, и печатает адрес — его пополняют с кранов;
 *   2. ждёт монету на газ в каждой сети, где фабрики ещё нет;
 *   3. разворачивает фабрику из готового байткода contracts/evm/out —
 *      того же, что проверен тестами, — и дописывает EVM_CURVE_<СЕТЬ>.
 * Сеть, где фабрика уже есть, пропускается: повторный запуск безопасен.
 *
 * Сети тестовые, пока не задано EVM_MAINNET=1 — тот же выключатель, что
 * у api/wallet-evm.js, иначе фабрика встала бы не в ту сеть, куда ходит
 * сервер. Службу после скрипта надо перезапустить: переменные она
 * читает при старте.
 */
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const КОРЕНЬ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ФАЙЛ = process.env.ENV_FILE || path.join(КОРЕНЬ, ".env.server");
const ЖДАТЬ_МИН = Number(process.env.WAIT_MIN || 60);

function прочитать() {
  const т = fs.existsSync(ФАЙЛ) ? fs.readFileSync(ФАЙЛ, "utf8") : "";
  return Object.fromEntries(т.split("\n").map((с) => с.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((м) => [м[1], м[2].trim()]));
}
// Дописываем, а не переписываем файл: в нём ключи, которые нельзя потерять.
function дописать(имя, значение) {
  const т = fs.existsSync(ФАЙЛ) ? fs.readFileSync(ФАЙЛ, "utf8") : "";
  const строки = т.split("\n").filter((с) => !с.startsWith(`${имя}=`));
  while (строки.length && строки[строки.length - 1] === "") строки.pop();
  строки.push(`${имя}=${значение}`, "");
  fs.writeFileSync(ФАЙЛ, строки.join("\n"), { mode: 0o600 });
}

const env = { ...прочитать(), ...process.env };
const БОЕВЫЕ = env.EVM_MAINNET === "1";

// Те же адреса, что в contracts/evm/deploy.mjs: обёрнутая монета и
// фабрика пулов биржи, куда токен выходит после кривой.
// Виртуальный запас задаёт порог выхода на биржу: кривая той же формы,
// что у pump.fun, и сбор к выходу — вирт × 800 / 273 ≈ 2,93 × вирт. Пороги
// в монете сети равны по деньгам 85 SOL у pump.fun: 12 BNB, 3,6 ETH; в
// тестовых сетях в сто раз меньше, чтобы выход проверялся монетами с крана.
const СЕТИ = БОЕВЫЕ ? {
  bsc: { chainId: 56, rpc: env.EVM_RPC_BSC || "https://bsc-dataseed.bnbchain.org", weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", dex: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", вирт: "4.1", монета: "BNB" },
  base: { chainId: 8453, rpc: env.EVM_RPC_BASE || "https://mainnet.base.org", weth: "0x4200000000000000000000000000000000000006", dex: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", вирт: "1.23", монета: "ETH" },
  eth: { chainId: 1, rpc: env.EVM_RPC_ETH || "https://ethereum-rpc.publicnode.com", weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", dex: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", вирт: "1.23", монета: "ETH" },
} : {
  bsc: { chainId: 97, rpc: env.EVM_RPC_BSC || "https://bsc-testnet-rpc.publicnode.com", weth: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", dex: "0x6725F303b657a9451d8BA641348b6761A6CC7a17", вирт: "0.041", монета: "tBNB", кран: "https://www.bnbchain.org/en/testnet-faucet" },
  base: { chainId: 84532, rpc: env.EVM_RPC_BASE || "https://sepolia.base.org", weth: "0x4200000000000000000000000000000000000006", dex: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e", вирт: "0.0123", монета: "ETH (Base Sepolia)", кран: "https://portal.cdp.coinbase.com/products/faucet" },
  eth: { chainId: 11155111, rpc: env.EVM_RPC_ETH || "https://ethereum-sepolia-rpc.publicnode.com", weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", dex: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6", вирт: "0.0123", монета: "SepoliaETH", кран: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia" },
};
const выбраны = (process.argv[2] ? process.argv[2].split(",") : Object.keys(СЕТИ)).filter((к) => СЕТИ[к]);

let ключ = env.EVM_DEPLOYER_KEY;
if (!ключ) {
  ключ = ethers.Wallet.createRandom().privateKey;
  дописать("EVM_DEPLOYER_KEY", ключ);
  console.log("Завёл ключ развёртывания в .env.server");
}
const кошелёк = new ethers.Wallet(ключ);
const { abi, bytecode } = JSON.parse(fs.readFileSync(path.join(КОРЕНЬ, "contracts/evm/out/MintlyCurve.json"), "utf8"));

const нужно = выбраны.filter((к) => !(env[`EVM_CURVE_${к.toUpperCase()}`] || "").trim());
if (!нужно.length) { console.log("Фабрики уже есть во всех сетях."); process.exit(0); }

console.log(`\n${БОЕВЫЕ ? "БОЕВЫЕ" : "Тестовые"} сети. Адрес для газа (один на все):\n\n  ${кошелёк.address}\n`);
for (const к of нужно) console.log(`  ${к}: ${СЕТИ[к].монета}${СЕТИ[к].кран ? ` — кран ${СЕТИ[к].кран}` : ""}`);
console.log("");

const провайдер = (к) => new ethers.JsonRpcProvider(СЕТИ[к].rpc, СЕТИ[к].chainId, { staticNetwork: true });
// Фабрика — около 2,6 млн газа; берём цену газа сети с запасом.
async function хватает(к) {
  const п = провайдер(к);
  const [есть, газ] = await Promise.all([п.getBalance(кошелёк.address), п.getFeeData()]);
  const цена = газ.maxFeePerGas || газ.gasPrice || 0n;
  return { есть, надо: (3_000_000n * цена * 15n) / 10n };
}

async function развернуть(к) {
  const с = СЕТИ[к];
  const w = кошелёк.connect(провайдер(к));
  const ф = await new ethers.ContractFactory(abi, bytecode, w)
    .deploy(с.weth, с.dex, ethers.parseEther(с.вирт), env.FEE_RECIPIENT || w.address, Number(env.FEE_BPS || 0));
  console.log(`  ${к}: отправлено ${ф.deploymentTransaction().hash}`);
  await ф.waitForDeployment();
  const адрес = await ф.getAddress();
  дописать(`EVM_CURVE_${к.toUpperCase()}`, адрес);
  console.log(`  ${к}: фабрика ${адрес} ✓`);
}

const срок = Date.now() + ЖДАТЬ_МИН * 60_000;
const осталось = new Set(нужно);
while (осталось.size && Date.now() < срок) {
  for (const к of [...осталось]) {
    try {
      const { есть, надо } = await хватает(к);
      if (есть >= надо) { await развернуть(к); осталось.delete(к); }
      else console.log(`  ${к}: ${ethers.formatEther(есть)} из ~${ethers.formatEther(надо)} — жду пополнения`);
    } catch (e) {
      console.log(`  ${к}: ${String((e && e.shortMessage) || (e && e.message) || e).slice(0, 160)}`);
    }
  }
  if (осталось.size) await new Promise((r) => setTimeout(r, 30_000));
}
if (осталось.size) {
  console.log(`\nНе дождался газа в: ${[...осталось].join(", ")}. Пополни адрес и запусти команду ещё раз.`);
  process.exit(2);
}
console.log("\nВсе фабрики на месте.");
