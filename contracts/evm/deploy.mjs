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
    // биржу: сбор ≈ 2,93 × запас. Порог равен по деньгам 85 SOL у
    // pump.fun: 4,1 BNB → к выходу собирается около 12 BNB.
    virtualNative: "1.365",
    env: "EVM_CURVE_BSC",
  },
  base: {
    chainId: 8453, rpc: "https://mainnet.base.org",
    weth: "0x4200000000000000000000000000000000000006",
    dexFactory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", // Uniswap V2
    virtualNative: "0.4095", // к выходу около 1,2 ETH
    env: "EVM_CURVE_BASE",
  },
  eth: {
    chainId: 1, rpc: "https://ethereum-rpc.publicnode.com",
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    dexFactory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", // Uniswap V2
    virtualNative: "0.4095",
    env: "EVM_CURVE_ETH",
  },
};

/* Тестовые сети — по умолчанию, пока площадка проверяется. Газ там
   бесплатный, с кранов:
     BNB testnet  — https://www.bnbchain.org/en/testnet-faucet
     Base Sepolia — https://portal.cdp.coinbase.com/products/faucet
     Sepolia      — https://cloud.google.com/application/web3/faucet/ethereum/sepolia
   Боевые — только с EVM_MAINNET=1. Виртуальный запас в тестовых сетях
   в сто раз меньше: кранов не хватит, чтобы дойти до выхода на биржу
   при боевых суммах, а проверить хочется весь путь. */
const ТЕСТОВЫЕ = {
  bsc: {
    chainId: 97, rpc: "https://bsc-testnet-rpc.publicnode.com",
    weth: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",       // WBNB testnet
    dexFactory: "0x6725F303b657a9451d8BA641348b6761A6CC7a17", // PancakeSwap V2 testnet
    virtualNative: "1.365", env: "EVM_CURVE_BSC",
  },
  base: {
    chainId: 84532, rpc: "https://sepolia.base.org",
    weth: "0x4200000000000000000000000000000000000006",
    dexFactory: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e", // Uniswap V2, Base Sepolia
    virtualNative: "0.4095", env: "EVM_CURVE_BASE",
  },
  eth: {
    chainId: 11155111, rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    dexFactory: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6", // Uniswap V2, Sepolia
    virtualNative: "0.4095", env: "EVM_CURVE_ETH",
  },
};

const сеть = process.argv[2];
const с = (process.env.EVM_MAINNET === "1" ? СЕТИ : ТЕСТОВЫЕ)[сеть];
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
console.log(`${process.env.EVM_MAINNET === "1" ? "БОЕВАЯ" : "тестовая"} сеть ${сеть}, владелец ${w.address}, на газ ${ethers.formatEther(баланс)}`);

const { MintlyCurve } = собрать();
const фабрика = await new ethers.ContractFactory(MintlyCurve.abi, MintlyCurve.bytecode, w)
  .deploy(с.weth, с.dexFactory, ethers.parseEther(с.virtualNative), получатель, комиссия);
console.log("Отправлено:", фабрика.deploymentTransaction().hash);
await фабрика.waitForDeployment();
const адрес = await фабрика.getAddress();
console.log(`\nГотово. Добавьте в Vercel → Settings → Environment Variables:\n${с.env}=${адрес}`);
