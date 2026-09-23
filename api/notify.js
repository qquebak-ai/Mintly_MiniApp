// Уведомления создателям токенов — серверная часть.
//
// Мини-приложение открыто не всегда, а знать о своём токене человек
// хочет постоянно. Поэтому раз в несколько минут сюда приходит расписание
// Vercel, читает состояние каждой живой кривой прямо с цепочки и, если
// с прошлого раза что-то изменилось, пишет владельцу в Telegram.
//
// Что шлём:
//   • кто-то купил — в кривой прибавилось TON;
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

async function tell(chatId, text) {
  if (!chatId) return false;
  // Человек мог не начинать диалог с ботом, заблокировать его или
  // выключить уведомления (/off) — это нормальный исход, а не сбой.
  const { уведомить } = await import("./_trading.js");
  return уведомить(chatId, text);
}

const fmt = (n) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

/* Перевод порога из TON в SOL по стоимости. Курсы за заход спрашиваются
   один раз; если биржи молчат, берём грубое соотношение — лучше порог
   мимо на четверть, чем сотня сообщений о центовых покупках. */
let курсы = null;
async function вМонету(вTon) {
  if (!курсы) {
    try {
      const { курсSol, курсTon } = await import("./_market.js");
      const [sol, ton] = await Promise.all([курсSol(), курсTon()]);
      курсы = { sol: Number(sol) || 0, ton: Number(ton) || 0 };
    } catch {
      курсы = { sol: 0, ton: 0 };
    }
  }
  if (курсы.sol > 0 && курсы.ton > 0) return (вTon * курсы.ton) / курсы.sol;
  return вTon / 500;
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

  const owners = [...new Set(tokens.map((t) => t.owner_id).filter(Boolean))];
  // Настройки берём вместе с адресом: что слать и с какой суммы,
  // решает получатель. Колонок может ещё не быть в базе — тогда
  // работают значения по умолчанию.
  let profiles = null;
  const owned = owners.length ? owners : ["00000000-0000-0000-0000-000000000000"];
  const full = await admin
    .from("profiles")
    .select("id, telegram_id, notify_buys, notify_min_ton, notify_progress")
    .in("id", owned);
  if (full.error) {
    const plain = await admin.from("profiles").select("id, telegram_id").in("id", owned);
    profiles = plain.data;
  } else {
    profiles = full.data;
  }
  const chatOf = new Map((profiles || []).map((p) => [p.id, p.telegram_id]));
  const prefOf = new Map((profiles || []).map((p) => [p.id, {
    buys: p.notify_buys !== false,
    progress: p.notify_progress !== false,
    minTon: Number(p.notify_min_ton) >= 0 ? Number(p.notify_min_ton) : MIN_BUY_TON,
  }]));

  // Готовые числа по кривым. Одним запросом на всю пачку — раньше на
  // каждый токен уходил отдельный поход в цепочку, и заход упирался в
  // лимиты уже на третьем десятке.
  const { data: cached } = await admin
    .from("curve_cache")
    .select("token_id, real_ton, graduation_ton, graduated, updated_at")
    .in("token_id", tokens.map((t) => t.id));
  const кешОт = new Map((cached || []).map((c) => [c.token_id, c]));

  const { data: states } = await admin
    .from("token_notify")
    .select("token_id, last_real_ton, sent_half, sent_almost, sent_closed")
    .in("token_id", tokens.map((t) => t.id));
  const stateOf = new Map((states || []).map((s) => [s.token_id, s]));

  let sent = 0;
  let checked = 0;

  let дочитано = 0;

  for (const tok of tokens) {
    let curve = null;
    const кеш = кешОт.get(tok.id);
    const свежий = кеш && кеш.updated_at && Date.now() - new Date(кеш.updated_at).getTime() < КЕШ_СВЕЖ_МС;
    if (свежий && кеш.graduation_ton != null) {
      curve = {
        realTon: Number(кеш.real_ton) || 0,
        graduationTon: Number(кеш.graduation_ton) || 0,
        graduated: !!кеш.graduated,
      };
    } else if (дочитано < ЧИТАТЬ_ИЗ_ЦЕПОЧКИ) {
      дочитано += 1;
      try { curve = await состояниеКривой(tok); } catch { /* сеть подведёт — попробуем в следующий заход */ }
    }
    if (!curve) continue;
    checked += 1;
    // Монета, в которой считается кривая. В сообщении она важнее всего
    // остального: «купили на 0.4» без единицы читается как угодно.
    const монета = цепочка(tok) === "solana" ? "SOL" : "TON";

    const prev = stateOf.get(tok.id) || { last_real_ton: null, sent_half: false, sent_almost: false, sent_closed: false };
    const chat = chatOf.get(tok.owner_id);
    const label = `$${tok.ticker || tok.name || "?"}`;
    const target = curve.graduationTon;
    const pct = target > 0 ? (curve.realTon / target) * 100 : 0;

    const next = {
      token_id: tok.id,
      last_real_ton: curve.realTon,
      sent_half: prev.sent_half,
      sent_almost: prev.sent_almost,
      sent_closed: prev.sent_closed,
      checked_at: new Date().toISOString(),
    };

    // Первый заход по токену ничего не шлёт: сравнивать не с чем, и
    // человек получил бы «купили на 12 TON» за всю прошлую неделю.
    const known = prev.last_real_ton != null;
    const grew = known ? curve.realTon - prev.last_real_ton : 0;

    // Веха токена и то, достигнута ли она прямо сейчас. Считаем до
    // рассылки: при частых заходах обход держателей ради уже разосланной
    // вехи стоил бы запроса к базе на каждого из них каждые пять минут.
    const событие = curve.graduated ? "closed" : pct >= 90 ? "almost" : pct >= 50 ? "half" : null;
    const впервые = событие === "closed" ? !prev.sent_closed
      : событие === "almost" ? !prev.sent_almost
        : событие === "half" ? !prev.sent_half : false;

    const pref = prefOf.get(tok.owner_id) || { buys: true, progress: true, minTon: MIN_BUY_TON };
    if (chat) {
      // Порог человек задаёт в TON — он один на все его токены. Для
      // кривой в Solana тот же порог берём по стоимости, а не по числу:
      // 0.05 SOL это десяток долларов, и владелец не услышал бы почти
      // ни одной покупки.
      const порог = Math.max(0, монета === "SOL" ? await вМонету(pref.minTon) : pref.minTon);
      if (pref.buys && grew >= порог) {
        if (await tell(chat, `Купили <b>${label}</b> на ${fmt(grew)} ${монета}\nВ кривой уже ${fmt(curve.realTon)} из ${fmt(target)} ${монета}`)) sent += 1;
      } else if (pref.buys && grew > 0) {
        // Покупка меньше порога: точку отсчёта не сдвигаем, иначе при
        // частых заходах мелкие сделки просто исчезали бы одна за другой,
        // так и не сложившись в сумму, о которой стоит написать.
        next.last_real_ton = prev.last_real_ton;
      }
      if (!pref.progress) {
        // Вехи выключены — отметки всё равно ставим, иначе после
        // включения прилетит всё сразу за прошлый месяц.
        next.sent_closed = curve.graduated || prev.sent_closed;
        next.sent_almost = pct >= 90 || prev.sent_almost;
        next.sent_half = pct >= 50 || prev.sent_half;
      } else if (curve.graduated && !prev.sent_closed) {
        if (await tell(chat, `<b>${label}</b> закрыл кривую 🎉\nСобрано ${fmt(curve.realTon)} ${монета}. Торговля в приложении закончилась, из собранного заводится пара на бирже — напишем, когда она появится.`)) sent += 1;
        next.sent_closed = true;
      } else if (!curve.graduated && pct >= 90 && !prev.sent_almost) {
        if (await tell(chat, `<b>${label}</b> почти на бирже: ${pct.toFixed(0)}% пути\nОсталось ${fmt(Math.max(0, target - curve.realTon))} ${монета}`)) sent += 1;
        next.sent_almost = true;
      } else if (!curve.graduated && pct >= 50 && !prev.sent_half) {
        if (await tell(chat, `<b>${label}</b> прошёл половину пути до биржи\nВ кривой ${fmt(curve.realTon)} из ${fmt(target)} ${монета}`)) sent += 1;
        next.sent_half = true;
      }
    } else {
      // Владельца в Telegram нет — отметки всё равно ставим, иначе
      // веха считалась бы новой при каждом заходе.
      next.sent_closed = curve.graduated || prev.sent_closed;
      next.sent_almost = pct >= 90 || prev.sent_almost;
      next.sent_half = pct >= 50 || prev.sent_half;
    }

    // Держателям — свои вехи. Владельцу приложение писало давно, а
    // тому, кто просто купил чужой токен, не приходило ничего: ни
    // «вышел на биржу», ни «прошёл половину пути». Начинается это с
    // первой же покупки — держатель определяется по своим сделкам.
    if (событие && впервые) {
      const { data: holders } = await admin.rpc("token_holders", { p_token: tok.id });
      for (const h of holders || []) {
        if (!h.telegram_id || h.user_id === tok.owner_id) continue; // владельцу уже написали
        const { data: было } = await admin
          .from("holder_notify")
          .select("event")
          .eq("user_id", h.user_id)
          .eq("token_id", tok.id)
          .eq("event", событие)
          .maybeSingle();
        if (было) continue;
        const текст = событие === "closed"
          ? `<b>${label}</b> закрыл кривую 🎉\nТвои токены никуда не делись: из собранного заводится пара на бирже, торговля продолжится там.`
          : событие === "almost"
            ? `<b>${label}</b> почти на бирже: ${pct.toFixed(0)}% пути\nОсталось ${fmt(Math.max(0, target - curve.realTon))} ${монета}`
            : `<b>${label}</b> прошёл половину пути до биржи\nВ кривой ${fmt(curve.realTon)} из ${fmt(target)} ${монета}`;
        if (await tell(h.telegram_id, текст)) sent += 1;
        await admin.from("holder_notify").upsert(
          { user_id: h.user_id, token_id: tok.id, event: событие },
          { onConflict: "user_id,token_id,event" },
        );
      }
    }

    await admin.from("token_notify").upsert(next, { onConflict: "token_id" });
  }

  return ok(res, { checked, sent });
}
