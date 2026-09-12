/* Картинка с графиком токена.
 *
 * Её показывает Telegram прямо в сообщении: подсказка бота отдаёт
 * ссылку сюда, Telegram сам скачивает картинку и кладёт в чат. Смысл в
 * том, чтобы график был виден без единого касания — открывать
 * приложение нужно только тому, кто собрался торговать.
 *
 * Два источника, как и везде в боте:
 *   ?pool=<адрес пула>  — токен с биржи, свечи берём у GeckoTerminal;
 *   ?token=<id>         — токен Mintly, цену считаем по своим сделкам.
 *
 * Ответ кэшируется на минуту: Telegram скачивает картинку один раз на
 * сообщение, но одну и ту же подсказку в чате пересылают и повторяют.
 */

import { createCanvas, downscale, encodePNG, fillRect, line, px, text, textWidth } from "./_png.js";
import { gtЗапрос, gtСостояние } from "./_gt.js";
import { adminClient } from "./_support.js";
import { curveState, priceFromState, looksLikeAddress, poolByAddress, курсTon, курсSol, цепочкаТокена } from "./_market.js";
import { свопТонВЖетон, свопЖетонВТон } from "./_swap.js";

// Макет считается в этих единицах, а рисуется во столько раз крупнее и
// уменьшается усреднением: только так у наклонной линии получается
// гладкий край, а не лесенка из пикселей. Итоговая картинка выходит
// вдвое больше макета — в мессенджере её показывают на ретине, и
// восьмисот точек по ширине там мало.
const W = 800;
const H = 420;
const РЕНДЕР = 6;   // во сколько раз крупнее рисуем
const СЖАТИЕ = 2;   // во столько раз уменьшаем перед выдачей

const ФОН = [7, 8, 10];
const БЕЛЫЙ = [255, 255, 255];
const СЕРЫЙ = [124, 130, 139];
// Те же цвета, что в приложении (DARK_THEME в src/App.tsx): картинка из
// чата и экран, на который по ней приходят, должны быть одного цвета.
const АКЦЕНТ = [108, 124, 255];
const ЗЕЛЁНЫЙ = [46, 212, 122];
const КРАСНЫЙ = [240, 97, 109];

const GT = "https://api.geckoterminal.com/api/v2";

async function свечиБиржи(pool) {
  try {
    const res = await fetch(`${GT}/networks/ton/pools/${pool}/ohlcv/hour?aggregate=1&limit=24&currency=usd&token=base`);
    if (!res.ok) return [];
    const json = await res.json();
    const list = json && json.data && json.data.attributes && json.data.attributes.ohlcv_list;
    if (!Array.isArray(list)) return [];
    // Приходят от свежих к старым — разворачиваем, иначе график читался
    // бы задом наперёд.
    return list.slice().reverse().map((c) => Number(c[4]) || 0).filter((v) => v > 0);
  } catch (err) {
    return [];
  }
}

// Сеть та же, что у всего бота (см. api/_market.js).
// Боевая сеть по умолчанию. Тестовая включается явно: TON_TESTNET=1.
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
const TONAPI_KEY = (process.env.TONAPI_KEY || "").trim();

// Оп-коды кривой: покупка приходит с «BUY», продажа — уведомлением от
// жетонного кошелька. Те же числа, что в контракте и в приложении.
const OP_BUY = 0x42555921;
const OP_JETTON_NOTIFY = 0x7362d09c;
// Столько кривая удерживает из покупки на газ (CURVE_GAS_BUY_OVERHEAD).
const GAS_BUY_OVERHEAD = 120000000n;

function опкод(msg) {
  const raw = msg && msg.op_code;
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 16);
  return Number.isFinite(n) ? n : null;
}

/* История прямо из цепочки — для кнопки «Обновить».
 *
 * Резерв набирается по сделкам: покупка добавляет то, что осталось от
 * приложенной суммы после газа и комиссии, продажа вычитает выплаченное
 * продавцу. Отсюда и форма графика: покупки ведут его вверх, продажи —
 * вниз, ровно как двигают цену на кривой.
 */
