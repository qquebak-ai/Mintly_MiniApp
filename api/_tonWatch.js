/* Все кривые TON площадки — одним потоком tonapi.
 *
 * Лента узнавала цену кривой TON опросом: сервер перечитывал состояние
 * каждой кривой по очереди, на всех — четыре запроса в секунду (лимит
 * ключа tonapi). При двадцати токенах в списке каждая кривая обновлялась
 * раз в пять секунд, при шестидесяти — раз в пятнадцать, а токены дальше
 * первых шестидесяти не обновлялись вовсе: «Почти на DEX» стоял на месте.
 *
 * Здесь сервер подписан на транзакции всех кривых площадки сразу
 * (tonapi SSE, до сотни счетов на подписку) и перечитывает кривую ровно
 * тогда, когда по ней прошла транзакция. Новая цена ложится в живую
 * память (api/_live.js) и общий поток списков (api/ton-stream.js), а
 * заодно уходит вестям (api/notify.js): о чужой сделке TON владелец
 * узнаёт так же сразу, как о сделке в Solana.
 *
 * Опрос в api/live.js остаётся подстраховкой — для тех минут, пока
 * поток переподключается, и для площадок без ключа tonapi.
 *
 * Переменные окружения: TONAPI_KEY, TON_TESTNET, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
const КЛЮЧ = (process.env.TONAPI_KEY || "").trim();
const СЕТЬ = TESTNET ? "testnet" : "mainnet";

// Счетов на одну подписку: список уходит в адресе запроса, а прокси
// режут длинные адреса.
const В_ПОДПИСКЕ = 100;
// Как часто сверяем список кривых с базой: новый токен должен попасть в
// поток в первую же минуту после запуска.
const СПИСОК_МС = 60_000;

const адресTon = (s) => /^[A-Za-z0-9_-]{48}$/.test(String(s || "")) || /^-?\d:[0-9a-fA-F]{64}$/.test(String(s || ""));

const кривые = new Map(); // сырой адрес -> { адрес (как в базе), tokenId, собрано }
const подписки = []; // [{ счета: [сырые], стоп, жива, попытка }]
const ждут = new Map(); // сырой адрес -> таймер перечитывания
let запущен = false;

/* Жив ли поток: хоть одна подписка сейчас принимает события. По этому
   api/live.js решает, нужен ли ещё опрос кривых TON по списку. */
export function наблюдательTONЖив() {
  return подписки.length > 0 && подписки.every((п) => п.жива);
}

/* Ведёт ли поток эту кривую (адрес — как в базе). Такую открытой
   карточке перечитывать незачем: поток перечитает её сам после каждой
   транзакции, а лишние чтения tonapi — это лишние шансы попасть на
   отставший узел. */
const ведомые = new Set(); // адреса кривых как в базе
export function кривуюTONВедёт(адрес) {
  return наблюдательTONЖив() && ведомые.has(String(адрес || ""));
}

let библиотека = null;
async function адресСырой(адрес) {
  if (!библиотека) библиотека = await import("@ton/core");
  try { return библиотека.Address.parse(адрес).toRawString(); } catch { return null; }
}

/* Перечитать кривую после её транзакции. tonapi отдаёт новое состояние
   чуть позже события, и его узлы отстают по-разному. Пока число не
   сдвинулось (или живая память сочла прочитанное отставшим, см.
   api/_live.js), спрашиваем ещё — часто в первые секунды, реже потом:
   раньше было два повтора по секунде, и сделка, которую tonapi отдавал
   на третьей секунде, на графике появлялась только со следующей.
   Транзакция могла быть и не сделкой (возврат газа, пустой перевод) —
   тогда круги просто кончатся. Новая транзакция начинает свой круг, а
   прежний обрывается. */
const ПОВТОРЫ_МС = [300, 500, 700, 1000, 1500, 2500];
async function перечитать(сырой, повтор = 0, круг = null) {
  const к = кривые.get(сырой);
  if (!к) return;
  if (круг == null) круг = к.круг = (к.круг || 0) + 1;
  if (к.круг !== круг) return;
  const ещё = () => {
    if (повтор < ПОВТОРЫ_МС.length) setTimeout(() => перечитать(сырой, повтор + 1, круг), ПОВТОРЫ_МС[повтор]);
  };
  let st = null;
  let р = null;
  try {
    р = await import("./refresh-curves.js");
    st = await р.состояние(к.адрес);
  } catch { /* сеть моргнула — ниже повтор */ }
  if (!st) { ещё(); return; }
  if (к.круг !== круг) return;
  const собрано = Number(st.realTon) / 1e9;
  const params = { virtualTon: st.virtualTon || р.DEFAULT_VIRTUAL_TON, virtualTokens: st.virtualTokens || р.DEFAULT_VIRTUAL_TOKENS };
  const событие = {
    price: р.цена(st.realTon, params),
    raised: собрано,
    sold: Number(st.tokensSold) / 1e9,
    graduation: Number(st.graduationTon) / 1e9,
    graduated: !!st.graduated,
  };
  // В живую память, общему потоку списков и открытым карточкам — тем же
  // путём, что и цена после своей сделки.
  let итог = null;
  try {
    const { протолкнутьЦену } = await import("./ton-stream.js");
    итог = протолкнутьЦену(к.адрес, событие);
  } catch { /* поток списков не главнее самой цены */ }
  if (!итог || !итог.изменилось) {
    if (!st.graduated) ещё();
    return;
  }
  к.собрано = собрано;
  if (process.env.TRADING_BOT_TOKEN) {
    import("./notify.js").then(({ вестиПоКривой }) => вестиПоКривой({
      tokenId: к.tokenId, собрано, продано: событие.sold, цель: событие.graduation,
      закрыта: событие.graduated, от: Date.now(),
    })).catch(() => {});
  }
}

