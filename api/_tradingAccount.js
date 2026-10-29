/* Торговый счёт — второй счёт человека в приложении, только для биржи.
 *
 * Зачем он. Раньше сделка на бирже брала деньги прямо с карты: SOL уходил
 * по мосту Unit на Hyperliquid, там продавался в доллары, и только потом
 * открывалась позиция — минуты ожидания и минимум 0.12 SOL. А SOL из
 * девнета мост не принимает вовсе, поэтому позиция с тестовым SOL не
 * открывалась никогда. Теперь деньги переводятся на торговый счёт заранее
 * (кнопкой под картой в кошельке), а позиция открывается с него сразу —
 * без моста и без ожидания сети.
 *
 * В тестовых сетях счёт учебный: долларовый остаток ведёт сам сервер, а
 * цены настоящие — с основной Hyperliquid. Пополняется он девнет-SOL с
 * карты по живому курсу (api/_tradingTransfer.js), выводится обратно так
 * же. Позиции, тейк, стоп и ликвидация считаются здесь по правилам самой
 * биржи: маржа изолированная, поддерживающая маржа — половина от
 * 1/максимального плеча, комиссия за вход и за выход.
 *
 * Сохранность — то, ради чего модуль устроен именно так:
 *  - Изменения счёта синхронные: проверка «хватает ли» и списание идут без
 *    await между ними. Два одновременных запроса не проходят по одному и
 *    тому же остатку — второй видит уже списанное.
 *  - Изменение сначала ложится на диск (свой файл на человека, через
 *    временный файл, fsync и переименование) и только потом считается
 *    сделанным. Не записалось — счёт остаётся прежним, а человек видит
 *    ошибку, а не сделку, которой после перезапуска не окажется.
 *  - Деньги — целыми микродолларами: дроби не копятся от сделки к сделке.
 *    Округление — в пользу счёта площадки: прибыль вниз, комиссия вверх.
 *  - Ключ запроса: повтор того же нажатия возвращает прежний ответ, а не
 *    вторую сделку.
 *  - Убыток не больше залога: позиция закрывается ликвидацией, пока у неё
 *    ещё есть поддерживающая маржа. Остаток залога ликвидированной позиции
 *    уходит в страховой запас — он и покрывает редкий скачок цены за
 *    точку банкротства. Остаток счёта человека в минус не уходит никогда.
 *  - Цены только серверные: цену из запроса здесь не принимают вовсе.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const КАТАЛОГ = path.join(process.env.LIVE_STATE_DIR || path.join(process.cwd(), ".state"), "trading");

// Как у Hyperliquid на базовом уровне: 0.045% с объёма за вход и за выход.
export const КОМИССИЯ = 0.00045;
/* Полспреда к цене середины: заявка «по рынку» на настоящей бирже берёт
   встречную цену, а не середину. Без этого вход и выход по одной и той же
   середине позволяли бы зарабатывать на задержке цены, которой у живого
   стакана нет. */
export const СПРЕД = 0.0001;
// Меньше $10 объёма Hyperliquid не принимает — учебный счёт учит тому же.
export const МИН_ОБЪЁМ = 10;
export const МИН_ЗАЛОГ = 1;
const ПОЗИЦИЙ_НЕ_БОЛЬШЕ = 25;
const ЖУРНАЛ = 200;
const КЛЮЧЕЙ = 300;
const М = 1e6;

const вДоллары = (м) => Math.round(м) / М;
const ошибка = (код, сверх = {}) => Object.assign(new Error(код), { код: 400, ...сверх });
const новыйИд = () => crypto.randomBytes(8).toString("hex");

let люди = null;               // uid -> счёт
let касса = null;              // { комиссии, страховка } — микродоллары
const испорчены = new Set();   // файлы, которые не прочитались: такие счета не трогаем
const поМонетам = new Map();   // монета -> Set(uid) с открытой позицией
const тейкиБоевые = new Map(); // монета -> Set(uid) с тейком или стопом на настоящей бирже
let слушатель = null;

/* --- Диск ------------------------------------------------------------- */

