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

/* Демо-токен: сделок на нём нет ни в одной сети — их каждые 0,3 с
   разыгрывает сам сервер, той же формулой кривой, что у настоящих
   (x·y = k на виртуальных резервах Solana). Нужен, чтобы видеть, как
   быстро лента, шапка и график успевают за плотной торговлей. Живёт в
   ленте TON, поэтому и резервы как у кривой TON: 1000 монет виртуально. */
export const ДЕМО_MINT = "MintDemo1111111111111111111111111111111111";
const ДЕМО_ШАГ_МС = 300;
const ДЕМО_V_SOL = 1000;
const ДЕМО_V_TOK = 1_073_000_000;
const демо = { realSol: 400, sold: 0, прошлый: 0 };
демо.sold = ДЕМО_V_TOK - (ДЕМО_V_SOL * ДЕМО_V_TOK) / (ДЕМО_V_SOL + демо.realSol);
function записатьДемо() {
  записатьЖивое(ДЕМО_MINT, {
    price: (ДЕМО_V_SOL + демо.realSol) / (ДЕМО_V_TOK - демо.sold),
    raised: демо.realSol, sold: демо.sold, graduation: 1500, graduated: false,
  });
}
function шагДемо() {
  const сейчас = Date.now();
  // Никто не смотрел дольше трёх секунд — не догоняем пропущенное разом.
  if (!демо.прошлый || сейчас - демо.прошлый > 3000) { демо.прошлый = сейчас - ДЕМО_ШАГ_МС; if (!прочитатьЖивое(ДЕМО_MINT)) записатьДемо(); }
  let шагов = Math.floor((сейчас - демо.прошлый) / ДЕМО_ШАГ_МС);
  демо.прошлый += шагов * ДЕМО_ШАГ_МС;
  while (шагов-- > 0) {
    // Тянет к середине пути: собранное гуляет между 100 и 1400 монет, а
    // не уходит в ноль или к выходу на биржу.
    const покупка = Math.random() < (демо.realSol < 300 ? 0.6 : демо.realSol > 1200 ? 0.4 : 0.52);
    const сумма = 0.5 + Math.random() ** 2 * 40;
    if (покупка) {
      демо.realSol += сумма;
    } else {
      демо.realSol = Math.max(100, демо.realSol - сумма);
    }
    // Продано — по той же кривой: x·y = k, где k = V_SOL · V_TOK.
    демо.sold = ДЕМО_V_TOK - (ДЕМО_V_SOL * ДЕМО_V_TOK) / (ДЕМО_V_SOL + демо.realSol);
    записатьДемо();
  }
}

const адресSol = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const адресTon = (s) => /^-?\d:[0-9a-fA-F]{64}$/.test(s) || /^[A-Za-z0-9_-]{48}$/.test(s);

const опросTon = new Map(); // адрес -> { спрошено, идёт }
let tonВРаботе = 0;
/* Общий бюджет на tonapi: лимит у ключа один на весь сервер, и десять
   кривых по разу в 0,4 с упирались в 429 — отказ не приносил ничего.
   TON_LIVE_RPS запросов в секунду на всех (по умолчанию 4); кривые
   берутся по очереди, самая давняя — первой. */
const TON_RPS = Math.max(1, Number(process.env.TON_LIVE_RPS) || 4);
let tonПоследний = 0;

async function перечитатьTon(адрес) {
  let з = опросTon.get(адрес);
  if (!з) { з = { спрошено: 0, идёт: false }; опросTon.set(адрес, з); }
  if (з.идёт || Date.now() - з.спрошено < ШАГ_TON_МС || tonВРаботе >= МАКС_TON_РАЗОМ) return;
  if (Date.now() - tonПоследний < 1000 / TON_RPS) return;
  tonПоследний = Date.now();
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

  const сДемо = String((req.query && req.query.demo) || "") === "1";
  if (сДемо) шагДемо();
  sol.forEach((mint) => держатьКривую(mint));
  // Не ждём: отвечаем тем, что уже есть, а свежее заберёт следующий опрос.
  // Самая давно читанная — первой: так бюджет делится по кругу.
  [...ton].sort((a, b) => ((опросTon.get(a) || {}).спрошено || 0) - ((опросTon.get(b) || {}).спрошено || 0))
    .forEach((адрес) => { перечитатьTon(адрес); });

  const кривые = {};
  const сделки = {};
  for (const ключ of [...sol, ...ton, ...(сДемо ? [ДЕМО_MINT] : [])]) {
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