// Несколько транзакций подряд (сделка и возврат газа) — одно чтение.
function отметить(сырой) {
  if (!кривые.has(сырой) || ждут.has(сырой)) return;
  ждут.set(сырой, setTimeout(() => { ждут.delete(сырой); перечитать(сырой); }, 150));
}

async function слушать(подписка) {
  if (подписка.стоп || !подписка.счета.length) return;
  const стоп = new AbortController();
  подписка.стоп = стоп;
  try {
    const счета = подписка.счета.map(encodeURIComponent).join(",");
    const ответ = await fetch(`${TONAPI}/v2/sse/accounts/transactions?accounts=${счета}`, {
      headers: { ...(КЛЮЧ ? { Authorization: `Bearer ${КЛЮЧ}` } : null), Accept: "text/event-stream" },
      signal: стоп.signal,
    });
    if (!ответ.ok || !ответ.body) throw new Error(`tonapi ${ответ.status}`);
    подписка.жива = true;
    подписка.попытка = 0;
    const чтец = ответ.body.getReader();
    const расшифровка = new TextDecoder();
    let хвост = "";
    for (;;) {
      const { value, done } = await чтец.read();
      if (done) break;
      хвост += расшифровка.decode(value, { stream: true });
      let конец;
      while ((конец = хвост.indexOf("\n\n")) >= 0) {
        const кусок = хвост.slice(0, конец);
        хвост = хвост.slice(конец + 2);
        const данные = кусок.split("\n").filter((с) => с.startsWith("data:")).map((с) => с.slice(5).trim()).join("");
        if (!данные) continue;
        let j = null;
        try { j = JSON.parse(данные); } catch { continue; }
        const счёт = j && (j.account_id || j.account);
        if (счёт) отметить(String(счёт).toLowerCase().replace(/^(-?\d+):/, "$1:"));
      }
    }
  } catch { /* оборвалось — переподключимся ниже */ }
  подписка.жива = false;
  if (подписка.стоп === стоп) подписка.стоп = null;
  if (подписка.снята) return;
  // Переподключение с нарастающей паузой: tonapi мог отбить по лимиту.
  подписка.попытка = Math.min((подписка.попытка || 0) + 1, 6);
  setTimeout(() => слушать(подписка), Math.min(30_000, 1000 * 2 ** (подписка.попытка - 1)));
}

function снять(подписка) {
  подписка.снята = true;
  if (подписка.стоп) { try { подписка.стоп.abort(); } catch { /* уже */ } }
}

/* Сверить список с базой. Подписки не пересобираются целиком на каждый
   новый токен: переподключение — это секунда без событий у всех
   кривых. Новые кривые ложатся в последнюю подписку, пока в ней есть
   место, — переподключается только она. */
async function сверить(db) {
  const { data, error } = await db.from("tokens")
    .select("id, chain, curve_address, curve_cache(graduated)")
    .not("curve_address", "is", null)
    .eq("network", СЕТЬ)
    .order("created_at", { ascending: false })
    .limit(3000);
  if (error || !data) return;
  const нужны = new Map();
  for (const т of data) {
    if (т.chain && т.chain !== "ton") continue;
    if (!адресTon(т.curve_address)) continue;
    const кеш = Array.isArray(т.curve_cache) ? т.curve_cache[0] : т.curve_cache;
    // Закрытая кривая торговлю отдала пулу: следить за ней нечего.
    if (кеш && кеш.graduated) continue;
    const сырой = await адресСырой(т.curve_address);
    if (сырой) нужны.set(сырой, { адрес: т.curve_address, tokenId: т.id });
  }
  for (const [сырой, з] of нужны) {
    const было = кривые.get(сырой);
    кривые.set(сырой, { ...з, собрано: было ? было.собрано : null, круг: было ? было.круг : 0 });
  }
  ведомые.clear();
  for (const з of нужны.values()) ведомые.add(String(з.адрес));
  const есть = new Set(подписки.flatMap((п) => п.счета));
  const новые = [...нужны.keys()].filter((с) => !есть.has(с));
  if (!новые.length) return;
  let последняя = подписки[подписки.length - 1];
  while (новые.length) {
    if (!последняя || последняя.счета.length >= В_ПОДПИСКЕ) {
      последняя = { счета: [], стоп: null, жива: false, попытка: 0, снята: false };
      подписки.push(последняя);
    }
    const место = В_ПОДПИСКЕ - последняя.счета.length;
    const кусок = новые.splice(0, место);
    // Подписка с изменённым списком переподключается заново.
    if (последняя.стоп || последняя.жива) {
      снять(последняя);
      const замена = { счета: [...последняя.счета, ...кусок], стоп: null, жива: false, попытка: 0, снята: false };
      подписки[подписки.length - 1] = замена;
      последняя = замена;
    } else {
      последняя.счета.push(...кусок);
    }
    слушать(последняя);
  }
}

export function наблюдатьЗаКривымиTON() {
  // Поток tonapi без ключа не пускает (401): тогда остаётся опрос api/live.js.
  if (запущен || !КЛЮЧ) return;
  const url = process.env.SUPABASE_URL;
  const ключБазы = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !ключБазы) return;
  запущен = true;
  const db = createClient(url, ключБазы, { auth: { persistSession: false } });
  const круг = () => сверить(db).catch((e) => console.warn("[ton-watch]", e && e.message));
  круг();
  setInterval(круг, СПИСОК_МС);
}