async function сделкиСЦепочки(curveAddress, feeBps) {
  if (!curveAddress) return null;
  try {
    const заголовки = TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : undefined;
    const res = await fetch(`${TONAPI}/v2/blockchain/accounts/${curveAddress}/transactions?limit=200`, { headers: заголовки });
    if (!res.ok) return null;
    const json = await res.json();
    const txs = ((json && json.transactions) || []).slice().sort((a, b) => (a.utime || 0) - (b.utime || 0));
    const ряд = [];
    let резерв = 0n;
    const доля = BigInt(feeBps || 100n);
    for (const tx of txs) {
      const in_ = tx.in_msg;
      if (!in_ || tx.success === false || tx.aborted) continue;
      const op = опкод(in_);
      if (op === OP_BUY) {
        const пришло = BigInt(in_.value || 0) - GAS_BUY_OVERHEAD;
        if (пришло <= 0n) continue;
        const чисто = пришло - (пришло * доля) / 10000n;
        if (чисто <= 0n) continue;
        резерв += чисто;
        ряд.push({ t: tx.utime, r: резерв.toString() });
      } else if (op === OP_JETTON_NOTIFY) {
        const выплата = (tx.out_msgs || []).reduce((s, m) => (опкод(m) ? s : s + BigInt(m.value || 0)), 0n);
        if (выплата <= 0n) continue;
        резерв = резерв > выплата ? резерв - выплата : 0n;
        ряд.push({ t: tx.utime, r: резерв.toString() });
      }
    }
    return ряд;
  } catch (err) {
    return null;
  }
}

/* Цены по истории кривой.
 *
 * Раньше точки считались как «TON поделить на токены» по записям своих
 * сделок. Это не цена: в уплаченную сумму входят газ и комиссия, и на
 * мелкой покупке она оказывается в разы выше настоящей. Первые точки
 * задирало вверх, последняя бралась из контракта — и график только что
 * запущенного токена, у которого были одни покупки, шёл вниз.
 *
 * Теперь берём то же, что и приложение: резерв кривой после каждой
 * сделки (его складывает api/refresh-curves.js) и ту же формулу цены,
 * что зашита в контракт.
 */
async function ценыКривой(tokenId, state, curveAddress, свежо) {
  const admin = adminClient();
  if (!state) return [];
  // По кнопке «Обновить» читаем цепочку сами: кеш пишет расписание раз
  // в минуту, и сразу после покупки картинка отставала от текста, где
  // цена берётся из контракта.
  let ряд = свежо ? await сделкиСЦепочки(curveAddress, state.feeBps) : null;
  if (!ряд || !ряд.length) {
    if (!admin) return [];
    const { data } = await admin
      .from("curve_cache")
      .select("trades")
      .eq("token_id", tokenId)
      .maybeSingle();
    ряд = (data && Array.isArray(data.trades)) ? data.trades : [];
  }
  if (!ряд.length) return [];

  const virtualTon = state.virtualTon;
  const virtualTokens = state.virtualTokens;
  const цена = (realTon) => {
    const резервTon = virtualTon + realTon;
    const резервТокенов = (virtualTon * virtualTokens) / резервTon;
    return резервТокенов <= 0n ? 0 : Number(резервTon) / Number(резервТокенов);
  };

  // Резерв в истории набирается с нуля от самой старой прочитанной
  // транзакции, а у токена с длинной историей начало обрезано. Истина
  // на сейчас — резерв из контракта, поэтому весь ряд сдвигаем на
  // разницу: тогда последняя точка совпадает с состоянием.
  const последний = BigInt(ряд[ряд.length - 1].r || 0);
  const сдвиг = state.realTon - последний;
  return ряд
    .map((p) => {
      const r = BigInt(p.r || 0) + сдвиг;
      return цена(r > 0n ? r : 0n);
    })
    .filter((v) => v > 0);
}

