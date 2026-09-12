// Параметры бондинг-кривой и сборка сообщений к ней.
//
// Кривая — это рынок токена, запущенного в приложении: она сама вторая
// сторона сделки, поэтому торговать можно с первой секунды, не дожидаясь,
// пока кто-то заведёт ликвидность. Исходник контракта и объяснение
// формулы — в contracts/README.md.
//
// src/contracts/BondingCurve.ts сгенерирован компилятором Tact из
// contracts/src/bonding_curve.tact и содержит код контракта вместе с
// точной раскладкой init-данных. Править его руками нельзя — он
// перегенерируется командой `npm run build` в папке contracts и
// копируется сюда.

import { Address, beginCell, toNano } from "@ton/core";
import { BondingCurve, storeBuy, storeSetJettonWallet } from "./contracts/BondingCurve";
import { LiquidityPool, storePoolBuy, storeSetCurve } from "./contracts/LiquidityPool";

// Одни и те же числа должны стоять и в деплое, и в предпросчёте цены в
// интерфейсе, иначе показанное «вы получите» разойдётся с тем, что
// реально вернёт контракт.
// Числа подобраны так, чтобы полная распродажа доступного выпуска
// собрала около 1515 TON — столько нужно на заведение пары на DEX.
// Потолок сбора считается как virtualTon × tokensForSale ÷
// (virtualTokens − tokensForSale): при этих значениях выходит ровно
// 1515. Порог выпуска чуть ниже потолка, иначе он был бы недостижим —
// контракт такое сочетание отвергает при создании.
export const CURVE_PARAMS = {
  virtualTon: toNano("291.217"),
  virtualTokens: toNano("1073000000"),
  tokensForSale: toNano("900000000"),
  graduationTon: toNano("1500"),
  // Один процент с сделки — столько же берёт pump.fun. В резерв кривой
  // комиссия не попадает, уходит на кошелёк площадки, поэтому цену не
  // искажает. У токенов, запущенных при другой настройке, останется их
  // ставка: параметры зашиты в контракт навсегда, и предпросчёт берёт
  // feeBps из состояния конкретной кривой, а не отсюда.
  feeBps: 100n,
};

// Весь выпуск токена. Чеканится целиком и целиком уходит на кривую:
// tokensForSale она продаёт, остаток (100 млн) держит до выпуска на DEX
// и отправляет его вместе с собранными TON — из этой пары и собирается
// ликвидность. Раньше чеканился только торговый запас, поэтому общее
// предложение выходило 900 млн вместо миллиарда.
export const CURVE_TOTAL_SUPPLY = toNano("1000000000");

// Контракт удерживает это из каждой покупки на газ: перевод жетонов
// покупателю, отправку комиссии и собственное хранение. Значение обязано
// совпадать с GasBuyOverhead в bonding_curve.tact.
export const CURVE_GAS_BUY_OVERHEAD = toNano("0.12");

// Сколько прикладывать к переводу жетонов при продаже, чтобы кошелёк
// кривой успел прислать ей уведомление. Без forwardTonAmount уведомление
// не отправляется вовсе, и жетоны просто осядут на кривой.
export const CURVE_SELL_FORWARD_TON = toNano("0.08");
export const CURVE_SELL_VALUE = toNano("0.2");

const SELL_OP = 0x53454c4c; // "SELL"

// Адрес кривой считается детерминированно из её параметров, поэтому
// известен ещё до развёртывания — это позволяет в одной транзакции и
// создать жетон, и сразу отправить весь запас на будущий кошелёк кривой.
export async function curveContract({ admin, jettonMaster, feeWallet, graduationDestination }) {
  return await BondingCurve.fromInit(
    typeof admin === "string" ? Address.parse(admin) : admin,
    typeof jettonMaster === "string" ? Address.parse(jettonMaster) : jettonMaster,
    typeof feeWallet === "string" ? Address.parse(feeWallet) : feeWallet,
    typeof graduationDestination === "string" ? Address.parse(graduationDestination) : graduationDestination,
    CURVE_PARAMS.virtualTon,
    CURVE_PARAMS.virtualTokens,
    CURVE_PARAMS.tokensForSale,
    CURVE_PARAMS.graduationTon,
    CURVE_PARAMS.feeBps,
  );
}

export function buildBuyBody({ queryId = 0n, minTokensOut = 0n } = {}) {
  const builder = beginCell();
  storeBuy({ $$type: "Buy", queryId, minTokensOut })(builder);
  return builder.endCell();
}

export function buildSetJettonWalletBody(wallet) {
  const builder = beginCell();
  storeSetJettonWallet({
    $$type: "SetJettonWallet",
    wallet: typeof wallet === "string" ? Address.parse(wallet) : wallet,
  })(builder);
  return builder.endCell();
}

// Полезная нагрузка продажи. Стандарт кладёт forwardPayload как
// Either Cell ^Cell, поэтому перед содержимым идёт бит-признак — кривая
// читает его первым. Без нагрузки продажа тоже пройдёт, просто без
// защиты от проскальзывания.
export function buildSellPayload(minTonOut = 0n) {
  return beginCell()
    .storeBit(false)
    .storeUint(SELL_OP, 32)
    .storeCoins(minTonOut)
    .endCell();
}

// --- предпросчёт цены на клиенте -------------------------------------
// Повторяет математику контракта один в один, включая направление
// округления: контракт округляет в свою пользу, и предпросмотр обязан
// показывать то же самое, иначе сделка будет отклоняться по minTokensOut.

