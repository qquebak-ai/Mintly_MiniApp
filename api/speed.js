/* Скорость сделки — таблица для приложения: сколько стоит «Быстро» и
 * «Молния» в каждой сети и из чего складывается доплата.
 *
 *   GET /api/speed
 *
 * Открытая и кешируемая: в ней нет ничего, кроме цен. Сами цены — в
 * api/_speed.js (наценка площадке) и api/solana-launch.js (чаевые сети
 * Solana); в EVM сетевая часть — множитель чаевых, её размер решает сеть.
 */

import { НАЦЕНКА, СКОРОСТИ } from "./_speed.js";

export default async function handler(req, res) {
  let sol = { jito: false, сети: { normal: 0, fast: 0, turbo: 0 } };
  try {
    const { СКОРОСТИ: ТЕМП_SOL, ОСНОВНАЯ_СЕТЬ, ЕДИНИЦ_НА_СДЕЛКУ } = await import("./solana-launch.js");
    const надбавка = (с) => (ТЕМП_SOL[с].цена * ЕДИНИЦ_НА_СДЕЛКУ) / 1e6 / 1e9;
    const сети = Object.fromEntries(СКОРОСТИ.map((с) => [с,
      // Сверх обычной надбавки: она есть у любой сделки и входит в комиссию сети.
      Math.max(0, надбавка(с) - надбавка("normal")) + (ОСНОВНАЯ_СЕТЬ ? ТЕМП_SOL[с].чаевые : 0)]));
    sol = { jito: !!ОСНОВНАЯ_СЕТЬ, сети };
  } catch { /* кошелёк Solana не настроен — только наценка */ }
  const сети = {
    solana: sol.сети,
    ton: { normal: 0, fast: 0, turbo: 0 },
  };
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).json({
    speeds: СКОРОСТИ,
    markup: НАЦЕНКА,
    network: сети,
    // Множитель чаевых валидатору в EVM: сумму решает сеть в момент сделки.
    evmTip: { normal: 1, fast: 2, turbo: 4 },
    jito: sol.jito,
  });
}