/* Ряд цен по самой кривой.
 *
 * Пока по токену не прошло ни одной сделки, истории нет — и график
 * оставался пустым прямоугольником с надписью «нет сделок». Но цена на
 * кривой не тайна: она задана формулой контракта и известна наперёд для
 * любого объёма выкупа. Поэтому рисуем саму кривую от начала до порога
 * листинга, а точку ставим там, где токен сейчас.
 *
 * Это не прогноз рынка: по этой линии цена и будет идти, сколько бы
 * времени ни прошло. Прогноз — это «когда», а здесь только «сколько».
 */
function рядПоКривой({ виртМонет, виртТокенов, собрано, цель }) {
  const конец = Math.max(цель || 0, собрано * 1.6, виртМонет * 0.35);
  if (!(виртМонет > 0) || !(виртТокенов > 0) || !(конец > 0)) return null;
  const N = 44;
  const цена = (r) => {
    const резервМонет = виртМонет + r;
    const резервТокенов = (виртМонет * виртТокенов) / резервМонет;
    return резервТокенов > 0 ? резервМонет / резервТокенов : 0;
  };
  const точки = Array.from({ length: N }, (_, i) => цена((конец * i) / (N - 1)));
  // Где на этой линии токен стоит сейчас — по нему ставится точка.
  const доля = Math.max(0, Math.min(1, собрано / конец));
  return { точки, отметка: доля };
}

function fmtЦена(v, вTon) {
  if (!(v > 0)) return "-";
  const хвост = вTon ? " TON" : "";
  if (v >= 1) return `${вTon ? "" : "$"}${v.toFixed(4)}${хвост}`;
  if (v >= 0.0001) return `${вTon ? "" : "$"}${v.toFixed(6)}${хвост}`;
  return `${вTon ? "" : "$"}${v.toFixed(9).replace(/(\.\d*?)0+$/, "$1")}${хвост}`;
}

function fmtБольшое(v, вTon) {
  const n = Number(v) || 0;
  const знак = вTon ? "" : "$";
  const хвост = вTon ? " TON" : "";
  if (n >= 1e9) return `${знак}${(n / 1e9).toFixed(2)}B${хвост}`;
  if (n >= 1e6) return `${знак}${(n / 1e6).toFixed(2)}M${хвост}`;
  if (n >= 1e3) return `${знак}${(n / 1e3).toFixed(1)}K${хвост}`;
  return `${знак}${n.toFixed(0)}${хвост}`;
}

/* Собственно рисование. Всё, что видно на картинке: тикер, цена,
   движение, сама линия и подпись площадки. */
