/* Обход кривых для витрины: считает всё разом и складывает в базу.
 *
 * До этого рыночные числа выяснял каждый телефон сам: состояние кривой,
 * её транзакции и метаданные жетона — три запроса к tonapi на токен,
 * строго по очереди, потому что ключ пускает примерно один запрос в
 * секунду. Лента из десятка токенов набиралась секунд десять, и это при
 * том, что у всех она одинаковая.
 *
 * Теперь цепочку обходит сервер: раз в минуту его дёргает расписание
 * (крон на своём сервере, см. README), а приложение забирает готовую
 * ленту одним запросом к таблице curve_cache.
 *
 * Формулы обязаны совпадать с src/App.tsx и src/curveConfig.js — это
 * те же числа, просто посчитанные в другом месте. При смене параметров
 * кривой правится и здесь.
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * CRON_SECRET, при желании TONAPI_KEY (без него лимиты жёстче) и
 * TON_TESTNET=0 для боевой сети.
 */

import { createClient } from "@supabase/supabase-js";
import { обновитьЖивойГрафик } from "./_livechart.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

/* Какая часть комиссии площадки идёт в фонд выкупа у токенов, где
   создатель включил обратный выкуп. Половина: остальное — работа
   площадки, и обещать больше, чем можешь отдать, нельзя. */
const BUYBACK_ДОЛЯ = 0.5;

// Боевая сеть по умолчанию. Тестовая включается явно: TON_TESTNET=1.
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";

// Сеть Solana своя: программа кривой ещё в devnet, и токены оттуда
// лежат в базе с network = "devnet". Обходить их надо наравне с
// боевыми — иначе у них нет ни цены на витрине, ни уведомлений.
const SOL_NETWORK = /devnet/.test(process.env.SOLANA_RPC || "") ? "devnet"
  : /testnet/.test(process.env.SOLANA_RPC || "") ? "testnet" : "mainnet";
const СЕТИ = [...new Set([TESTNET ? "testnet" : "mainnet", SOL_NETWORK])];
// Только серверный ключ. Тот, что уходит в браузер (VITE_TONAPI_KEY),
// ограничен по источнику: у запроса с сервера заголовка Origin нет, и
// tonapi такой ключ отбивает — обход молча возвращал пустоту. Без ключа
// запросы идут по общему лимиту, этого хватает на пару десятков токенов
// раз в минуту.
const TONAPI_KEY = (process.env.TONAPI_KEY || "").trim();

// Сколько токенов обходим за раз. Ограничение не про базу, а про
// tonapi: на каждый токен уходит до трёх запросов.
const BATCH = 30;

// Параметры кривой по умолчанию — на случай, если контракт их не отдал.
// Те же значения, что в src/curveConfig.js.
const DEFAULT_VIRTUAL_TON = 1000n * 1000000000n;
const DEFAULT_VIRTUAL_TOKENS = 1000000000n * 1000000000n;
const DEFAULT_FEE_BPS = 100n;
const DEFAULT_SUPPLY = 1000000000; // миллиард, весь выпуск

// Газ, который кривая удерживает из каждой покупки (CURVE_GAS_BUY_OVERHEAD).
const GAS_BUY_OVERHEAD = 120000000n;

const OP_BUY = 0x42555921;
const OP_JETTON_NOTIFY = 0x7362d09c;

// Состояние собственного пула токена. Кривая, набрав цель, отдаёт ему
// TON и остаток выпуска, и торговля продолжается там. Раньше на этом
// месте спрашивали Ston.fi, не завели ли пару вручную; теперь пара не
// нужна вовсе — рынок свой, и пул разворачивается ещё при запуске.
//
// Поля идут в порядке структуры PoolData: tonReserve, tokenReserve,
// feeBps, ready.
async function состояниеПула(address) {
  if (!address) return null;
  try {
    const json = await tonapi(`/v2/blockchain/accounts/${address}/methods/data`, { method: "POST" });
    const stack = (json && json.stack) || [];
    if (stack.length < 4) return null;
    return {
      tonReserve: BigInt(stack[0].num),
      tokenReserve: BigInt(stack[1].num),
      feeBps: BigInt(stack[2].num),
      ready: Number(stack[3].num) !== 0,
    };
  } catch {
    return null;
  }
}

