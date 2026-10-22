/* История цены пула биржи — продолжение графика после выхода с кривой.
 *
 * История кривой собирается из её сделок, а после выхода сделки идут в
 * пуле биржи. В mainnet их видит GeckoTerminal, в testnet — никто, а
 * новый пул и в mainnet появляется там не сразу. Поэтому сервер сам
 * раз в двадцать секунд записывает цену каждого пула площадки (резервы
 * из api/dex-pool.js) и отдаёт ряд точек — график дорисовывает свечи
 * после последней свечи кривой, одной линией.
 *
 * Запрос: GET /api/dex-history?token=<адрес токена>
 * Ответ:  { points: [[мс, цена в монете сети], ...] }
 */
import fs from "node:fs";
import path from "node:path";

const КАТАЛОГ = process.env.LIVE_STATE_DIR || path.join(process.cwd(), ".state");
const ФАЙЛ = path.join(КАТАЛОГ, "dex-history.json");
const ГЛУБИНА_МС = 3 * 24 * 3600 * 1000;
let история = {};
try { история = JSON.parse(fs.readFileSync(ФАЙЛ, "utf8")) || {}; } catch { /* файла ещё нет */ }

export function записатьЦенуПула(адрес, цена) {
  if (!адрес || !(цена > 0)) return;
  const ряд = история[адрес] || (история[адрес] = []);
  const сейчас = Date.now();
  const последняя = ряд[ряд.length - 1];
  // Цена не менялась — точку не плодим, кроме раза в пять минут: иначе
  // спокойный пул выглядел бы дырой на графике.
  if (последняя && последняя[1] === цена && сейчас - последняя[0] < 300_000) return;
  ряд.push([сейчас, цена]);
  while (ряд.length && сейчас - ряд[0][0] > ГЛУБИНА_МС) ряд.shift();
}

let сохранено = 0;
export function сохранитьИсторию() {
  if (Date.now() - сохранено < 30_000) return;
  сохранено = Date.now();
  try { fs.mkdirSync(КАТАЛОГ, { recursive: true }); } catch { /* есть */ }
  fs.writeFile(ФАЙЛ, JSON.stringify(история), () => {});
}

export default async function handler(req, res) {
  const адрес = String((req.query && req.query.token) || "").trim();
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ points: (адрес && история[адрес]) || [] });
}