export function нарисовать({ ticker, name, priceText, capText, change, точки, вTon, отметка = null, подпись = null }) {
  // Всё ниже — в единицах макета; К переводит их в пиксели холста.
  const К = РЕНДЕР;
  const c = createCanvas(W * К, H * К, ФОН);
  const готово = () => encodePNG(downscale(c, РЕНДЕР / СЖАТИЕ));

  // Короткие обёртки: иначе каждая координата обрастает умножением и
  // читать разметку становится невозможно.
  const Т = (s, x, y, цвет, кегль, a = 1) => text(c, s, x * К, y * К, цвет, кегль * К, a);
  const Ш = (s, кегль) => textWidth(s, кегль * К) / К;
  const Л = (x0, y0, x1, y1, цвет, толщ = 1, a = 1) =>
    line(c, x0 * К, y0 * К, x1 * К, y1 * К, цвет, Math.max(1, Math.round(толщ * К)), a);

  // Зарево сверху справа — тем же цветом, что и весь интерфейс.
  for (let y = 0; y < 240 * К; y++) {
    for (let x = (W - 420) * К; x < W * К; x++) {
      const dx = (x / К - (W - 60)) / 420;
      const dy = (y / К - 10) / 240;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1) px(c, x, y, АКЦЕНТ, (1 - d) * 0.16);
    }
  }

  Т(`$${ticker}`, 34, 30, БЕЛЫЙ, 5);
  if (name) Т(String(name).slice(0, 22), 34, 82, СЕРЫЙ, 2);

  Т(priceText, W - 34 - Ш(priceText, 3), 30, БЕЛЫЙ, 3);
  // Движения может не быть вовсе — у токена, по которому ещё не прошло
  // ни одной сделки. «+0.00%» там означало бы «цена стояла», хотя ей
  // просто негде было измениться.
  if (change != null) {
    const цвет = change >= 0 ? ЗЕЛЁНЫЙ : КРАСНЫЙ;
    const движение = `${change >= 0 ? "+" : "-"}${Math.abs(change).toFixed(2)}%`;
    Т(движение, W - 34 - Ш(движение, 2), 66, цвет, 2);
  }
  if (capText) Т(capText, W - 34 - Ш(capText, 2), 92, СЕРЫЙ, 2);

  const x0 = 34;
  const x1 = W - 34;
  const y0 = 140;
  const y1 = H - 54;

  // Сетка. Горизонтали держат уровни, вертикали — время: без вторых
  // линия висит в пустоте, а с ними читается как отрезок торгов.
  for (let i = 0; i <= 4; i++) {
    const y = y0 + ((y1 - y0) * i) / 4;
    Л(x0, y, x1, y, БЕЛЫЙ, 0.25, i === 0 || i === 4 ? 0.1 : 0.05);
  }
  for (let i = 1; i < 6; i++) {
    const x = x0 + ((x1 - x0) * i) / 6;
    Л(x, y0, x, y1, БЕЛЫЙ, 0.25, 0.04);
  }

  if (точки.length >= 2) {
    const мин = Math.min(...точки);
    const макс = Math.max(...точки);
    const размах = макс - мин || макс || 1;
    // Небольшой запас сверху и снизу: линия, упирающаяся в край, выглядит
    // обрезанной.
    const кY = (v) => y1 - ((v - мин) / размах) * (y1 - y0) * 0.88 - (y1 - y0) * 0.06;
    const кX = (i) => x0 + ((x1 - x0) * i) / (точки.length - 1);

    // Докуда путь уже пройден. Для истории сделок это вся линия, для
    // самой кривой — та её часть, что соответствует собранному: дальше
    // цена пойдёт по этой же линии, но ещё не пошла.
    const рубеж = отметка == null ? точки.length - 1 : Math.round(отметка * (точки.length - 1));
    const тускло = (i) => отметка != null && i >= рубеж;

    // Заливка под линией — вертикальным затуханием. Шаг по пикселям
    // холста, а не по единицам макета: иначе между столбиками остаются
    // непрокрашенные полосы.
    for (let i = 0; i < Math.max(1, рубеж); i++) {
      const ax = кX(i) * К, bx = кX(i + 1) * К;
      const ay = кY(точки[i]) * К, by = кY(точки[i + 1]) * К;
      const низ = y1 * К;
      for (let x = Math.round(ax); x <= Math.round(bx); x++) {
        const t = (x - ax) / Math.max(1, bx - ax);
        const верх = ay + (by - ay) * t;
        for (let y = Math.floor(верх); y <= низ; y++) {
          const доля = 1 - (y - верх) / Math.max(1, низ - верх);
          px(c, x, y, АКЦЕНТ, 0.3 * доля * доля);
        }
      }
    }

    // Свечение: та же ломаная несколько раз, всё толще и всё бледнее.
    // Без него линия на чёрном выглядит наклейкой, а не светящейся —
    // разница видна ровно в мессенджере, где картинку смотрят мельком.
    for (const [толщина, альфа] of [[6, 0.05], [3.6, 0.09], [2.4, 0.16]]) {
      for (let i = 0; i < точки.length - 1; i++) {
        if (тускло(i)) continue;
        Л(кX(i), кY(точки[i]), кX(i + 1), кY(точки[i + 1]), АКЦЕНТ, толщина, альфа);
      }
    }
    for (let i = 0; i < точки.length - 1; i++) {
      Л(кX(i), кY(точки[i]), кX(i + 1), кY(точки[i + 1]), АКЦЕНТ, 1.3, тускло(i) ? 0.28 : 1);
    }

    // Точка «сейчас»: ядро белое, вокруг — ореол акцентом. Круг
    // заполняется, а не обводится по углам: обвод оставлял на кромке
    // зубцы, которые уменьшение уже не спасало.
    const lx = кX(рубеж) * К;
    const ly = кY(точки[рубеж]) * К;
    const Rвнеш = 16 * К;
    for (let y = Math.round(ly - Rвнеш); y <= ly + Rвнеш; y++) {
      for (let x = Math.round(lx - Rвнеш); x <= lx + Rвнеш; x++) {
        const d = Math.hypot(x - lx, y - ly) / К;
        if (d <= 2.8) px(c, x, y, БЕЛЫЙ, 1);
        else if (d <= 4.2) px(c, x, y, АКЦЕНТ, 0.9);
        else if (d <= 16) px(c, x, y, АКЦЕНТ, 0.05);
      }
    }
    fillRect(c, x0 * К, (y1 + 1) * К, (x1 - x0) * К, К, БЕЛЫЙ, 0.08);
  } else {
    const нет = "NO TRADES YET";
    Т(нет, (W - Ш(нет, 2)) / 2, (y0 + y1) / 2 - 7, СЕРЫЙ, 2);
  }

  Т(подпись || (вTon ? "MINTLY CURVE" : "24H"), 34, H - 34, СЕРЫЙ, 2);
  const марка = "MINTLY";
  Т(марка, W - 34 - Ш(марка, 2), H - 34, АКЦЕНТ, 2, 0.9);

  return готово();
}

