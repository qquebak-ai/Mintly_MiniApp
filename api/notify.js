// Уведомления создателям токенов — серверная часть.
//
// Мини-приложение открыто не всегда, а знать о своём токене человек
// хочет постоянно. Раньше о сделках писал только обход раз в десять минут
// — покупки приходили суммой и с опозданием. Теперь весть уходит в момент
// изменения кривой (вестиПоКривой ниже): её зовут поток Solana
// (api/curve-stream.js), наблюдатель после своей сделки TON
// (api/wallet-ton.js) и круг кривых (api/refresh-curves.js). Обход
// остался подстраховкой.
//
// Что шлём:
//   • кто-то купил или продал — каждая сделка от порога из настроек
//     отдельным сообщением;
//   • своя сделка прошла — тому, кто её сделал;
//   • половина и девять десятых пути до листинга;
//   • кривая закрылась.
//
// Нужные переменные окружения (Vercel → Project Settings → Environment
// Variables), все серверные, без префикса VITE_:
//   TRADING_BOT_TOKEN         — токен бота MintlyTrading из @BotFather
//   SUPABASE_URL              — тот же URL, что и во VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY — service_role ключ проекта Supabase
//   CRON_SECRET               — любая длинная строка; Vercel сам шлёт её
//                               в заголовке Authorization при вызове по
//                               расписанию, а чужой вызов без неё
//                               отбивается
//
// Расписание в vercel.json стоит раз в сутки: на бесплатном тарифе Vercel
// чаще нельзя, и деплой с более частым расписанием просто не собирается.
// Поэтому основной источник вызовов — крон на своём сервере, каждые пять
// минут; расписание Vercel остаётся подстраховкой на случай, если сервер
// молчит. Оба пути безопасны: состояние «уже отправляли» лежит в базе,
// и лишний заход ничего не продублирует.
// Если нужны уведомления раз в несколько минут, есть два пути: тариф Pro
// или любой внешний планировщик, который дёргает
//   POST https://<домен>/api/notify
// с заголовком «Authorization: Bearer <CRON_SECRET>».
//
// Состояние прошлой проверки лежит в таблице token_notify (см.
// supabase_notify.sql). У неё нет ни одной политики доступа: писать в
// неё может только этот обработчик своим service_role ключом, а значит
// подделать «уже отправляли» из приложения нельзя.

import { createClient } from "@supabase/supabase-js";
import { поочерёдно } from "./_walletLock.js";

// Уведомления идут только отдельным ботом MintlyTrading: основной бот —
// для входа и команд, а сделки и деньги — в своём тихом канале.
const BOT_TOKEN = (process.env.TRADING_BOT_TOKEN || "").trim();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Сеть берём ту же, что и приложение (TON_TESTNET_NETWORK в src/App.tsx):
// у токенов из тестовой сети состояние лежит на testnet.tonapi.io и на
// боевом узле его нет. Приложение работает в боевой сети, поэтому и
// здесь она по умолчанию; тестовая включается явно — TON_TESTNET=1.
// Сеть задаётся одним переключателем на всё приложение (см.
// TON_TESTNET_NETWORK в src/App.tsx). Здесь по умолчанию тестовая —
// вернуть боевую можно переменной окружения TON_TESTNET=0.
// Боевая сеть по умолчанию. Тестовая включается явно: TON_TESTNET=1.
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";

// Сеть Solana своя: программа кривой ещё в devnet, и токены оттуда
// лежат в базе с network = "devnet". Обходить их надо наравне с
// боевыми — иначе у них нет ни цены на витрине, ни уведомлений.
const SOL_NETWORK = /devnet/.test(process.env.SOLANA_RPC || "") ? "devnet"
  : /testnet/.test(process.env.SOLANA_RPC || "") ? "testnet" : "mainnet";
const СЕТИ = [...new Set([TESTNET ? "testnet" : "mainnet", SOL_NETWORK])];

// Сколько токенов проверяем за один заход. Состояние берём из
// curve_cache — там оно уже посчитано обходом (api/refresh-curves.js),
// и упереться в лимиты tonapi нечем. В цепочку ходим только за теми,
// кого в кеше нет или чья запись протухла, и таких за заход берём
// немного — отсюда два разных числа.
const BATCH = 200;
const ЧИТАТЬ_ИЗ_ЦЕПОЧКИ = 15;