async function tonapi(path, init) {
  const заголовки = TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : undefined;
  try {
    const res = await fetch(`${TONAPI}${path}`, { ...(init || {}), headers: { ...(init && init.headers), ...заголовки } });
    if (!res.ok) {
      // В логах Vercel видно, что именно отбило: лимит, ключ или адрес.
      console.warn("[refresh-curves] tonapi", res.status, path);
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}

/* Состояние кривой. Порядок полей задан структурой CurveData в
   контракте: менять нельзя, не поправив в приложении и в api/notify.js. */
async function состояние(address) {
  // Обычным GET, как в api/notify.js: этот путь уже проверен на боевых
  // вызовах, и незачем иметь два разных способа спросить одно и то же.
  const json = await tonapi(`/v2/blockchain/accounts/${address}/methods/data`);
  const stack = json && json.stack;
  if (!Array.isArray(stack) || stack.length < 7) return null;
  const num = (i) => BigInt(stack[i].num);
  return {
    virtualTon: num(0),
    virtualTokens: num(1),
    realTon: num(2),
    tokensSold: num(3),
    tokensForSale: num(4),
    graduationTon: num(5),
    feeBps: num(6),
    graduated: stack[7] ? Number(stack[7].num) !== 0 : false,
  };
}

function opCode(msg) {
  const raw = msg && msg.op_code;
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 16);
  return Number.isFinite(n) ? n : null;
}

/* Цена одного токена в TON: отношение резервов, а не отдельное поле
   контракта. */
function цена(realTon, params) {
  const резервTon = params.virtualTon + realTon;
  const резервТокенов = (params.virtualTon * params.virtualTokens) / резервTon;
  if (резервТокенов <= 0n) return 0;
  return Number(резервTon) / Number(резервТокенов);
}

/* Сделки кривой из её транзакций. У покупки берём приложенную сумму за
   вычетом газа и комиссии, у продажи — сколько TON ушло продавцу: обе
   величины видны в транзакции и не требуют разбора тела сообщения. */
async function сделки(address, feeBps) {
  const json = await tonapi(`/v2/blockchain/accounts/${address}/transactions?limit=200`);
  const txs = ((json && json.transactions) || []).slice().sort((a, b) => (a.utime || 0) - (b.utime || 0));
  const ряд = [];
  let резерв = 0n;
  for (const tx of txs) {
    const in_ = tx.in_msg;
    if (!in_ || tx.success === false || tx.aborted) continue;
    const op = opCode(in_);
    if (op === OP_BUY) {
      const пришло = BigInt(in_.value || 0) - GAS_BUY_OVERHEAD;
      if (пришло <= 0n) continue;
      const чисто = пришло - (пришло * feeBps) / 10000n;
      if (чисто <= 0n) continue;
      резерв += чисто;
      ряд.push({ time: tx.utime, ton: чисто, realTon: резерв });
    } else if (op === OP_JETTON_NOTIFY) {
      // Продажа: кривая платит TON обычными переводами без опкода.
      const выплата = (tx.out_msgs || []).reduce((s, m) => (opCode(m) ? s : s + BigInt(m.value || 0)), 0n);
      if (выплата <= 0n) continue;
      резерв = резерв > выплата ? резерв - выплата : 0n;
      ряд.push({ time: tx.utime, ton: выплата, realTon: резерв });
    }
  }
  return ряд;
}

/* Метаданные жетона: держатели, выпуск и картинка. Один запрос отдаёт
   всё три — отдельных ходить незачем. */
async function метаданные(address) {
  const json = await tonapi(`/v2/jettons/${address}`);
  if (!json) return null;
  const decimals = Number((json.metadata && json.metadata.decimals) ?? 9) || 9;
  return {
    holders: typeof json.holders_count === "number" ? json.holders_count : null,
    supply: json.total_supply != null ? Number(json.total_supply) / 10 ** decimals : null,
    image: (json.metadata && json.metadata.image) || json.preview || null,
    // Описание автор писал при запуске, и до сих пор оно жило только в
    // цепочке. Токены, запущенные раньше, чем приложение стало его
    // сохранять, добирают описание отсюда — иначе их карточки в мемпаде
    // навсегда остались бы без единого слова.
    description: (json.metadata && json.metadata.description) || null,
  };
}

/* Кривая в Solana.
 *
 * Числа те же по смыслу, что и у TON, поэтому ложатся в те же колонки:
 * price_ton — цена штуки в родной монете сети, real_ton — сколько в
 * кривой собрано, graduation_ton — цель. Переименовывать колонки ради
 * второй сети значит переписать половину приложения; вместо этого
 * договорённость простая — «ton» в имени читается как «родная монета
 * цепочки», а какая именно, говорит колонка chain у токена.
 *
 * История сделок собирается по подписям счёта кривой: в Solana другого
 * способа нет, отдельного «списка транзакций» узел не отдаёт. Отсюда и
 * осторожность — берём последние несколько десятков и не чаще, чем раз в
 * несколько минут на токен: обход идёт по всем токенам каждую минуту, и
 * бесплатный узел столько запросов не выдержит.
 */
/* Цепочка токена: колонке верим, а когда её нет — узнаём по адресу.
   Токены постарше записаны без chain, и их кривые уходили в tonapi,
   который про Solana ничего не знает: в витрине они стояли без цены. */
function цепочка(tok) {
  if (tok && tok.chain) return tok.chain === "solana" ? "solana" : "ton";
  const адрес = String((tok && tok.address) || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(адрес) && !/^(EQ|UQ|kQ|0Q)/.test(адрес) ? "solana" : "ton";
}

const SOL_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const ЛЯМПОРТ = 1_000_000_000;
// Сколько последних сделок читаем и как часто. Полсотни хватает и на
// объём за сутки, и на движение цены; чаще раза в пять минут ходить
// незачем — за минуту у мемкоина в devnet не случается ничего.
const SOL_ПОДПИСЕЙ = 50;
const SOL_ИСТОРИЯ_МС = 5 * 60 * 1000;

async function solRpc(тело) {
  const res = await fetch(SOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(тело),
  });
  if (!res.ok) throw new Error(`solana rpc ${res.status}`);
  return res.json();
}

/* Сделки кривой Solana.
 *
 * Считаем по изменению баланса самого счёта кривой: покупка добавляет
 * лямпорты, продажа забирает. Разбирать инструкции не нужно — деньги
 * ходят только через кривую, и её баланс это и есть история сделок.
 *
 * Возвращаем ряд от старых к новым: {time, дельта} в лямпортах.
 */
async function сделкиSolana(curveАдрес) {
  const первый = await solRpc({
    jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
    params: [curveАдрес, { limit: SOL_ПОДПИСЕЙ }],
  });
  const подписи = (первый && первый.result) || [];
  const живые = подписи.filter((п) => п && п.signature && !п.err);
  if (!живые.length) return [];

  // Пачками: узел принимает массив запросов разом, и пятьдесят
  // отдельных походов превращаются в пять.
  const ряд = [];
  for (let i = 0; i < живые.length; i += 10) {
    const кусок = живые.slice(i, i + 10);
    const ответ = await solRpc(кусок.map((п, k) => ({
      jsonrpc: "2.0", id: i + k, method: "getTransaction",
      params: [п.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }],
    })));
    for (const о of (Array.isArray(ответ) ? ответ : [])) {
      const tx = о && о.result;
      const мета = tx && tx.meta;
      const счета = tx && tx.transaction && tx.transaction.message && tx.transaction.message.accountKeys;
      if (!мета || !Array.isArray(счета)) continue;
      const место = счета.findIndex((с) => (typeof с === "string" ? с : с && с.pubkey) === curveАдрес);
      if (место < 0) continue;
      const было = Number((мета.preBalances || [])[место] || 0);
      const стало = Number((мета.postBalances || [])[место] || 0);
      const дельта = стало - было;
      if (!дельта) continue;
      ряд.push({ time: Number(tx.blockTime || 0), дельта });
    }
  }
  return ряд.filter((с) => с.time > 0).sort((a, b) => a.time - b.time);
}

