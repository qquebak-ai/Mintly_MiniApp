/* Покупка токена прямо из чата.
 *
 * Подписать сделку может только кошелёк человека, поэтому бот ничего не
 * отправляет в цепочку сам и ключей не держит: он лишь собирает готовую
 * ссылку, которую кошелёк открывает с уже заполненными полями — адрес
 * кривой, сумма и тело сообщения «Buy». Человек видит в кошельке, что
 * подписывает, и подтверждает сам.
 *
 * Тело собирается здесь руками, а не через сгенерированный компилятором
 * Tact враппер: тот лежит в TypeScript, и серверной функции его не
 * импортировать. Числа обязаны совпадать с contracts/bonding_curve.tact
 * и src/curveConfig.js — при смене формата сообщения правится и здесь.
 */

import { Address, beginCell, toNano } from "@ton/core";

// Оп-код Buy из BondingCurve.ts (storeBuy).
const OP_BUY = 1112889633;

// Столько кривая удерживает из каждой покупки на газ: перевод жетонов
// покупателю, комиссию площадки и собственное хранение. То же значение —
// в CURVE_GAS_BUY_OVERHEAD.
const GAS_BUY_OVERHEAD = toNano("0.12");

export function buyBody({ queryId = 0n, minTokensOut = 0n } = {}) {
  return beginCell()
    .storeUint(OP_BUY, 32)
    .storeUint(queryId, 64)
    .storeCoins(minTokensOut)
    .endCell();
}

/* Ссылка в кошелёк на покупку за указанную сумму.
 *
 * Сейчас не используется: кошельки открывают такую ссылку как простой
 * перевод и тело сообщения не разбирают — в цепочке это видно как
 * приход с пустым op и отказом 130. Покупку подписывает приложение
 * через TonConnect. Функция оставлена как готовая сборка сообщения на
 * случай, если появится кошелёк, который ссылку разбирает целиком.
 *
 * Universal link Tonkeeper, а не ton://: кнопки Telegram пускают только
 * http(s) и tg://, а собственную схему кошелька отбивают. Tonkeeper
 * разбирает такую ссылку сам, а на телефоне без него она открывается
 * страницей с выбором кошелька.
 *
 * minTokensOut оставляем нулевым намеренно: сколько токенов вернёт
 * кривая, зависит от того, кто успеет купить раньше, а посчитанная в
 * чате защита от проскальзывания устарела бы к моменту подписи. Кто
 * хочет её задать — покупает в приложении.
 */
export function buyLink(curveAddress, tonAmount) {
  if (!curveAddress || !(tonAmount > 0)) return null;
  let адрес;
  try {
    // Адрес кривой — обязательно bounceable («EQ…»). На
    // non-bounceable контракт не вернёт деньги, если сообщение ему не
    // подойдёт, а само сообщение кошелёк отправит как простой перевод.
    адрес = Address.parse(curveAddress).toString({ bounceable: true });
  } catch (err) {
    return null;
  }
  const сумма = toNano(String(tonAmount)) + GAS_BUY_OVERHEAD;
  return `https://app.tonkeeper.com/transfer/${адрес}?amount=${сумма.toString()}&bin=${base64url(buyBody())}`;
}

/* Тело сообщения для ссылки. Обычный base64 сюда не годится: плюсы и
   косые черты в адресной строке переживают не все кошельки, и вместо
   покупки уходит пустой перевод — контракт его отбивает, а человек
   видит «Неуспешно». */
export function base64url(cell) {
  return cell.toBoc().toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Сколько токенов вернёт кривая за столько-то TON. Формула — та же, что
   в контракте и в приложении (tokensOutFor): резервы перемножаются,
   произведение держится постоянным. Комиссию площадки и газ вычитаем до
   расчёта, иначе обещанное разойдётся с тем, что придёт на кошелёк. */
export function tokensOutFor(state, tonIn) {
  if (!state || tonIn <= 0n) return 0n;
  const tonReserve = state.virtualTon + state.realTon;
  const tokenReserve = state.virtualTokens - state.tokensSold;
  const k = tonReserve * tokenReserve;
  const out = tokenReserve - k / (tonReserve + tonIn);
  return out > 0n ? out : 0n;
}

/* Оценка покупки на указанную сумму: сколько уйдёт на газ и комиссию и
   сколько токенов останется человеку. */
export function оценкаПокупки(state, tonAmount, feeBps = (state && state.feeBps) ?? 0n) {
  const всего = toNano(String(tonAmount));
  const комиссия = (всего * feeBps) / 10000n;
  const чисто = всего - комиссия;
  const токенов = tokensOutFor(state, чисто);
  return {
    всегоTon: Number(всего + GAS_BUY_OVERHEAD) / 1e9,
    комиссияTon: Number(комиссия) / 1e9,
    газTon: Number(GAS_BUY_OVERHEAD) / 1e9,
    токенов: Number(токенов) / 1e9,
  };
}

// Суммы для быстрой покупки. Ровно три: длинный ряд кнопок в чате
// выглядит как форма, а не как «купить и пойти дальше».
export const БЫСТРЫЕ_СУММЫ = [1, 5, 10];


/* То же самое для собственного пула: формула общая, но резервы у него
   настоящие — виртуальных нет, поэтому цена может и падать. */
export function poolTokensOutFor(state, tonIn) {
  if (!state || tonIn <= 0n) return 0n;
  const { tonReserve, tokenReserve } = state;
  if (tonReserve <= 0n || tokenReserve <= 0n) return 0n;
  const k = tonReserve * tokenReserve;
  const out = tokenReserve - k / (tonReserve + tonIn);
  return out > 0n ? out : 0n;
}

export function оценкаПокупкиВПуле(state, tonAmount, feeBps = (state && state.feeBps) ?? 0n) {
  const всего = toNano(String(tonAmount));
  const комиссия = (всего * feeBps) / 10000n;
  const чисто = всего - комиссия;
  const токенов = poolTokensOutFor(state, чисто);
  return {
    всегоTon: Number(всего + GAS_BUY_OVERHEAD) / 1e9,
    комиссияTon: Number(комиссия) / 1e9,
    газTon: Number(GAS_BUY_OVERHEAD) / 1e9,
    токенов: Number(токенов) / 1e9,
  };
}
