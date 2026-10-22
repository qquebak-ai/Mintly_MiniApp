/* STON.fi — биржа, куда токены TON площадки выходят после кривой.
 *
 * Здесь всё, что нужно и выводу на биржу, и сделкам после него, в обеих
 * сетях. В mainnet маршрут умеет искать API биржи (api/_swap.js), но в
 * testnet API нет вовсе, а новый пул API видит не сразу. Поэтому для
 * своих токенов сделка собирается прямо по роутеру и пулу: адреса
 * роутера известны, резервы пул отдаёт сам.
 *
 * Адреса сверены по сети: в testnet роутер v2.1 из документации STON.fi
 * на get-методы не отвечает (exit 9), рабочий — constant_product v2.2
 * (get_router_version → 2.2 release), кошелёк pTON v2.1 у него заведён;
 * mainnet — роутер v2.2 и pTON v2.1 из /v1/routers.
 */
import { Address, beginCell, toNano } from "@ton/core";
import { TonClient } from "@ton/ton";
import { DEX, pTON } from "@ston-fi/sdk";

const TESTNET = process.env.TON_TESTNET === "1";
export const STON = TESTNET
  ? { роутер: "kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn", pton: "kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px", версия: "2.2" }
  : { роутер: "EQCS4UEa5UaJLzOyyKieqQOQ2P9M-7kXpkO5HnP3Bv250cN3", pton: "EQBnGWMCf3-FZZq1W4IWcWiGAc3PHuZ0_H-7sad2oY00o83S", версия: "2.2" };
// Ликвидность, отправленная сюда, не принадлежит никому: LP-токены пула
// выпускаются на нулевой адрес, и вынуть её не может никто.
export const ДЫРА = Address.parse("0:0000000000000000000000000000000000000000000000000000000000000000");

export function клиент() {
  return new TonClient({
    endpoint: process.env.TONCENTER_URL
      || (TESTNET ? "https://testnet.toncenter.com/api/v2/jsonRPC" : "https://toncenter.com/api/v2/jsonRPC"),
    apiKey: process.env.TONCENTER_API_KEY || undefined,
  });
}

// Адрес жетонного кошелька владельца — get_wallet_address у мастера.
export async function кошелёкВладельца(c, jetton, владелец) {
  const r = await c.runMethod(Address.parse(jetton), "get_wallet_address", [
    { type: "slice", cell: beginCell().storeAddress(Address.parse(String(владелец))).endCell() },
  ]);
  return r.stack.readAddress();
}

export function роутер(c = клиент()) {
  const R = STON.версия === "2.2" ? DEX.v2_2.Router : DEX.v2_1.Router;
  return { r: c.open(R.create(STON.роутер)), proxy: pTON.v2_1.create(STON.pton), c };
}

/* Адрес пула пары «жетон — TON». Пул может ещё не существовать: адрес
   считается роутером и от этого не зависит. */
export async function адресПула(jetton) {
  const { r } = роутер();
  return r.getPoolAddressByJettonMinters({ token0: jetton, token1: STON.pton });
}

/* Резервы пула: сколько в нём TON и сколько жетона. Порядок токенов в
   пуле — по адресам кошельков роутера, поэтому сверяемся с кошельком
   жетона у роутера. */
export async function резервыПула(jetton) {
  const { r, c } = роутер();
  const пул = c.open(await r.getPool({ token0: jetton, token1: STON.pton }));
  const d = await пул.getPoolData();
  const кошелёкЖетона = await кошелёкВладельца(c, jetton, STON.роутер);
  const жетонПервый = d.token0WalletAddress.equals(кошелёкЖетона);
  return {
    пул: пул.address,
    ton: жетонПервый ? d.reserve1 : d.reserve0,
    жетон: жетонПервый ? d.reserve0 : d.reserve1,
    // Ставка пула в десятитысячных долях, как её отдаёт сам пул.
    ставка: BigInt(d.lpFee) + BigInt(d.protocolFee),
  };
}