/* --- Рыночные данные для приложения ------------------------------
 *
 * Почему так. У GeckoTerminal общий лимит примерно в тридцать запросов в
 * минуту на источник, и он один на всё приложение: пока лента, сделки и
 * график каждого открытого телефона стоят в общей очереди, свечи
 * приезжают через секунду-другую после открытия токена. На чужих
 * площадках график появляется мгновенно ровно потому, что его отдаёт их
 * собственный сервер.
 *
 * Здесь то же самое: один запрос от нашего сервера обслуживает всех,
 * ответ кладётся в сеть доставки Vercel на полминуты, и следующий
 * телефон получает его вообще без похода к источнику — за десятки
 * миллисекунд.
 *
 * stale-while-revalidate важнее самого кеша: даже когда полминуты
 * истекли, человек получает прошлый ответ сразу, а обновление идёт
 * следом. Пустого графика не бывает никогда.
 *
 * Наружу открыты три вещи и только они: свечи, сделки и описание
 * токена. Список путей закрыт намеренно — открытый прокси к чужому
 * источнику под нашим именем очень быстро становится чужим прокси.
 */

// Адрес источника объявлен выше — он один и тот же.

// Те же интервалы, что и в приложении: имя таймфрейма → чем его брать у
// источника. Часть приложение потом пересобирает у себя (M30 из M15,
// W1 и MN1 из дней), но это уже его забота.
const ИНТЕРВАЛЫ = {
  M1: { timeframe: "minute", aggregate: 1 },
  M5: { timeframe: "minute", aggregate: 5 },
  M15: { timeframe: "minute", aggregate: 15 },
  M30: { timeframe: "minute", aggregate: 15 },
  H1: { timeframe: "hour", aggregate: 1 },
  H4: { timeframe: "hour", aggregate: 4 },
  D1: { timeframe: "day", aggregate: 1 },
  W1: { timeframe: "day", aggregate: 1 },
  MN1: { timeframe: "day", aggregate: 1 },
};

const адресОк = (s) => typeof s === "string" && /^[A-Za-z0-9_:-]{20,80}$/.test(s);
const сетьОк = (s) => /^[a-z-]{2,20}$/.test(s);

/* Короткая память самого обработчика. Она переживает лишь несколько
   вызовов подряд — Vercel держит процесс между запросами недолго, — но
   именно эти несколько и случаются, когда экран открывают, закрывают и
   открывают снова. */