/* Цена штуки по резерву. Произведение резервов постоянно, поэтому
   непроданный запас выражается через собранное, и цена зависит только от
   него — этого хватает, чтобы восстановить цену в любой момент прошлого,
   не зная, сколько токенов было продано тогда. */
export function ценаSolПо(realSol, st) {
  const резерв = st.virtualSol + realSol;
  const токенов = (st.virtualSol * st.virtualTokens) / резерв;
  if (!(токенов > 0)) return 0;
  return резерв / токенов;
}

/* Когда историю сделок этого токена читали из сети в последний раз.
   Живёт в процессе: обход идёт в нём же, а после перезапуска первый
   заход перечитает всё заново — это и нужно. */
const историяЧитана = new Map();

async function ветвьSolana(tok, прошлое) {
  try {
    const { состояние: состояниеSol } = await import("./solana-launch.js");
    const st = await состояниеSol(tok.address);
    if (!st) return null;

    /* История дорогая, поэтому читаем её не каждый заход. Признак того,
       что читать пора, — изменившееся собранное: через кривую деньги
       ходят только сделками, и другого способа сдвинуть эту цифру нет.
       По времени сверяться было нельзя: метку ставит каждый заход, а
       заходы идут раз в двадцать секунд, поэтому «прошло пять минут» не
       наступало никогда — история читалась ровно один раз, и после
       покупки на графике ничего не появлялось. */
    const собраноБыло = прошлое && прошлое.real_ton != null ? Number(прошлое.real_ton) : null;
    const читалиКогда = историяЧитана.get(tok.id) || 0;
    const свежая = прошлое
      && Array.isArray(прошлое.trades)
      && собраноБыло != null
      && Math.abs(собраноБыло - st.solСобрано) < 1e-9
      // Своя метка, а не updated_at строки: её ставит каждый обход, и по
      // ней «прошло пять минут» не наступало никогда.
      && Date.now() - читалиКогда < SOL_ИСТОРИЯ_МС;
    let сделки = [];
    if (свежая) {
      сделки = прошлое.trades.map((п) => ({ time: Number(p_время(п)), дельта: Number(п.d || 0) }));
    } else {
      сделки = await сделкиSolana(tok.curve_address).catch(() => []);
      историяЧитана.set(tok.id, Date.now());
    }

    const сутки = Math.floor(Date.now() / 1000) - 86400;
    const заСутки = сделки.filter((с) => с.time >= сутки);
    const объём = заСутки.reduce((s, с) => s + Math.abs(с.дельта), 0) / ЛЯМПОРТ;
    // Цена сутки назад: отматываем собранное на сумму всех сделок окна.
    const сдвиг = заСутки.reduce((s, с) => s + с.дельта, 0);
    const сейчасЦена = ценаSolПо(st.realSol, st);
    const прежняя = ценаSolПо(Math.max(0, st.realSol - сдвиг), st);

    return {
      token_id: tok.id,
      curve_address: tok.curve_address,
      price_ton: st.ценаSol,
      real_ton: st.solСобрано,
      graduation_ton: st.solЦель,
      tokens_sold: st.продано,
      supply: DEFAULT_SUPPLY,
      fee_bps: st.feeBps,
      graduated: !!st.закрыта,
      holders: null,
      vol24_ton: объём,
      change24: прежняя > 0 && сейчасЦена > 0 ? ((сейчасЦена - прежняя) / прежняя) * 100 : 0,
      tx24: заСутки.length,
      logo_url: tok.logo_url || null,
      // Сделки храним в лямпортах и знаком: по ним считается и объём, и
      // движение, а сам ряд переживает заходы, когда историю не читаем.
      trades: сделки.slice(-200).map((с) => ({ t: с.time, d: с.дельта })),
      updated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// Время сделки в сохранённом ряду. Формат менялся, поэтому читаем оба:
// «t» у нынешних записей и «time» у тех, что успели лечь раньше.
function p_время(п) {
  return (п && (п.t != null ? п.t : п.time)) || 0;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "not_configured" });
  }
  const auth = req.headers.authorization || "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Колонка с парой на бирже появилась позже (supabase_listing.sql).
  // Пока миграции нет, читаем без неё — иначе запрос отбивается целиком
  // и обход перестаёт обновлять витрину.
  const { error: нетКолонки } = await admin.from("tokens").select("dex_pool_address").limit(1);
  const естьЛистинг = !нетКолонки;
  // То же и с описанием: колонка добавляется миграцией, а до неё запрос
  // с ней отбивается целиком и витрина перестаёт обновляться вовсе.
  const { error: нетОписания } = await admin.from("tokens").select("description").limit(1);
  const естьОписание = !нетОписания;

  const { data: tokens, error } = await admin
    .from("tokens")
    .select(`id, address, curve_address, logo_url, chain${естьОписание ? ", description" : ""}${естьЛистинг ? ", dex_pool_address, listed_at" : ""}`)
    .not("curve_address", "is", null)
    .in("network", СЕТИ)
    .order("created_at", { ascending: false })
    .limit(BATCH);
  if (error) return res.status(500).json({ error: "tokens_failed", detail: error.message });
  if (!tokens || !tokens.length) {
    return res.status(200).json({ updated: 0, tokens: 0, network: TESTNET ? "testnet" : "mainnet" });
  }

  const сутки = Math.floor(Date.now() / 1000) - 86400;
  const строки = [];

  // Прошлые записи кеша: у токенов Solana в них лежит история сделок, а
  // читать её из сети каждую минуту — это полсотни запросов на токен.
  const прошлыеКеши = new Map();
  {
    const { data } = await admin
      .from("curve_cache")
      .select("token_id, trades, updated_at, real_ton")
      .in("token_id", tokens.map((t) => t.id));
    for (const с of data || []) прошлыеКеши.set(с.token_id, с);
  }

  // Токены обходим по очереди, а не пачкой: три параллельных запроса на
  // токен упрутся в лимит tonapi быстрее, чем принесут пользу. Обход
  // идёт в фоне, ждать его никто не будет.
  // Сколько кривых не ответило — иначе пустой ответ не отличить от
  // «токенов нет», и чинить приходится вслепую.
  let молчат = 0;
  let залистили = 0;
  const описания = new Map();
  for (const tok of tokens) {
    // Токены Solana идут своей дорогой: их кривая живёт в другой цепочке,
    // и запрос к tonapi по её адресу возвращал пустоту — такой токен
    // просто не попадал в витрину и молчал в уведомлениях.
    if (цепочка(tok) === "solana") {
      const строка = await ветвьSolana(tok, прошлыеКеши.get(tok.id));
      if (строка) строки.push(строка); else молчат += 1;
      continue;
    }

    const st = await состояние(tok.curve_address);
    if (!st) { молчат += 1; continue; }

    const params = {
      virtualTon: st.virtualTon || DEFAULT_VIRTUAL_TON,
      virtualTokens: st.virtualTokens || DEFAULT_VIRTUAL_TOKENS,
      feeBps: st.feeBps || DEFAULT_FEE_BPS,
    };
    const [история, meta] = await Promise.all([
      сделки(tok.curve_address, params.feeBps),
      tok.address ? метаданные(tok.address) : Promise.resolve(null),
    ]);

    if (meta && meta.description) описания.set(tok.id, String(meta.description).slice(0, 600));

    const заСутки = история.filter((p) => p.time >= сутки);
    const объём = заСутки.reduce((s, p) => s + Number(p.ton) / 1e9, 0);
    // Цена сутки назад — состояние кривой после последней сделки до
    // окна. Сделок до окна не было — кривая стояла на стартовой цене.
    const доОкна = история.filter((p) => p.time < сутки);
    const прежняя = цена(доОкна.length ? доОкна[доОкна.length - 1].realTon : 0n, params);
    const сейчас = цена(st.realTon, params);

    // Кривая закрылась — с этого момента цена живёт в пуле. Отмечаем
    // время, когда он принял ликвидность: по нему приложение отличает
    // «переезжает» от «торгуется».
    let пул = null;
    if (естьЛистинг && st.graduated && tok.dex_pool_address) {
      пул = await состояниеПула(tok.dex_pool_address);
      if (пул && пул.ready && !tok.listed_at) {
        await admin.from("tokens")
          .update({ listed_at: new Date().toISOString() })
          .eq("id", tok.id);
        залистили += 1;
      }
    }

    // После закрытия кривой её резервы равны нулю: всё уехало в пул.
    // Брать цену оттуда — значит показывать ноль на витрине, поэтому у
    // закрытых токенов и цена, и «сколько в рынке» считаются по пулу.
    const вПуле = пул && пул.ready;
    const ценаПула = вПуле ? Number(пул.tonReserve) / Number(пул.tokenReserve) : 0;

    строки.push({
      token_id: tok.id,
      curve_address: tok.curve_address,
      price_ton: вПуле ? ценаПула : сейчас,
      real_ton: вПуле ? Number(пул.tonReserve) / 1e9 : Number(st.realTon) / 1e9,
      graduation_ton: Number(st.graduationTon) / 1e9,
      tokens_sold: Number(st.tokensSold) / 1e9,
      supply: meta && meta.supply ? meta.supply : DEFAULT_SUPPLY,
      fee_bps: Number(params.feeBps),
      graduated: !!st.graduated,
      // Кошелёк самой кривой держателем не считаем: на нём лежит
      // непроданный запас.
      holders: meta && meta.holders != null ? Math.max(0, meta.holders - 1) : null,
      vol24_ton: объём,
      change24: прежняя > 0 && (вПуле ? ценаПула : сейчас) > 0
        ? (((вПуле ? ценаПула : сейчас) - прежняя) / прежняя) * 100
        : 0,
      tx24: заСутки.length,
      logo_url: tok.logo_url || (meta && meta.image) || null,
      // История для графика. Нанотоны — строками: в JSON они не
      // помещаются в число без потери точности, а приложение всё равно
      // приводит их к BigInt.
      trades: история.map((p) => ({ t: p.time, ton: p.ton.toString(), r: p.realTon.toString() })),
      updated_at: new Date().toISOString(),
    });
  }

  if (!строки.length) {
    return res.status(200).json({ updated: 0, tokens: tokens.length, silent: молчат, network: TESTNET ? "testnet" : "mainnet" });
  }

  const { error: writeError } = await admin.from("curve_cache").upsert(строки, { onConflict: "token_id" });
  if (writeError) return res.status(500).json({ error: "cache_failed", detail: writeError.message });

  // Заодно чиним логотип в самой карточке токена: обход всё равно
  // прочитал метаданные, а без этого поле оставалось пустым у всех, кто
  // запускал токен до того, как приложение стало брать ссылку с запуска.
  const безЛоготипа = строки.filter((s) => s.logo_url && !tokens.find((t) => t.id === s.token_id).logo_url);
  for (const s of безЛоготипа) {
    await admin.from("tokens").update({ logo_url: s.logo_url }).eq("id", s.token_id);
  }

  // То же и с описанием: пишем только тем, у кого его нет. Перезаписывать
  // нельзя — в базе лежит то, что автор ввёл сам, а в цепочке могла
  // остаться версия постарше.
  for (const [id, текст] of (естьОписание ? описания : [])) {
    if (!tokens.find((t) => t.id === id)?.description) {
      await admin.from("tokens").update({ description: текст }).eq("id", id);
    }
  }

  /* Механики, включённые при запуске.
     Живой график правится в чате на каждом обходе, фонд выкупа
     пересчитывается по обороту — обе вещи обещаны покупателю на
     странице токена, и держать их обещанием на словах нельзя. */
  let графиков = 0;
  let фондов = 0;
  {
    const { data: свойства } = await admin
      .from("tokens")
      .select("id, name, ticker, chain, live_chart, buyback, chat_id")
      .in("id", строки.map((с) => с.token_id));
    for (const токен of свойства || []) {
      const кеш = строки.find((с) => с.token_id === токен.id);
      if (!кеш) continue;

      if (токен.live_chart) {
        const вышло = await обновитьЖивойГрафик(admin, { токен, кеш }).catch(() => false);
        if (вышло) графиков += 1;
      }

      if (токен.buyback) {
        // Фонд — доля площадки с оборота этого токена. Считаем от того
        // же оборота, что показан на витрине: другой цифры у нас нет, а
        // выдумывать её нельзя.
        const оборот = Number(кеш.vol24_ton) || 0;
        const комиссия = оборот * (Number(кеш.fee_bps || 100) / 10000);
        const { error } = await admin.from("token_buyback").upsert({
          token_id: токен.id,
          pool_ton: комиссия * BUYBACK_ДОЛЯ,
          updated_at: new Date().toISOString(),
        }, { onConflict: "token_id" });
        if (!error) фондов += 1;
      }
    }
  }

  return res.status(200).json({ updated: строки.length, tokens: tokens.length, silent: молчат, logos: безЛоготипа.length, listed: залистили, charts: графиков, buyback: фондов });
}