// Параметры конкретной кривой. Состояние, прочитанное из контракта,
// несёт их в себе, и брать нужно именно их: настройки приложения могли
// смениться уже после запуска токена, а в развёрнутом контракте
// остались прежние. Для вызовов без состояния — значения по умолчанию.
export function curveParamsOf(state) {
  return {
    virtualTon: state?.virtualTon ?? CURVE_PARAMS.virtualTon,
    virtualTokens: state?.virtualTokens ?? CURVE_PARAMS.virtualTokens,
    feeBps: state?.feeBps ?? CURVE_PARAMS.feeBps,
  };
}

export function tokensOutFor(state, tonIn) {
  const { realTon, tokensSold } = state;
  const params = curveParamsOf(state);
  if (tonIn <= 0n) return 0n;
  const tonReserve = params.virtualTon + realTon;
  const tokenReserve = params.virtualTokens - tokensSold;
  const k = tonReserve * tokenReserve;
  const out = tokenReserve - k / (tonReserve + tonIn);
  return out > 0n ? out : 0n;
}

export function tonOutFor(state, tokensIn) {
  const { realTon, tokensSold } = state;
  const params = curveParamsOf(state);
  if (tokensIn <= 0n) return 0n;
  const tonReserve = params.virtualTon + realTon;
  const tokenReserve = params.virtualTokens - tokensSold;
  const k = tonReserve * tokenReserve;
  const newTokenReserve = tokenReserve + tokensIn;
  const newTonReserve = (k + newTokenReserve - 1n) / newTokenReserve;
  const out = tonReserve - newTonReserve;
  return out > 0n ? out : 0n;
}

// Цена одного токена в TON при текущем состоянии кривой.
export function curvePriceTon(state) {
  const { realTon, tokensSold } = state;
  const params = curveParamsOf(state);
  const tonReserve = params.virtualTon + realTon;
  const tokenReserve = params.virtualTokens - tokensSold;
  if (tokenReserve <= 0n) return 0;
  return Number(tonReserve) / Number(tokenReserve);
}


/* ---------------------------------------------------------------------
   Пул: рынок токена после того, как кривая отторговала.

   Кривая живёт до порога и отдаёт всё, что собрала, одному получателю.
   Этот получатель — контракт пула, и торговля продолжается в нём: те же
   правила, та же комиссия, только резервы настоящие, без виртуальных.
   Ни бирж, ни ручного заведения пары — всё внутри площадки.

   Адрес пула зависит только от жетона и параметров площадки, поэтому
   известен до развёртывания. Это важно: кривая создаётся с адресом
   пула внутри, и если бы пул, наоборот, знал адрес кривой заранее, ни
   один из двух адресов нельзя было бы вычислить.
--------------------------------------------------------------------- */

// Столько пул удерживает из покупки на газ (GasBuyOverhead в
// liquidity_pool.tact). Числа обязаны совпадать с контрактом.
export const POOL_GAS_BUY_OVERHEAD = toNano("0.12");
export const POOL_SELL_FORWARD_TON = toNano("0.08");
export const POOL_SELL_VALUE = toNano("0.2");

export async function poolContract({ admin, jettonMaster, feeWallet }) {
  return await LiquidityPool.fromInit(
    typeof admin === "string" ? Address.parse(admin) : admin,
    typeof jettonMaster === "string" ? Address.parse(jettonMaster) : jettonMaster,
    typeof feeWallet === "string" ? Address.parse(feeWallet) : feeWallet,
    CURVE_PARAMS.feeBps,
  );
}

export function buildPoolBuyBody({ queryId = 0n, minTokensOut = 0n } = {}) {
  const builder = beginCell();
  storePoolBuy({ $$type: "PoolBuy", queryId, minTokensOut })(builder);
  return builder.endCell();
}

export function buildSetCurveBody(curve) {
  const builder = beginCell();
  storeSetCurve({
    $$type: "SetCurve",
    curve: typeof curve === "string" ? Address.parse(curve) : curve,
  })(builder);
  return builder.endCell();
}

// Предпросчёт по пулу. Формула та же, что у кривой, но резервы берутся
// как есть: виртуальных здесь нет, поэтому цена может и падать.
export function poolTokensOutFor(state, tonIn) {
  if (!state || tonIn <= 0n) return 0n;
  const { tonReserve, tokenReserve } = state;
  if (tonReserve <= 0n || tokenReserve <= 0n) return 0n;
  const k = tonReserve * tokenReserve;
  const out = tokenReserve - k / (tonReserve + tonIn);
  return out > 0n ? out : 0n;
}

export function poolTonOutFor(state, tokensIn) {
  if (!state || tokensIn <= 0n) return 0n;
  const { tonReserve, tokenReserve } = state;
  if (tonReserve <= 0n || tokenReserve <= 0n) return 0n;
  const k = tonReserve * tokenReserve;
  const newTokenReserve = tokenReserve + tokensIn;
  const newTonReserve = (k + newTokenReserve - 1n) / newTokenReserve;
  const out = tonReserve - newTonReserve;
  return out > 0n ? out : 0n;
}

export function poolPriceTon(state) {
  if (!state) return 0;
  const { tonReserve, tokenReserve } = state;
  if (!tokenReserve || tokenReserve <= 0n) return 0;
  return Number(tonReserve) / Number(tokenReserve);
}