export function котировка(резервВход, резервВыход, вход, ставка = 30n) {
  const чистыми = (BigInt(вход) * (10_000n - BigInt(ставка))) / 10_000n;
  if (чистыми <= 0n || резервВход <= 0n || резервВыход <= 0n) return 0n;
  return (резервВыход * чистыми) / (резервВход + чистыми);
}

/* Сделка в пуле своего токена: покупка за TON или продажа за TON.
   Возвращает готовое сообщение для кошелька человека (TonConnect). */
export async function сделкаВПуле({ jetton, покупка, сумма, кошелёк, допуск = 0.03, знаков = 9 }) {
  const { r, proxy } = роутер();
  const рез = await резервыПула(jetton);
  const ед = 10n ** BigInt(знаков);
  const вход = покупка ? toNano(Number(сумма).toFixed(9)) : BigInt(Math.floor(Number(сумма) * Number(ед)));
  if (!(вход > 0n)) throw new Error("пустая сделка");
  const выйдет = покупка ? котировка(рез.ton, рез.жетон, вход, рез.ставка) : котировка(рез.жетон, рез.ton, вход, рез.ставка);
  if (!(выйдет > 0n)) throw new Error("в пуле нет ликвидности");
  const минимум = (выйдет * BigInt(Math.round((1 - допуск) * 10_000))) / 10_000n;
  const пользователь = Address.parse(кошелёк);
  const tx = покупка
    ? await r.getSwapTonToJettonTxParams({ userWalletAddress: пользователь, proxyTon: proxy, offerAmount: вход, askJettonAddress: jetton, minAskAmount: минимум })
    : await r.getSwapJettonToTonTxParams({ userWalletAddress: пользователь, proxyTon: proxy, offerJettonAddress: jetton, offerAmount: вход, minAskAmount: минимум });
  return {
    to: tx.to.toString({ bounceable: true, testOnly: TESTNET }),
    value: tx.value.toString(),
    body: tx.body ? tx.body.toBoc().toString("base64") : "",
    получит: покупка ? Number(выйдет) / Number(ед) : Number(выйдет) / 1e9,
    минимум: покупка ? Number(минимум) / Number(ед) : Number(минимум) / 1e9,
  };
}

/* Сообщения вывода ликвидности на биржу: жетоны и TON уходят в роутер
   двумя переводами provide_lp, пул заводится сам при первом таком
   вкладе, а LP-токены выпускаются на нулевой адрес. */
export async function сообщенияЛиквидности({ jetton, жетонов, тонов, кошелёк }) {
  const { r, proxy } = роутер();
  const владелец = Address.parse(кошелёк);
  const жетонная = await r.getProvideLiquidityJettonTxParams({
    userWalletAddress: владелец, sendTokenAddress: jetton, otherTokenAddress: STON.pton,
    sendAmount: жетонов, minLpOut: 1n, receiverAddress: ДЫРА,
  });
  const тонная = await r.getProvideLiquidityTonTxParams({
    userWalletAddress: владелец, proxyTon: proxy, otherTokenAddress: jetton,
    sendAmount: тонов, minLpOut: 1n, receiverAddress: ДЫРА,
  });
  return [жетонная, тонная];
}

// Сообщение кривой «отдай ликвидность» — op 0x47524144 (Graduate).
export function телоВыхода() {
  return beginCell().storeUint(0x47524144, 32).storeUint(0, 64).endCell();
}

/* Кошелёк ликвидности TON — получатель собранного кривыми, запущенными
   после его заведения (server/ton-liquidity.mjs). Отсюда сервер сам
   заводит пул на STON.fi. */
export async function кошелёкЛиквидности() {
  const слова = String(process.env.TON_LIQUIDITY_MNEMONIC || "").trim().split(/\s+/).filter(Boolean);
  if (слова.length !== 24) return null;
  const { mnemonicToPrivateKey } = await import("@ton/crypto");
  const { WalletContractV4 } = await import("@ton/ton");
  const пара = await mnemonicToPrivateKey(слова);
  const контракт = WalletContractV4.create({ workchain: 0, publicKey: пара.publicKey });
  return { пара, контракт, адрес: контракт.address };
}