const память = new Map();
const ПАМЯТЬ_МС = 60000;

function положить(ключ, тело) {
  память.set(ключ, { ts: Date.now(), тело });
  // Протухшее не выбрасываем сразу: когда биржа отказывает, прошлый
  // ответ — единственное, что можно показать. Чистим только совсем
  // старое и только когда записей стало много.
  if (память.size > 1200) {
    for (const [k, v] of память) if (Date.now() - v.ts > 30 * 60 * 1000) память.delete(k);
  }
}

async function рынокДанные(req, res) {
  const что = String((req.query && req.query.what) || "ohlcv").trim();
  // Состояние очереди к бирже: почему именно «занято» — видно одним
  // запросом, а не гаданием по логам.
  if (что === "gt") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(gtСостояние());
  }
  const сеть = String((req.query && req.query.network) || "ton").trim();
  if (!сетьОк(сеть)) return res.status(400).json({ error: "bad_request" });

  /* Сделка на сайте.
   *
   * Сайт для того и сделан, чтобы торговать на нём, а не отправлять
   * человека в Telegram. Подписывает по-прежнему его кошелёк: отсюда
   * уходит только собранное тело сообщения — куда, сколько и что
   * сказать бирже. Ключей здесь нет и быть не может. */
  if (что === "swap") {
    const жетон = String((req.query && req.query.jetton) || "").trim();
    const кошелёк = String((req.query && req.query.wallet) || "").trim();
    const сумма = Number((req.query && req.query.amount) || 0);
    const продажа = String((req.query && req.query.side) || "buy") === "sell";
    if (сеть !== "ton" || !адресОк(жетон) || !адресОк(кошелёк) || !(сумма > 0)) {
      return res.status(400).json({ error: "bad_request" });
    }
    res.setHeader("Cache-Control", "no-store");
    try {
      const сделка = продажа
        ? await свопЖетонВТон({ jetton: жетон, amount: сумма, userWallet: кошелёк })
        : await свопТонВЖетон({ jetton: жетон, tonAmount: сумма, userWallet: кошелёк });
      if (!сделка) return res.status(404).json({ error: "no_route" });
      return res.status(200).json(сделка);
    } catch (err) {
      return res.status(502).json({ error: "upstream", detail: String((err && err.message) || err).slice(0, 200) });
    }
  }

  let url = null;
  let ключ = null;

  if (что === "ohlcv") {
    const пул = String((req.query && req.query.pool) || "").trim();
    const тф = String((req.query && req.query.tf) || "H1").toUpperCase();
    const cfg = ИНТЕРВАЛЫ[тф];
    if (!адресОк(пул) || !cfg) return res.status(400).json({ error: "bad_request" });
    // Сколько свечей просить. Терминалу нужна вся история, ленте — сутки
    // на ноготь шириной в сто точек: тянуть ради неё тысячу свечей на
    // каждую строку значит выкачивать мегабайты ради двадцати линий.
    const сколько = Math.max(1, Math.min(1000, Number(req.query && req.query.n) || 1000));
    ключ = `o:${сеть}:${пул}:${тф}:${сколько}`;
    url = `${GT}/networks/${сеть}/pools/${пул}/ohlcv/${cfg.timeframe}`
      + `?aggregate=${cfg.aggregate}&limit=${сколько}&currency=usd&token=base`;
  } else if (что === "trades") {
    const пул = String((req.query && req.query.pool) || "").trim();
    if (!адресОк(пул)) return res.status(400).json({ error: "bad_request" });
    ключ = `t:${сеть}:${пул}`;
    url = `${GT}/networks/${сеть}/pools/${пул}/trades`;
  } else if (что === "info") {
    const токен = String((req.query && req.query.token) || "").trim();
    if (!адресОк(токен)) return res.status(400).json({ error: "bad_request" });
    ключ = `i:${сеть}:${токен}`;
    url = `${GT}/networks/${сеть}/tokens/${токен}/info`;
  } else {
    return res.status(400).json({ error: "bad_request" });
  }

  // Сделки живут секунды, свечи — полминуты, описание не меняется
  // неделями. Разные сроки в сети доставки: незачем держать описание
  // токена так же коротко, как ленту сделок.
  const сроки = что === "trades"
    ? "public, s-maxage=10, stale-while-revalidate=120"
    : что === "info"
      ? "public, s-maxage=600, stale-while-revalidate=86400"
      : "public, s-maxage=30, stale-while-revalidate=300";

  const было = память.get(ключ);
  // Насколько ответ считается свежим. Сроки заметно длиннее прежних:
  // у биржи лимит на адрес один на весь сервер, и каждый лишний поход
  // туда — отказ кому-то другому. Свечи минутного интервала от
  // тридцати секунд возраста не портятся, а лента сделок и подавно.
  const свежесть = что === "trades" ? 30000 : что === "info" ? 6 * 3600 * 1000 : ПАМЯТЬ_МС;
  if (было && Date.now() - было.ts < свежесть) {
    res.setHeader("Cache-Control", сроки);
    return res.status(200).json(было.тело);
  }

  // Через общую дверь: лимит источника один на весь сервер, и без
  // очереди свечи одного человека отбирали его у ленты всех остальных.
  const ответ = await gtЗапрос(url);
  if (ответ.ok && ответ.json) {
    положить(ключ, ответ.json);
    res.setHeader("Cache-Control", сроки);
    return res.status(200).json(ответ.json);
  }
  // Не вышло — отдаём последнее удачное, даже протухшее: цифры
  // получасовой давности честнее пустого экрана, а приложение дорисует
  // свежие, когда источник ответит.
  if (было) {
    res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=300");
    return res.status(200).json(было.тело);
  }
  // Отказ по лимиту — не поломка: приложению стоит зайти позже, а не
  // идти к источнику самому и получать там тот же отказ.
  const перегрузка = ответ.status === 429 || ответ.status === 0;
  res.setHeader("Cache-Control", "no-store");
  if (перегрузка) res.setHeader("Retry-After", "5");
  return res.status(перегрузка ? 503 : 502).json({
    error: перегрузка ? "busy" : "upstream",
    detail: `geckoterminal ${ответ.status}`,
    очередь: gtСостояние(),
  });
}

