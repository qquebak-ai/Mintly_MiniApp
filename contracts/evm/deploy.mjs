/* Развёртывание фабрики Mintly в сети EVM.
 *
 * Запуск:
 *   DEPLOYER_KEY=0x… node contracts/evm/deploy.mjs bsc
 *   DEPLOYER_KEY=0x… node contracts/evm/deploy.mjs base
 *   DEPLOYER_KEY=0x… node contracts/evm/deploy.mjs eth
 *
 * Ключ развёртывания становится владельцем фабрики: только он меняет
 * комиссию. На нём должно быть немного монеты сети на газ (фабрика —
 * около 2,6 млн газа).
 *
 * Необязательно: FEE_RECIPIENT — куда идёт комиссия (по умолчанию сам
 * владелец), FEE_BPS — комиссия сделки в сотых долях процента (0 — как
 * в TON и Solana, больше 200 контракт не примет).
 *
 * В конце скрипт печатает строку для переменных окружения Vercel.
 */
import { ethers } from "ethers";
import { собрать } from "./build.mjs";

// Биржи сетей: Uniswap V2 и PancakeSwap V2 — их пулы видят все
// агрегаторы и обозреватели, поэтому токен после выхода сразу торгуется.
const СЕТИ = {
  bsc: {
    chainId: 56, rpc: "https://bsc-dataseed.bnbchain.org",
    weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",      // WBNB
    dexFactory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // PancakeSwap V2
    // Виртуальный запас задаёт стартовую цену и сумму сбора к выходу на
    // биржу: 6 BNB → к выходу собирается около 17,6 BNB.
    virtualNative: "6",
    env: "EVM_CURVE_BSC",
  },
  base: {
    chainId: 8453, rpc: "https://mainnet.base.org",
    weth: "0x4200000000000000000000000000000000000006",
    dexFactory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", // Uniswap V2
    virtualNative: "1.5", // к выходу около 4,4 ETH
    env: "EVM_CURVE_BASE",
  },
  eth: {
    chainId: 1, rpc: "https://ethereum-rpc.publicnode.com",
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    dexFactory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Uniswap V2
    virtualNative: "1.5",
    env: "EVM_CURVE_ETH",
  },
};

const сеть = process.argv[2];
const с = СЕТИ[сеть];
if (!с) {
  console.error("Укажите сеть: bsc, base или eth");
  process.exit(1);
}
const ключ = process.env.DEPLOYER_KEY;
if (!ключ) {
  console.error("Нужен DEPLOYER_KEY — приватный ключ кошелька с монетой на газ");
  process.exit(1);
}

const п = new ethers.JsonRpcProvider(process.env.RPC || с.rpc, с.chainId, { staticNetwork: true });
const w = new ethers.Wallet(ключ, п);
const получатель = process.env.FEE_RECIPIENT || w.address;
const комиссия = Number(process.env.FEE_BPS || 0);

const баланс = await п.getBalance(w.address);
console.log(`Сеть ${сеть}, владелец ${w.address}, на газ ${ethers.formatEther(баланс)}`);

const { MintlyCurve } = собрать();
const фабрика = await new ethers.ContractFactory(MintlyCurve.abi, MintlyCurve.bytecode, w)
  .deploy(с.weth, с.dexFactory, ethers.parseEther(с.virtualNative), получатель, комиссия);
console.log("Отправлено:", фабрика.deploymentTransaction().hash);
await фабрика.waitForDeployment();
const адрес = await фабрика.getAddress();
console.log(`\nГотово. Добавьте в Vercel → Settings → Environment Variables:\n${с.env}=${адрес}`);