const кодЧеловека = (uid) => {
  const s = String(uid || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw Object.assign(new Error("bad_user"), { код: 400 });
  return s.toLowerCase();
};
const файлЧеловека = (uid) => path.join(КАТАЛОГ, `${uid}.json`);
const ФАЙЛ_КАССЫ = () => path.join(КАТАЛОГ, "_kassa.json");

function записать(файл, данные) {
  fs.mkdirSync(КАТАЛОГ, { recursive: true, mode: 0o700 });
  const врем = `${файл}.${process.pid}.tmp`;
  const fd = fs.openSync(врем, "w", 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(данные));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(врем, файл);
  // Переименование тоже должно дожить до диска — иначе после сбоя питания
  // на месте файла мог остаться прежний.
  try { const к = fs.openSync(КАТАЛОГ, "r"); try { fs.fsyncSync(к); } finally { fs.closeSync(к); } } catch { /* не везде можно */ }
}

function новыйСчёт() {
  return { v: 1, cash: 0, pos: {}, log: [], keys: {}, ждут: [], tpsl: {}, ввод: 0, вывод: 0, создан: Date.now() };
}
function починить(с) {
  const н = новыйСчёт();
  for (const к of Object.keys(н)) if (с[к] === undefined) с[к] = н[к];
  return с;
}

function загрузить() {
  if (люди) return;
  люди = new Map();
  try {
    касса = JSON.parse(fs.readFileSync(ФАЙЛ_КАССЫ(), "utf8"));
  } catch {
    касса = { комиссии: 0, страховка: 0 };
  }
  let имена = [];
  try { имена = fs.readdirSync(КАТАЛОГ); } catch { /* каталога ещё нет — счетов тоже */ }
  for (const имя of имена) {
    const м = /^([0-9a-f-]{36})\.json$/i.exec(имя);
    if (!м) continue;
    const uid = м[1].toLowerCase();
    try {
      const с = JSON.parse(fs.readFileSync(path.join(КАТАЛОГ, имя), "utf8"));
      if (!с || typeof с.cash !== "number") throw new Error("не счёт");
      люди.set(uid, починить(с));
    } catch (e) {
      /* Файл есть, а не читается — счёт не пустой, а недоступный. Новый
         поверх него завести нельзя: так пропал бы настоящий остаток. */
      испорчены.add(uid);
      console.warn("[торговый счёт] не читается", имя, e && e.message);
    }
  }
  for (const [uid, с] of люди) переиндексировать(uid, null, с);
}

function переиндексировать(uid, было, стало) {
  const старые = new Set(Object.keys((было && было.pos) || {}));
  const новые = new Set(Object.keys((стало && стало.pos) || {}));
  for (const coin of старые) if (!новые.has(coin)) {
    const н = поМонетам.get(coin);
    if (н) { н.delete(uid); if (!н.size) поМонетам.delete(coin); }
  }
  for (const coin of новые) {
    if (!поМонетам.has(coin)) поМонетам.set(coin, new Set());
    поМонетам.get(coin).add(uid);
  }
  const тб = new Set(Object.keys((было && было.tpsl) || {}));
  const тн = new Set(Object.keys((стало && стало.tpsl) || {}));
  for (const coin of тб) if (!тн.has(coin)) {
    const н = тейкиБоевые.get(coin);
    if (н) { н.delete(uid); if (!н.size) тейкиБоевые.delete(coin); }
  }
  for (const coin of тн) {
    if (!тейкиБоевые.has(coin)) тейкиБоевые.set(coin, new Set());
    тейкиБоевые.get(coin).add(uid);
  }
}

/* Одно изменение счёта. Работаем над копией: исключение посреди дела
   (не хватило денег, неверный стоп) не оставляет счёт наполовину
   изменённым, а неудачная запись на диск — тем более. */
function изменить(uid0, дело) {
  загрузить();
  const uid = кодЧеловека(uid0);
  if (испорчены.has(uid)) throw Object.assign(new Error("account_unavailable"), { код: 503 });
  const было = люди.get(uid) || null;
  const копия = было ? structuredClone(было) : новыйСчёт();
  const кассаКопия = { ...касса };
  const итог = дело(копия, кассаКопия);
  копия.обновлён = Date.now();
  try {
    записать(файлЧеловека(uid), копия);
    if (кассаКопия.комиссии !== касса.комиссии || кассаКопия.страховка !== касса.страховка) записать(ФАЙЛ_КАССЫ(), кассаКопия);
  } catch (e) {
    console.warn("[торговый счёт] запись не удалась", e && e.message);
    throw Object.assign(new Error("storage"), { код: 503 });
  }
  люди.set(uid, копия);
  касса = кассаКопия;
  переиндексировать(uid, было, копия);
  if (слушатель) { try { слушатель(uid); } catch { /* не мешаем счёту */ } }
  return итог;
}

function запомнитьКлюч(с, ключ, ответ) {
  if (!ключ) return;
  с.keys[ключ] = { at: Date.now(), ответ };
  const ключи = Object.entries(с.keys);
  if (ключи.length > КЛЮЧЕЙ) {
    ключи.sort((а, б) => а[1].at - б[1].at);
    for (const [к] of ключи.slice(0, ключи.length - КЛЮЧЕЙ)) delete с.keys[к];
  }
}
const ключОк = (ключ) => (ключ == null || ключ === "" ? null : String(ключ).slice(0, 80));

function записьВЖурнал(с, событие) {
  const з = { id: новыйИд(), at: Date.now(), ...событие };
  с.log.unshift(з);
  if (с.log.length > ЖУРНАЛ) с.log.length = ЖУРНАЛ;
  return з;
}

/* --- Расчёты позиции ---------------------------------------------------- */

/* Цена ликвидации изолированной позиции: где капитал позиции (залог плюс
   прибыль) сравнивается с поддерживающей маржой mmr × объём по текущей
   цене. Для лонга при плече 1× она нулевая — такой лонг не ликвидируется. */
export function ценаЛиквидации(сторона, вход, размер, залог, mmr) {
  if (!(размер > 0)) return 0;
  if (сторона > 0) {
    const п = (вход - залог / размер) / (1 - mmr);
    return п > 0 ? п : 0;
  }
  return (вход + залог / размер) / (1 + mmr);
}
const поддержка = (макс) => 1 / (2 * Math.max(1, Number(макс) || 1));

function проверитьТейк(п, tp, цена) {
  if (tp === undefined) return п.tp ?? null;
  if (tp === null || tp === "" || Number(tp) === 0) return null;
  const v = Number(tp);
  if (!(v > 0) || !Number.isFinite(v)) throw ошибка("bad_tp");
  if (п.side > 0 ? v <= цена : v >= цена) throw ошибка("tp_side");
  return v;
}
function проверитьСтоп(п, sl, цена) {
  if (sl === undefined) {
    // Позицию добрали — ликвидация сдвинулась; стоп за ней больше не
    // сработает раньше неё и только вводил бы в заблуждение.
    const был = п.sl ?? null;
    if (был && п.liq > 0 && (п.side > 0 ? был <= п.liq : был >= п.liq)) return null;
    return был;
  }
  if (sl === null || sl === "" || Number(sl) === 0) return null;
  const v = Number(sl);
  if (!(v > 0) || !Number.isFinite(v)) throw ошибка("bad_sl");
  if (п.side > 0 ? v >= цена : v <= цена) throw ошибка("sl_side");
  if (п.liq > 0 && (п.side > 0 ? v <= п.liq : v >= п.liq)) throw ошибка("sl_beyond_liq", { liq: п.liq });
  return v;
}

function видПозиции(п, цена) {
  const ц = цена > 0 ? цена : п.entry;
  const pnl = п.side * п.size * (ц - п.entry);
  const залог = вДоллары(п.margin);
  return {
    coin: п.coin, asset: п.asset, name: п.name, dex: п.dex,
    size: п.side * п.size, entry: п.entry, price: ц, pnl,
    roe: залог > 0 ? pnl / залог : 0,
    value: п.size * ц, leverage: Math.round(п.lev * 10) / 10,
    liquidation: п.liq > 0 ? п.liq : null, margin: залог,
    tp: п.tp ?? null, sl: п.sl ?? null, openedAt: п.at,
  };
}

/* --- Сделки ------------------------------------------------------------- */

/* Открыть позицию или добрать ту же сторону. Цена — серверная середина
   рынка в эту минуту; исполнение — на полспреда хуже, как у заявки «по
   рынку». Встречная сторона при открытой позиции не принимается: учебный
   счёт держит одну позицию на рынок, чтобы итог каждой был виден. */
export function открыть(uid, { рынок, цена, isBuy, usd, плечо, tp, sl, ключ }) {
  const к0 = ключОк(ключ);
  return изменить(uid, (с, касса) => {
    if (к0 && с.keys[к0]) return с.keys[к0].ответ;
    if (!рынок || !рынок.coin) throw ошибка("no_market");
    if (!(цена > 0)) throw Object.assign(new Error("price_stale"), { код: 503 });
    const сторона = isBuy ? 1 : -1;
    const макс = Math.max(1, Number(рынок.maxLeverage) || 1);
    const пл = Math.max(1, Math.min(макс, Math.round(Number(плечо) || 1)));
    const хочет = Math.floor((Number(usd) || 0) * 100) / 100;
    if (!(хочет >= МИН_ЗАЛОГ)) throw ошибка("min_margin");
    const исполнение = цена * (1 + сторона * СПРЕД);
    const шаг = 10 ** Math.max(0, Number(рынок.szDecimals) || 0);
    const размер = Math.floor(((хочет * пл) / исполнение) * шаг + 1e-9) / шаг;
    if (!(размер > 0)) throw ошибка("too_small");
    const объём = размер * исполнение;
    if (объём < МИН_ОБЪЁМ) throw ошибка("min_10_usd");
    const залогµ = Math.ceil((объём / пл) * М);
    const комиссияµ = Math.ceil(объём * КОМИССИЯ * М);
    if (с.cash < залогµ + комиссияµ) throw ошибка("not_enough", { нужно: вДоллары(залогµ + комиссияµ), есть: вДоллары(с.cash) });
    const было = с.pos[рынок.coin] || null;
    if (было && было.side !== сторона) throw ошибка("opposite_position");
    if (!было && Object.keys(с.pos).length >= ПОЗИЦИЙ_НЕ_БОЛЬШЕ) throw ошибка("too_many_positions");
    let п;
    if (было) {
      const всего = было.size + размер;
      п = {
        ...было,
        size: Math.round(всего * шаг) / шаг,
        entry: (было.size * было.entry + размер * исполнение) / всего,
        margin: было.margin + залогµ,
        fees: (было.fees || 0) + комиссияµ,
      };
    } else {
      п = {
        id: новыйИд(), coin: рынок.coin, asset: рынок.asset, name: рынок.name || рынок.coin, dex: рынок.dex || "",
        side: сторона, size: размер, entry: исполнение, margin: залогµ, fees: комиссияµ,
        mmr: поддержка(макс), szDecimals: Number(рынок.szDecimals) || 0, at: Date.now(), tp: null, sl: null,
      };
    }
    п.lev = (п.size * п.entry) / вДоллары(п.margin);
    п.liq = ценаЛиквидации(п.side, п.entry, п.size, вДоллары(п.margin), п.mmr);
    п.tp = проверитьТейк(п, tp, цена);
    п.sl = проверитьСтоп(п, sl, цена);
    с.cash -= залогµ + комиссияµ;
    касса.комиссии += комиссияµ;
    с.pos[рынок.coin] = п;
    записьВЖурнал(с, {
      kind: "open", add: !!было, coin: п.coin, name: п.name, dex: п.dex, side: сторона,
      size: размер, price: исполнение, margin: вДоллары(залогµ), lev: пл, fee: вДоллары(комиссияµ),
      tp: п.tp, sl: п.sl,
    });
    const ответ = {
      ok: true, position: видПозиции(п, цена),
      fill: { price: исполнение, size: размер, fee: вДоллары(комиссияµ), margin: вДоллары(залогµ), add: !!было },
      cash: вДоллары(с.cash),
    };
    запомнитьКлюч(с, к0, ответ);
    return ответ;
  });
}

function закрытьВнутри(с, касса, coin, цена, причина) {
  const п = с.pos[coin];
  if (!п) throw ошибка("no_position");
  if (!(цена > 0)) throw Object.assign(new Error("price_stale"), { код: 503 });
  const исполнение = причина === "liq" ? цена : цена * (1 - п.side * СПРЕД);
  const pnlµ = Math.floor(п.side * п.size * (исполнение - п.entry) * М);
  let комиссияµ = 0;
  let выплатаµ = 0;
  if (причина === "liq") {
    // Остаток залога (обычно та самая поддерживающая маржа) — в страховой
    // запас: он покрывает скачки цены за точку банкротства у других.
    касса.страховка += п.margin + pnlµ;
  } else {
    комиссияµ = Math.ceil(п.size * исполнение * КОМИССИЯ * М);
    const чисто = п.margin + pnlµ - комиссияµ;
    if (чисто < 0) касса.страховка += чисто; else выплатаµ = чисто;
    касса.комиссии += комиссияµ;
  }
  с.cash += выплатаµ;
  delete с.pos[coin];
  const итогµ = выплатаµ - п.margin;
  const событие = записьВЖурнал(с, {
    kind: причина, coin: п.coin, name: п.name, dex: п.dex, side: п.side, size: п.size,
    price: исполнение, entry: п.entry, margin: вДоллары(п.margin), lev: Math.round(п.lev * 10) / 10,
    pnl: вДоллары(итогµ), fee: вДоллары(комиссияµ), payout: вДоллары(выплатаµ),
  });
  return { ok: true, reason: причина, pnl: вДоллары(итогµ), payout: вДоллары(выплатаµ), price: исполнение, event: событие, cash: вДоллары(с.cash) };
}

export function закрыть(uid, { coin, цена, причина = "close", ключ }) {
  const к0 = ключОк(ключ);
  return изменить(uid, (с, касса) => {
    if (к0 && с.keys[к0]) return с.keys[к0].ответ;
    const ответ = закрытьВнутри(с, касса, coin, цена, причина);
    запомнитьКлюч(с, к0, ответ);
    return ответ;
  });
}

/* Тейк и стоп открытой позиции: число — поставить, null — снять,
   undefined — оставить как есть. */
export function тейкСтоп(uid, { coin, цена, tp, sl }) {
  return изменить(uid, (с) => {
    const п = с.pos[coin];
    if (!п) throw ошибка("no_position");
    if (!(цена > 0)) throw Object.assign(new Error("price_stale"), { код: 503 });
    п.tp = проверитьТейк(п, tp, цена);
    п.sl = проверитьСтоп(п, sl, цена);
    return { ok: true, position: видПозиции(п, цена) };
  });
}

/* Что сработало при этой цене. Стоп и тейк — раньше ликвидации: если цена
   перепрыгнула и стоп, и ликвидацию разом, закрытие по стопу вернёт
   человеку остаток, а ликвидация забрала бы весь залог. */
function триггер(п, цена) {
  if (п.side > 0) {
    if (п.sl && цена <= п.sl) return "sl";
    if (п.tp && цена >= п.tp) return "tp";
    if (п.liq > 0 && цена <= п.liq) return "liq";
  } else {
    if (п.sl && цена >= п.sl) return "sl";
    if (п.tp && цена <= п.tp) return "tp";
    if (п.liq > 0 && цена >= п.liq) return "liq";
  }
  return null;
}

/* Сторож: каждая новая цена рынка проверяет позиции на нём. Вызывается
   на каждое сообщение цен (api/hyperliquid.js), а без сокета — опросом. */
export function проверитьЦены(цены) {
  загрузить();
  const сработало = [];
  for (const [coin, цена] of цены) {
    const кто = поМонетам.get(coin);
    if (!кто || !(цена > 0)) continue;
    for (const uid of [...кто]) {
      const с = люди.get(uid);
      const п = с && с.pos[coin];
      if (!п) continue;
      const причина = триггер(п, цена);
      if (!причина) continue;
      try {
        сработало.push({ uid, ...закрыть(uid, { coin, цена, причина }) });
      } catch (e) {
        console.warn("[торговый счёт] сторож", coin, e && e.message);
      }
    }
  }
  return сработало;
}

export function монетыСПозициями() {
  загрузить();
  return new Set([...поМонетам.keys(), ...тейкиБоевые.keys()]);
}

/* --- Состояние для экрана ------------------------------------------------ */

export function счётДляЭкрана(uid0, ценаМонеты = () => 0) {
  загрузить();
  const uid = кодЧеловека(uid0);
  if (испорчены.has(uid)) throw Object.assign(new Error("account_unavailable"), { код: 503 });
  const с = люди.get(uid) || новыйСчёт();
  const позиции = Object.values(с.pos).map((п) => видПозиции(п, ценаМонеты(п.coin)));
  const вПозициях = позиции.reduce((s, п) => s + п.margin + п.pnl, 0);
  const cash = вДоллары(с.cash);
  return {
    cash, withdrawable: cash, equity: cash + вПозициях,
    inPositions: вПозициях, margin: позиции.reduce((s, п) => s + п.margin, 0),
    pnl: позиции.reduce((s, п) => s + п.pnl, 0),
    positions: позиции.sort((а, б) => б.openedAt - а.openedAt),
    transfers: с.ждут.map((ж) => ({ kind: ж.вид, usd: вДоллары(ж.µ), sol: ж.лампорты / 1e9, at: ж.at, signature: ж.подпись || null })),
    deposited: вДоллары(с.ввод), withdrawn: вДоллары(с.вывод),
  };
}

export function журнал(uid0, { coin = null, предел = 60 } = {}) {
  загрузить();
  const uid = кодЧеловека(uid0);
  const с = люди.get(uid);
  if (!с) return [];
  return (coin ? с.log.filter((з) => з.coin === coin) : с.log).slice(0, предел);
}

export function ответПоКлючу(uid0, ключ) {
  загрузить();
  const с = люди.get(кодЧеловека(uid0));
  const к = ключОк(ключ);
  return (с && к && с.keys[к] && с.keys[к].ответ) || null;
}

/* --- Переводы карта ⇄ счёт ---------------------------------------------- */

/* Пополнение. Запись «ждёт» заводится до отправки SOL: упади процесс
   между переводом и зачислением — сверка (довестиПереводы) найдёт перевод
   по ключу и зачислит его, а не потеряет. */
export function начатьВвод(uid, { ключ, лампорты, цена, µ }) {
  return изменить(uid, (с) => {
    if (с.keys[`in:${ключ}`]) return { повтор: true, ответ: с.keys[`in:${ключ}`].ответ };
    if (с.ждут.some((ж) => ж.ключ === ключ)) return { идёт: true };
    if (с.ждут.length >= 10) throw ошибка("too_many_transfers");
    с.ждут.push({ вид: "in", ключ, лампорты, цена, µ, at: Date.now(), подпись: null });
    return { ok: true };
  });
}
export function подписьПеревода(uid, ключ, подпись, до = null) {
  return изменить(uid, (с) => {
    const ж = с.ждут.find((x) => x.ключ === ключ);
    if (ж) { ж.подпись = подпись; if (до) ж.до = до; ж.отправлен = Date.now(); }
    return !!ж;
  });
}
export function зачестьВвод(uid, ключ) {
  return изменить(uid, (с) => {
    const готово = с.keys[`in:${ключ}`];
    if (готово) return готово.ответ;
    const ж = с.ждут.find((x) => x.ключ === ключ && x.вид === "in");
    if (!ж) throw ошибка("no_transfer");
    с.ждут = с.ждут.filter((x) => x !== ж);
    с.cash += ж.µ;
    с.ввод += ж.µ;
    записьВЖурнал(с, { kind: "in", usd: вДоллары(ж.µ), sol: ж.лампорты / 1e9, price: ж.цена, sig: ж.подпись || null });
    const ответ = { ok: true, usd: вДоллары(ж.µ), sol: ж.лампорты / 1e9, signature: ж.подпись || null, cash: вДоллары(с.cash) };
    запомнитьКлюч(с, `in:${ключ}`, ответ);
    return ответ;
  });
}
export function снятьПеревод(uid, ключ) {
  return изменить(uid, (с) => {
    const ж = с.ждут.find((x) => x.ключ === ключ);
    if (!ж) return false;
    с.ждут = с.ждут.filter((x) => x !== ж);
    // Несостоявшийся вывод возвращается на счёт целиком.
    if (ж.вид === "out") с.cash += ж.µ;
    return true;
  });
}
/* Вывод. Доллары списываются сразу, до отправки SOL: второй вывод того же
   остатка, пришедший следом, видит уже списанное и получает отказ. */
export function начатьВывод(uid, { ключ, µ, цена, лампорты }) {
  return изменить(uid, (с) => {
    if (с.keys[`out:${ключ}`]) return { повтор: true, ответ: с.keys[`out:${ключ}`].ответ };
    if (с.ждут.some((ж) => ж.ключ === ключ)) return { идёт: true };
    if (с.ждут.length >= 10) throw ошибка("too_many_transfers");
    if (!(µ > 0)) throw ошибка("bad_amount");
    if (с.cash < µ) throw ошибка("not_enough", { есть: вДоллары(с.cash) });
    с.cash -= µ;
    с.ждут.push({ вид: "out", ключ, лампорты, цена, µ, at: Date.now(), подпись: null });
    return { ok: true };
  });
}
export function завершитьВывод(uid, ключ, подпись) {
  return изменить(uid, (с) => {
    const готово = с.keys[`out:${ключ}`];
    if (готово) return готово.ответ;
    const ж = с.ждут.find((x) => x.ключ === ключ && x.вид === "out");
    if (!ж) throw ошибка("no_transfer");
    с.ждут = с.ждут.filter((x) => x !== ж);
    с.вывод += ж.µ;
    записьВЖурнал(с, { kind: "out", usd: вДоллары(ж.µ), sol: ж.лампорты / 1e9, price: ж.цена, sig: подпись || ж.подпись || null });
    const ответ = { ok: true, usd: вДоллары(ж.µ), sol: ж.лампорты / 1e9, signature: подпись || ж.подпись || null, cash: вДоллары(с.cash) };
    запомнитьКлюч(с, `out:${ключ}`, ответ);
    return ответ;
  });
}

// Всё, что ждёт сверки с сетью, — для довестиПереводы.
export function ждущиеПереводы() {
  загрузить();
  const все = [];
  for (const [uid, с] of люди) for (const ж of с.ждут) все.push({ uid, ...ж });
  return все;
}

/* --- Тейк и стоп на настоящей бирже ---------------------------------------
   На основной Hyperliquid позицию держит сама биржа, а тейк и стоп
   приложения — здесь: сторож закрывает позицию заявкой «по рынку», как
   только цена дошла. Сторона нужна, чтобы понять, в какую сторону
   сработал уровень, не спрашивая биржу на каждой цене. */
export function тейкСтопБоевой(uid, { coin, сторона, tp = null, sl = null }) {
  return изменить(uid, (с) => {
    if (!tp && !sl) delete с.tpsl[coin];
    else с.tpsl[coin] = { сторона: сторона > 0 ? 1 : -1, tp: Number(tp) || null, sl: Number(sl) || null, at: Date.now() };
    return с.tpsl[coin] || null;
  });
}
export function тейкСтопыБоевые(uid0) {
  загрузить();
  const с = люди.get(кодЧеловека(uid0));
  return (с && с.tpsl) || {};
}
export function сработавшиеБоевые(цены) {
  загрузить();
  const итог = [];
  for (const [coin, цена] of цены) {
    const кто = тейкиБоевые.get(coin);
    if (!кто || !(цена > 0)) continue;
    for (const uid of кто) {
      const т = люди.get(uid) && люди.get(uid).tpsl[coin];
      if (!т) continue;
      const причина = т.сторона > 0
        ? (т.sl && цена <= т.sl ? "sl" : т.tp && цена >= т.tp ? "tp" : null)
        : (т.sl && цена >= т.sl ? "sl" : т.tp && цена <= т.tp ? "tp" : null);
      if (причина) итог.push({ uid, coin, причина, цена });
    }
  }
  return итог;
}
export function записатьСобытие(uid, событие) {
  return изменить(uid, (с) => записьВЖурнал(с, событие));
}

export function наИзменение(ф) { слушатель = ф; }

// Для проверки (scripts/trading-check.mjs): сбросить память и читать заново.
export const дляПроверки = { сбросить: () => { люди = null; касса = null; поМонетам.clear(); тейкиБоевые.clear(); испорчены.clear(); }, касса: () => касса, КАТАЛОГ };