export default async function handler(req, res) {
  // Свечи, сделки и описания токена приложение просит здесь же:
  // на бесплатном тарифе Vercel двенадцать обработчиков, и
  // отдельный ради трёх запросов к одному источнику не влезал
  // — он просто не разворачивался, а приложение получало 404.
  if (req.query && req.query.what) return рынокДанные(req, res);

  const параметры = new URL(req.url, "https://x").searchParams;
  const пул = параметры.get("pool");
  const токен = параметры.get("token");
  // «Обновить» в чате просит свежую картинку — тогда историю читаем
  // прямо из цепочки, не дожидаясь очередного обхода.
  const свежо = параметры.get("fresh") === "1";

  try {
    if (пул && looksLikeAddress(пул)) {
      const [строка, точки] = await Promise.all([poolByAddress(пул), свечиБиржи(пул)]);
      if (!строка) return res.status(404).json({ error: "not_found" });
      const png = нарисовать({
        ticker: строка.ticker,
        name: строка.name,
        priceText: fmtЦена(строка.priceUsd, false),
        capText: строка.mcapUsd ? fmtБольшое(строка.mcapUsd, false) : "",
        change: строка.change24,
        точки,
        вTon: false,
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
      return res.status(200).send(png);
    }

    if (токен) {
      const admin = adminClient();
      const { data: строка } = await admin
        .from("tokens")
        .select("id, name, ticker, address, curve_address, chain, network")
        .eq("id", токен)
        .maybeSingle();
      if (!строка) return res.status(404).json({ error: "not_found" });

      // Токен своей площадки в Solana: состояние читается у нашей же
      // программы кривой, а не у TON. Раньше эта ветка молча уходила в
      // TON и возвращала пустой график — цепочка-то другая.
      if (цепочкаТокена(строка) === "solana") {
        const { состояние } = await import("./solana-launch.js");
        const [s, курс] = await Promise.all([
          состояние(строка.address).catch(() => null),
          курсSol().catch(() => 0),
        ]);
        const кривая = s ? рядПоКривой({
          виртМонет: s.virtualSol,
          виртТокенов: s.virtualTokens,
          собрано: s.realSol,
          цель: s.graduationSol,
        }) : null;
        const png = нарисовать({
          ticker: String(строка.ticker || "").toUpperCase(),
          name: строка.name,
          priceText: s ? fmtЦена(s.ценаSol, false).replace("$", "") + " SOL" : "-",
          // Капитализация — по обороту (что кривая продала) и сразу в
          // долларах, как и у токенов с биржи: одна величина, одна
          // единица. За весь выпуск считать нельзя: виртуальный резерв
          // давал одинаковую капитализацию всем пустым токенам.
          capText: s && курс > 0 ? fmtБольшое(Math.max(s.ценаSol * s.продано * курс, 5), false) : "",
          change: null,
          точки: кривая ? кривая.точки : [],
          отметка: кривая ? кривая.отметка : null,
          подпись: "MINTLY CURVE · SOL",
          вTon: false,
        });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", свежо ? "no-store" : "public, max-age=60, s-maxage=60");
        return res.status(200).send(png);
      }

      const [state, курс] = await Promise.all([curveState(строка.curve_address, строка.network), курсTon()]);
      const точки = await ценыКривой(строка.id, state, строка.curve_address, свежо);
      const цена = priceFromState(state);
      // Последняя точка — из контракта: он свежее любой записанной
      // истории.
      const ряд = цена > 0
        ? (точки.length ? [...точки, цена] : [])
        : точки;

      // Рисовать нечего, когда сделок не было вовсе или когда все точки
      // истории совпали: после единственной покупки цена и правда стоит
      // на месте, но прямая линия об этом токене не говорит ничего.
      // В обоих случаях показываем саму кривую с отметкой «где сейчас».
      const плоско = ряд.length < 2 || Math.max(...ряд) - Math.min(...ряд) <= 0;
      const кривая = !плоско || !state ? null : рядПоКривой({
        виртМонет: Number(state.virtualTon),
        виртТокенов: Number(state.virtualTokens),
        собрано: Number(state.realTon),
        цель: Number(state.graduationTon),
      });

      const старт = ряд.length ? ряд[0] : 0;
      const png = нарисовать({
        ticker: String(строка.ticker || "").toUpperCase(),
        name: строка.name,
        priceText: fmtЦена(цена, true),
        // Капитализация только в долларах — там же, где и в ленте, и в
        // карточке бота. Курса нет — лучше пусто, чем другая единица,
        // которую примут за доллары. Считается по обороту: за проданное
        // кривой, а не за весь выпуск.
        capText: цена > 0 && курс > 0
          ? fmtБольшое(Math.max(цена * (state ? Number(state.tokensSold) / 1e9 : 0) * курс, 5), false)
          : "",
        change: кривая ? null : (старт > 0 && цена > 0 ? ((цена - старт) / старт) * 100 : 0),
        точки: кривая ? кривая.точки : ряд,
        отметка: кривая ? кривая.отметка : null,
        // «Сделок не было» пишем только когда их правда не было: с одной
        // покупкой история есть, просто она в одну точку.
        подпись: кривая ? (ряд.length ? "MINTLY CURVE" : "MINTLY CURVE · NO TRADES YET") : null,
        вTon: true,
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", свежо ? "no-store" : "public, max-age=60, s-maxage=60");
      return res.status(200).send(png);
    }

    return res.status(400).json({ error: "bad_request" });
  } catch (err) {
    return res.status(500).json({ error: "render_failed", detail: err && err.message });
  }
}