// Насколько свежей должна быть запись кеша, чтобы ей верить. Обход
// ходит раз в минуту; пять минут — это запас на его пропуски.
const КЕШ_СВЕЖ_МС = 5 * 60 * 1000;

// Порог по умолчанию — для тех, кто ничего не выбирал. Свой каждый
// задаёт в настройках приложения (profiles.notify_min_ton): у кого токен
// разбирают мелкими сделками, тому десятки сообщений в день не нужны.
const MIN_BUY_TON = 0.05;

function ok(res, body) { return res.status(200).json(body); }

async function tonapi(path) {
  const res = await fetch(`${TONAPI}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`tonapi ${res.status}`);
  return res.json();
}

// Состояние кривой. Поля идут в том же порядке, что и в структуре
// CurveData контракта: менять его нельзя, не поправив здесь.
async function curveState(address) {
  const json = await tonapi(`/v2/blockchain/accounts/${address}/methods/data`);
  const stack = json?.stack || [];
  if (stack.length < 7) return null;
  const num = (i) => Number(BigInt(stack[i].num)) / 1e9;
  return {
    realTon: num(2),
    graduationTon: num(5),
    graduated: stack[7] ? Number(BigInt(stack[7].num)) !== 0 : false,
  };
}

/* Цепочка токена. Колонке верим, а когда она пуста (токены постарше
   записывались без неё) — смотрим на сам адрес: у TON это 48 символов
   base64url с приставкой EQ/UQ/kQ/0Q, у Solana — 32-44 символа base58. */
function цепочка(tok) {
  if (tok && tok.chain) return tok.chain === "solana" ? "solana" : "ton";
  const адрес = String((tok && tok.address) || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(адрес) && !/^(EQ|UQ|kQ|0Q)/.test(адрес) ? "solana" : "ton";
}

/* Состояние кривой независимо от цепочки. Числа складываются в те же
   поля: разница только в монете, а вехи и пороги считаются одинаково.
   Раньше сюда попадал любой токен с адресом кривой, и токены Solana
   спрашивались у tonapi — то есть не спрашивались вовсе, и их владельцам
   не приходило ни одного сообщения. */
async function состояниеКривой(tok) {
  if (цепочка(tok) !== "solana") return curveState(tok.curve_address);
  const { состояние } = await import("./solana-launch.js");
  const st = await состояние(tok.address);
  if (!st) return null;
  return { realTon: st.solСобрано, graduationTon: st.solЦель, graduated: !!st.закрыта };
}

async function tell(chatId, text, вид) {
  if (!chatId) return false;
  // Человек мог не начинать диалог с ботом, заблокировать его или
  // выключить уведомления (/off) — это нормальный исход, а не сбой.
  const { уведомить } = await import("./_trading.js");
  // Закрытие кривой — «биржа», остальное — сделки и путь к бирже.
  return уведомить(chatId, text, вид || (/закрыл кривую/.test(text) ? "listing" : "trade"));
}

// Сумма монеты: у мелких сделок важны первые значащие цифры — «0.00» о
// покупке на тысячную SOL не говорит ничего.
const fmt = (n) => {
  const v = Math.abs(Number(n) || 0);
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  if (!(v > 0)) return "0";
  // Две значащие цифры, как и у сумм покрупнее («0.50», «0.0012»); совсем
  // крошечные toPrecision пишет через e — их расписываем дробью.
  const s = v.toPrecision(2);
  return /e/.test(s) ? v.toFixed(9).replace(/0+$/, "") : s;
};
// Число токенов: мемкоины считаются миллионами, дроби там не нужны.
const fmtШтук = (n) => {
  const v = Math.abs(Number(n) || 0);
  return v >= 1000 ? Math.round(v).toLocaleString("ru-RU") : String(Number(v.toFixed(2)));
};
// Монета TON в приложении называется GRAM — и в сообщениях так же.
const ТИКЕР_TON = "GRAM";

/* Перевод порога из TON в SOL по стоимости. Если биржи молчат, берём
   грубое соотношение — лучше порог мимо на четверть, чем сотня сообщений
   о центовых покупках. Курс — не повод задерживать весть: годится и
   прошлый, свежий подтягивается в фоне. */
let курсы = { sol: 0, ton: 0, ts: 0 };
let курсыИдут = null;
function обновитьКурсы() {
  if (курсыИдут) return курсыИдут;
  курсыИдут = import("./_market.js")
    .then(({ курсSol, курсTon }) => Promise.all([курсSol(), курсTon()]))
    .then(([sol, ton]) => { if (Number(sol) > 0 && Number(ton) > 0) курсы = { sol: Number(sol), ton: Number(ton), ts: Date.now() }; })
    .catch(() => {})
    .finally(() => { курсыИдут = null; });
  return курсыИдут;
}
// Сервер держит вести всё время — курс берём заранее, а не на первой сделке.
if (BOT_TOKEN) обновитьКурсы();
async function вМонету(вTon) {
  if (!курсы.ts) await Promise.race([обновитьКурсы(), new Promise((r) => setTimeout(r, 1500))]);
  else if (Date.now() - курсы.ts > 10 * 60_000) обновитьКурсы();
  if (курсы.sol > 0 && курсы.ton > 0) return (вTon * курсы.ton) / курсы.sol;
  return вTon / 500;
}

/* --- Мгновенные вести ---------------------------------------------------
 *
 * Одна обработка на любое известие о кривой: из потока, из наблюдателя
 * за своей сделкой, из круга кривых или из обхода. Под замком на токен —
 * два источника об одном изменении не пришлют две вести. Каждое
 * известие сравнивается с прошлым (token_notify): разница и есть сделка.
 *
 * Источники отстают по-разному. Поток Solana сообщает об обработанном
 * блоке, а чтение счёта (круг, обход, опрос) видит подтверждённое — на
 * секунду-другую позже. Прочитанное сразу после сделки ещё без неё, и
 * поверх вести из потока оно стало бы «продали», а следующее чтение —
 * снова «купили». Поэтому у отстающих источников запас: их известие
 * применяется, только если за этот запас до прочтения ничего новее не
 * приходило. Пропущенное подхватит следующий круг.
 */
let базаВестей = null;
// Для проверки без настоящей базы (как заменитьБазуДляПроверки в api/wallet-evm.js).
export function заменитьБазуВестей(db) { базаВестей = db; }
function база() {
  if (!базаВестей) базаВестей = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return базаВестей;
}

const ПАМЯТЬ_МС = 60_000;
// Карточка токена (имя, тикер, владелец) почти не меняется, а спрашивают
// её на каждую сделку — держим десять минут. Ненайденный — пять секунд:
// кривая нового токена появляется в потоке раньше его строки в базе, а
// первые минуты после запуска — самые бойкие.
const ТОКЕН_ПАМЯТЬ_МС = 10 * 60_000;
const НЕТ_ТОКЕНА_МС = 5_000;
const токеныКеш = new Map(); // id:… | a:… -> { до, tok }
const людиКеш = new Map(); // user_id -> { до, chat, pref }
const целиКеш = new Map(); // token_id -> { до, цель }
const последнееПродано = new Map(); // token_id -> проданных токенов в прошлый раз
// Последнее обработанное по каждому токену. Круг кривых присылает каждую
// кривую раз в двадцать секунд — то, что уже обработано, отсекаем здесь,
// без похода в базу.
const применено = new Map(); // token_id -> { realTon, graduated }

function ужеЗнаем(id, curve) {
  const было = применено.get(id);
  if (!было) return false;
  // Закрытая кривая — навсегда: «собранное» дальше — резерв пула, не сделки.
  if (было.graduated && curve.graduated) return true;
  return Math.abs(было.realTon - curve.realTon) <= 1e-12 && было.graduated === curve.graduated;
}
// Свои сделки в пути: их итог приходит тем же известием, что и чужие, и
// по нему сделавшему уходит «прошла», а владельцу о своей же сделке —
// ничего.
const своиСделки = new Map(); // адрес токена -> [{ ид, userId, продажа, сумма, штук, сказать, до }]

async function токенВестей(db, { tokenId, адрес }) {
  const ключ = tokenId ? `id:${tokenId}` : `a:${адрес}`;
  const было = токеныКеш.get(ключ);
  if (было && было.до > Date.now()) return было.tok;
  const запрос = db.from("tokens").select("id, name, ticker, owner_id, chain, address, curve_address");
  const { data } = tokenId ? await запрос.eq("id", tokenId).limit(1) : await запрос.eq("address", адрес).limit(1);
  const tok = (data && data[0]) || null;
  токеныКеш.set(ключ, { до: Date.now() + (tok ? ТОКЕН_ПАМЯТЬ_МС : НЕТ_ТОКЕНА_МС), tok });
  if (токеныКеш.size > 5000) токеныКеш.clear();
  return tok;
}

async function человекВестей(db, id) {
  const было = людиКеш.get(id);
  if (было && было.до > Date.now()) return было;
  let p = null;
  const полный = await db.from("profiles").select("id, telegram_id, notify_buys, notify_min_ton, notify_progress").eq("id", id).maybeSingle();
  if (полный.error) {
    const простой = await db.from("profiles").select("id, telegram_id").eq("id", id).maybeSingle();
    p = простой.data;
  } else {
    p = полный.data;
  }
  const запись = {
    до: Date.now() + ПАМЯТЬ_МС,
    chat: (p && p.telegram_id) || null,
    pref: {
      buys: !p || p.notify_buys !== false,
      progress: !p || p.notify_progress !== false,
      // Пустая настройка — порог по умолчанию, а не ноль.
      minTon: p && p.notify_min_ton != null && Number(p.notify_min_ton) >= 0 ? Number(p.notify_min_ton) : MIN_BUY_TON,
    },
  };
  людиКеш.set(id, запись);
  if (людиКеш.size > 5000) людиКеш.clear();
  return запись;
}

async function цельВестей(db, tok) {
  const было = целиКеш.get(tok.id);
  if (было && было.до > Date.now()) return было.цель;
  const { data } = await db.from("curve_cache").select("graduation_ton").eq("token_id", tok.id).maybeSingle();
  const цель = Number(data && data.graduation_ton) || 0;
  целиКеш.set(tok.id, { до: Date.now() + 5 * ПАМЯТЬ_МС, цель });
  return цель;
}

/* Своя сделка в пути. сумма — монет в сделке (у продажи TON неизвестна,
   тогда 0 и сверяем по направлению), сказать — прислать ли «прошла» по
   известию (TON: сеть принимает сделку позже ответа сервера; Solana
   отвечает уже после подтверждения и говорит сама). */
export function своюСделку(адрес, { userId, продажа, сумма = 0, штук = 0, сказать = false }) {
  if (!адрес) return null;
  const ид = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const список = (своиСделки.get(адрес) || []).filter((с) => с.до > Date.now());
  список.push({ ид, userId, продажа: !!продажа, сумма: Number(сумма) || 0, штук: Number(штук) || 0, сказать, до: Date.now() + 90_000 });
  своиСделки.set(адрес, список);
  if (своиСделки.size > 5000) своиСделки.clear();
  return ид;
}
export function своюСделкуЗабыть(адрес, ид) {
  const список = своиСделки.get(адрес);
  if (список) своиСделки.set(адрес, список.filter((с) => с.ид !== ид));
}
export function своюСделкуЖдём(адрес, ид) {
  return !!(своиСделки.get(адрес) || []).some((с) => с.ид === ид && с.до > Date.now());
}

// Кривая берёт комиссию, а продажа отдаёт по ходу кривой — допуск 4%.
const похоже = (ждали, вышло) => Math.abs(ждали - вышло) <= Math.max(1e-6, 0.04 * ждали);

/* Свои сделки, которые объясняют это изменение кривой. Обычно одна; но
   две сделки людей площадки в одном блоке приходят одним известием —
   тогда изменение равно их сумме, и «прошла» положено каждому. */
function взятьСвои(tok, разница) {
  const список = (своиСделки.get(tok.address) || []).filter((с) => с.до > Date.now());
  const продажа = разница < 0;
  const сумма = Math.abs(разница);
  const теЖе = список.filter((с) => с.продажа === продажа);
  let взяты = [];
  let лучшая = null;
  for (const с of теЖе) {
    if (с.сумма > 0 && !похоже(с.сумма, сумма)) continue;
    if (!лучшая || Math.abs(с.сумма - сумма) < Math.abs(лучшая.сумма - сумма)) лучшая = с;
  }
  if (лучшая) взяты = [лучшая];
  else {
    const сСуммой = теЖе.filter((с) => с.сумма > 0);
    if (сСуммой.length > 1 && похоже(сСуммой.reduce((x, с) => x + с.сумма, 0), сумма)) взяты = сСуммой;
  }
  if (взяты.length) своиСделки.set(tok.address, список.filter((с) => !взяты.includes(с)));
  return взяты;
}

export async function сообщитьОСвоейСделке(userId, { продажа, тикер, монета, монет = 0, штук = 0 }) {
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY || !userId) return false;
  const кто = await человекВестей(база(), userId).catch(() => null);
  if (!кто || !кто.chat) return false;
  const что = штук > 0 ? `<b>${fmtШтук(штук)} $${тикер}</b>` : `<b>$${тикер}</b>`;
  const сколько = монет > 0 ? ` за ${fmt(монет)} ${монета}` : "";
  return tell(кто.chat, `${продажа ? "✅ Продажа прошла" : "✅ Покупка прошла"}: ${что}${сколько}`, "wallet");
}

/* Обработка одного известия о кривой. curve — числа в монете сети;
   от — когда они прочитаны, запас — насколько источник может отставать
   (см. выше): известие, у которого за этот запас до прочтения уже было
   новее, ничего не пишет — иначе прежнее «собрано» приняли бы за
   продажу. */
async function обработатьКривую(db, tok, curve, от, запас = 0) {
  const { data: строка } = await db.from("token_notify")
    .select("token_id, last_real_ton, sent_half, sent_almost, sent_closed, checked_at")
    .eq("token_id", tok.id).maybeSingle();
  if (строка && строка.checked_at && new Date(строка.checked_at).getTime() > от - запас) return 0;
  const prev = строка || { last_real_ton: null, sent_half: false, sent_almost: false, sent_closed: false };
  const монета = цепочка(tok) === "solana" ? "SOL" : ТИКЕР_TON;
  const label = `$${tok.ticker || tok.name || "?"}`;
  const target = curve.graduationTon > 0 ? curve.graduationTon : await цельВестей(db, tok);
  const pct = target > 0 ? (curve.realTon / target) * 100 : 0;
  const known = prev.last_real_ton != null;
  const разница = known ? curve.realTon - Number(prev.last_real_ton) : 0;
  const владелец = tok.owner_id ? await человекВестей(db, tok.owner_id) : { chat: null, pref: { buys: true, progress: true, minTon: MIN_BUY_TON } };
  let sent = 0;

  /* Сделка. Первое известие о токене ничего не шлёт — сравнивать не с
     чем. После закрытия кривой «собранное» — уже не сделки, а переезд в
     пул. */
  if (known && !curve.graduated && Math.abs(разница) > 1e-9) {
    const штук = curve.sold != null && последнееПродано.has(tok.id) ? Math.abs(curve.sold - последнееПродано.get(tok.id)) : 0;
    const свои = взятьСвои(tok, разница);
    for (const своя of свои) {
      if (!своя.сказать) continue;
      await сообщитьОСвоейСделке(своя.userId, {
        // У покупки — сколько заплатил сам человек: в кривую входит за
        // вычетом комиссии.
        продажа: разница < 0, тикер: tok.ticker || tok.name || "?", монета,
        монет: своя.сумма > 0 ? своя.сумма : Math.abs(разница),
        штук: свои.length === 1 ? штук || своя.штук : своя.штук,
      });
    }
    // Владельцу о его же сделке не пишем: «прошла» он уже получил.
    const сам = свои.length > 0 && свои.every((с) => с.userId === tok.owner_id);
    if (!сам && владелец.chat && владелец.pref.buys) {
      const порог = Math.max(0, монета === "SOL" ? await вМонету(владелец.pref.minTon) : владелец.pref.minTon);
      if (Math.abs(разница) >= порог) {
        const текст = `${разница > 0 ? "🟢 Купили" : "🔴 Продали"} <b>${label}</b> на ${fmt(разница)} ${монета}`
          + (штук > 0 ? `\n${fmtШтук(штук)} ${label}` : "")
          + `\nВ кривой ${fmt(curve.realTon)} из ${fmt(target)} ${монета}`;
        if (await tell(владелец.chat, текст, "trade")) sent += 1;
      }
    }
  }
  if (curve.sold != null) {
    последнееПродано.set(tok.id, curve.sold);
    if (последнееПродано.size > 5000) последнееПродано.clear();
  }

  const next = {
    token_id: tok.id,
    last_real_ton: curve.realTon,
    sent_half: prev.sent_half,
    sent_almost: prev.sent_almost,
    sent_closed: prev.sent_closed,
    // Свежесть записанного «собрано»: известия старее неё не применяются.
    checked_at: new Date(от).toISOString(),
  };
  const событие = curve.graduated ? "closed" : pct >= 90 ? "almost" : pct >= 50 ? "half" : null;
  const впервые = событие === "closed" ? !prev.sent_closed
    : событие === "almost" ? !prev.sent_almost
      : событие === "half" ? !prev.sent_half : false;
  if (владелец.chat && владелец.pref.progress) {
    if (curve.graduated && !prev.sent_closed) {
      if (await tell(владелец.chat, `<b>${label}</b> закрыл кривую 🎉\nСобрано ${fmt(curve.realTon)} ${монета}. Торговля в приложении закончилась, из собранного заводится пара на бирже — напишем, когда она появится.`)) sent += 1;
    } else if (!curve.graduated && pct >= 90 && !prev.sent_almost) {
      if (await tell(владелец.chat, `<b>${label}</b> почти на бирже: ${pct.toFixed(0)}% пути\nОсталось ${fmt(Math.max(0, target - curve.realTon))} ${монета}`)) sent += 1;
    } else if (!curve.graduated && pct >= 50 && !prev.sent_half) {
      if (await tell(владелец.chat, `<b>${label}</b> прошёл половину пути до биржи\nВ кривой ${fmt(curve.realTon)} из ${fmt(target)} ${монета}`)) sent += 1;
    }
  }
  // Отметки ставим всегда — иначе веха считалась бы новой при каждом
  // известии, а после включения вех прилетело бы всё сразу.
  next.sent_closed = curve.graduated || prev.sent_closed;
  next.sent_almost = (target > 0 && pct >= 90) || prev.sent_almost;
  next.sent_half = (target > 0 && pct >= 50) || prev.sent_half;

  // Держателям — свои вехи, как и раньше: с первой же покупки.
  if (событие && впервые) {
    const { data: holders } = await db.rpc("token_holders", { p_token: tok.id });
    for (const h of holders || []) {
      if (!h.telegram_id || h.user_id === tok.owner_id) continue;
      const { data: было } = await db.from("holder_notify").select("event")
        .eq("user_id", h.user_id).eq("token_id", tok.id).eq("event", событие).maybeSingle();
      if (было) continue;
      const текст = событие === "closed"
        ? `<b>${label}</b> закрыл кривую 🎉\nТвои токены никуда не делись: из собранного заводится пара на бирже, торговля продолжится там.`
        : событие === "almost"
          ? `<b>${label}</b> почти на бирже: ${pct.toFixed(0)}% пути\nОсталось ${fmt(Math.max(0, target - curve.realTon))} ${монета}`
          : `<b>${label}</b> прошёл половину пути до биржи\nВ кривой ${fmt(curve.realTon)} из ${fmt(target)} ${монета}`;
      if (await tell(h.telegram_id, текст)) sent += 1;
      await db.from("holder_notify").upsert({ user_id: h.user_id, token_id: tok.id, event: событие }, { onConflict: "user_id,token_id,event" });
    }
  }

  // Пишем, только если что-то сдвинулось: известий по кривой много, а
  // запись на каждое — нагрузка на базу без пользы. У закрытой кривой
  // «собранное» — резерв пула: сравнивать его уже не с чем.
  const сдвиг = !строка
    || (!(curve.graduated && prev.sent_closed) && Math.abs(Number(строка.last_real_ton) - next.last_real_ton) > 1e-12)
    || строка.sent_half !== next.sent_half || строка.sent_almost !== next.sent_almost || строка.sent_closed !== next.sent_closed;
  if (сдвиг) await db.from("token_notify").upsert(next, { onConflict: "token_id" });
  применено.set(tok.id, { realTon: curve.realTon, graduated: curve.graduated });
  if (применено.size > 5000) применено.clear();
  return sent;
}

function весть(db, tok, curve, от, запас) {
  if (ужеЗнаем(tok.id, curve)) return Promise.resolve(0);
  return поочерёдно(`весть:${tok.id}`, () => обработатьКривую(db, tok, curve, от, запас));
}

/* Известие о кривой — от потока, наблюдателя или круга. Числа — в монете
   сети (SOL или GRAM), продано — в токенах; запас — у отстающих
   источников (круг, опрос), см. выше. */
export async function вестиПоКривой({ tokenId = null, адрес = null, собрано, продано = null, цель = null, закрыта = false, от = Date.now(), запас = 0 }) {
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) return 0;
  if (!(Number(собрано) >= 0)) return 0;
  const curve = {
    realTon: Number(собрано) || 0,
    sold: продано == null ? null : Number(продано),
    graduationTon: Number(цель) || 0,
    graduated: !!закрыта,
  };
  if (tokenId && ужеЗнаем(tokenId, curve)) return 0;
  const db = база();
  const tok = await токенВестей(db, { tokenId, адрес }).catch(() => null);
  if (!tok) return 0;
  return весть(db, tok, curve, от, запас)
    .catch((e) => { console.warn("[вести]", tok.ticker, e && e.message); return 0; });
}

export default async function handler(req, res) {
  if (!BOT_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "not_configured" });
  }
  // Обработчик ходит по цепочке и шлёт людям сообщения — дёргать его
  // снаружи не должен никто.
  const auth = req.headers.authorization || "";
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: tokens, error } = await admin
    .from("tokens")
    .select("id, name, ticker, curve_address, owner_id, chain, address")
    .not("curve_address", "is", null)
    // Токены прежней сети сюда попадать не должны: их кривых на этом
    // узле нет, каждая проверка уходила бы в пустоту и занимала место в
    // пачке, которую и так ограничивает tonapi.
    .in("network", СЕТИ)
    .order("created_at", { ascending: false })
    .limit(BATCH);
  if (error) return res.status(500).json({ error: "tokens_failed", detail: error.message });
  if (!tokens || !tokens.length) return ok(res, { checked: 0, sent: 0 });

  // Настройки получателей читает сама обработка (человекВестей) — с
  // памятью на минуту, одной строкой на человека.

  // Готовые числа по кривым. Одним запросом на всю пачку — раньше на
  // каждый токен уходил отдельный поход в цепочку, и заход упирался в
  // лимиты уже на третьем десятке.
  const { data: cached } = await admin
    .from("curve_cache")
    .select("token_id, real_ton, graduation_ton, graduated, updated_at")
    .in("token_id", tokens.map((t) => t.id));
  const кешОт = new Map((cached || []).map((c) => [c.token_id, c]));

  let sent = 0;
  let checked = 0;

  let дочитано = 0;

  for (const tok of tokens) {
    let curve = null;
    let от = Date.now();
    // Чтение цепочки отстаёт от потока на секунды; кеш — ещё и на время
    // круга (метку ставят после истории и метаданных токена).
    let запас = 15_000;
    const кеш = кешОт.get(tok.id);
    const свежий = кеш && кеш.updated_at && Date.now() - new Date(кеш.updated_at).getTime() < КЕШ_СВЕЖ_МС;
    if (свежий && кеш.graduation_ton != null) {
      curve = {
        realTon: Number(кеш.real_ton) || 0,
        graduationTon: Number(кеш.graduation_ton) || 0,
        graduated: !!кеш.graduated,
        sold: null,
      };
      // Кеш обхода старше потока: прочитанное раньше последней вести
      // ничего не решает (см. обработатьКривую).
      от = new Date(кеш.updated_at).getTime();
      запас = 75_000;
    } else if (дочитано < ЧИТАТЬ_ИЗ_ЦЕПОЧКИ) {
      дочитано += 1;
      try { curve = await состояниеКривой(tok); } catch { /* сеть подведёт — попробуем в следующий заход */ }
      if (curve) curve.sold = null;
    }
    if (!curve) continue;
    checked += 1;
    sent += await весть(admin, tok, curve, от, запас).catch(() => 0);
  }

  return ok(res, { checked, sent });
}
