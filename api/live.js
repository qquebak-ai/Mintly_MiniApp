/* Частый опрос живых кривых: цена, собранное и свежие сделки.
 *
 *   GET /api/live?sol=<mint,…>&ton=<адрес кривой,…>
 *
 * Отвечает из памяти сервера (api/_live.js), поэтому его можно звать
 * каждые 0,3 секунды. Solana приходит потоком от узла — там задержка
 * равна времени блока. TON потока цен не даёт: состояние кривой сервер
 * перечитывает сам, не чаще TON_LIVE_MS на кривую (по умолчанию раз в
 * 0,4 с) — чаще не пустит лимит ключа tonapi.
 *
 * Переменные окружения: TONAPI_KEY, TON_LIVE_MS.
 */

import { прочитатьЖивое, записатьЖивое } from "./_live.js";
import { держатьКривую } from "./curve-stream.js";

const ШАГ_TON_МС = Math.max(200, Number(process.env.TON_LIVE_MS) || 400);
const МАКС_КРИВЫХ_В_ЗАПРОСЕ = 60;
// Сколько запросов к tonapi разом: лимит ключа общий на весь сервер.
const МАКС_TON_РАЗОМ = 4;

const адресSol = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const адресTon = (s) => /^-?\d:[0-9a-fA-F]{64}$/.test(s) || /^[A-Za-z0-9_-]{48}$/.test(s);

const опросTon = new Map(); // адрес -> { спрошено, идёт }
let tonВРаботе = 0;

async function перечитатьTon(адрес) {
  let з = опросTon.get(адрес);
  if (!з) { з = { спрошено: 0, идёт: false }; опросTon.set(адрес, з); }
  if (з.идёт || Date.now() - з.спрошено < ШАГ_TON_МС || tonВРаботе >= МАКС_TON_РАЗОМ) return;
  з.идёт = true;
  з.спрошено = Date.now();
  tonВРаботе += 1;
  try {
    const { состояние, цена, DEFAULT_VIRTUAL_TON, DEFAULT_VIRTUAL_TOKENS } = await import("./refresh-curves.js");
    const st = await состояние(адрес);
    if (!st) return;
    const params = { virtualTon: st.virtualTon || DEFAULT_VIRTUAL_TON, virtualTokens: st.virtualTokens || DEFAULT_VIRTUAL_TOKENS };
    записатьЖивое(адрес, {
      price: цена(st.realTon, params),
      raised: Number(st.realTon) / 1e9,
      sold: Number(st.tokensSold) / 1e9,
      graduation: Number(st.graduationTon) / 1e9,
      graduated: !!st.graduated,
    });
  } catch { /* сеть не ответила — отдадим прежнее */ } finally {
    з.идёт = false;
    tonВРаботе -= 1;
  }
}

function список(строка, проверка) {
  return [...new Set(String(строка || "").split(",").map((с) => с.trim()).filter(проверка))].slice(0, МАКС_КРИВЫХ_В_ЗАПРОСЕ);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const sol = список(req.query && req.query.sol, адресSol);
  const ton = список(req.query && req.query.ton, адресTon);

  sol.forEach((mint) => держатьКривую(mint));
  // Не ждём: отвечаем тем, что уже есть, а свежее заберёт следующий опрос.
  ton.forEach((адрес) => { перечитатьTon(адрес); });

  const кривые = {};
  const сделки = {};
  for (const ключ of [...sol, ...ton]) {
    const з = прочитатьЖивое(ключ);
    if (!з || !з.событие) continue;
    const с = з.событие;
    кривые[ключ] = {
      price: с.price, raised: с.raised, sold: с.sold != null ? с.sold : null,
      graduation: с.graduation != null ? с.graduation : null,
      graduated: !!с.graduated, ms: с.ms,
      // Резервы Solana — график считает цену по ним, той же формулой,
      // что и весь ряд свечей; готовое число дало бы скачки свечи.
      ...(с.vSol != null ? { vSol: с.vSol, vTokens: с.vTokens, realSol: с.realSol } : null),
    };
    if (з.сделки.length) сделки[ключ] = з.сделки.slice(0, 30);
  }
  return res.status(200).json({ at: Date.now(), curves: кривые, trades: сделки });
}
