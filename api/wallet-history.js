/* Всё, что кошелёк потратил и получил, одним списком.
 *
 * Сделки приложение и так знает: оно само их записывает в trades. А вот
 * запуск токена, вывод на свой адрес, свод излишков и закрытие кривой
 * живут только в журнале операций — он серверный, закрыт от браузера
 * вместе с адресами и ip. Из-за этого история показывала покупки с
 * продажами и молчала о тратах, которые человек видел в балансе, но не
 * находил в списке.
 *
 * Отдельно — пополнения. Их приложение не делает: деньги приходят
 * снаружи, с чужого кошелька или с биржи, и в базе от них не остаётся
 * ничего. Поэтому входящие переводы дочитываются прямо из сети по
 * адресу кошелька и подмешиваются в тот же список. Свои операции при
 * этом отсеиваются по подписи: продажа тоже увеличивает баланс, но она
 * уже есть в истории как продажа.
 *
 * Здесь журнал пересказывается наружу: без ip, без внутренних полей —
 * вид операции, сумма, монета, время и подпись, по которой её видно в
 * обозревателе.
 *
 * Переменные окружения: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SOLANA_RPC, TONAPI_KEY (по желанию), TON_TESTNET.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const TESTNET = process.env.TON_TESTNET === "1";
const TONAPI = TESTNET ? "https://testnet.tonapi.io" : "https://tonapi.io";
const TONAPI_KEY = (process.env.TONAPI_KEY || "").trim();

// Столько строк отдаём за раз: история кошелька читается на экране
// целиком, листать её постранично незачем.
const ПРЕДЕЛ = 60;
// Сколько последних переводов смотрим в сети. Больше десятка в истории
// кошелька всё равно не помещается, а каждый лишний — запрос к узлу.
const ВХОДЯЩИХ = 12;
// Пыль не показываем: аренда счёта и возвраты по копейке засоряют список.
const МЕЛОЧЬ = 0.000001;
/* С какой суммы уход с кошелька считается переводом. Комиссия сети —
   тысячные доли сотой, и без этого порога в истории стояли бы строки
   «отправлено 0,000005». */
const РАСХОД_ОТ = 0.0002;

/* Сколько ждём сеть. Журнал операций отдаётся в любом случае: без
   пополнений история неполна, а без неё самой — пуста, и это хуже.
   Полторы секунды вместо трёх с половиной: экран открывается с
   заготовками, и держать их лишние две секунды ради пополнений, которых
   чаще всего нет, — плохая сделка. Не успевший ответ доедет следующим
   кругом, он идёт через десять секунд. */
const ЖДЁМ_СЕТЬ_МС = 1500;

// Ответ сети живёт полминуты: экран кошелька перечитывает историю по
// таймеру, и ходить в цепочку на каждый круг незачем.
const ПАМЯТЬ_МС = 30 * 1000;
const кеш = new Map(); // `${chain}|${адрес}` -> { до, ряд }

function admin() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function хозяин(req, db) {
  const заголовок = req.headers.authorization || "";
  const токен = заголовок.startsWith("Bearer ") ? заголовок.slice(7) : "";
  if (!токен) return null;
  const { data, error } = await db.auth.getUser(токен);
  if (error || !data || !data.user) return null;
  return data.user;
}

async function rpc(тело) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(тело),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  return await res.json();
}

/* Входящие переводы в Solana.
 *
 * Подписи берём одним запросом, а разбор — пачкой в одном же: узел
 * принимает массив вызовов, и двенадцать транзакций стоят столько же
 * кругов, сколько одна. Пополнением считаем рост баланса нашего адреса:
 * кто и как его сделал, для истории неважно. */
async function пополненияSolana(адрес, чужие) {
  const подписи = await rpc({
    jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
    params: [адрес, { limit: ВХОДЯЩИХ }],
  }).then((j) => (j && j.result) || []).catch(() => []);

  const нужные = подписи.filter((п) => п && p_ок(п) && !чужие.has(п.signature));
  if (!нужные.length) return [];

  const пачка = нужные.map((п, i) => ({
    jsonrpc: "2.0", id: i + 1, method: "getTransaction",
    params: [п.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
  }));
  const ответы = await rpc(пачка).catch(() => null);
  if (!Array.isArray(ответы)) return [];

  const ряд = [];
  for (const о of ответы) {
    const tx = о && о.result;
    const мета = tx && tx.meta;
    const ключи = tx && tx.transaction && tx.transaction.message && tx.transaction.message.accountKeys;
    if (!мета || !Array.isArray(ключи)) continue;
    const место = ключи.findIndex((к) => (typeof к === "string" ? к : к.pubkey) === адрес);
    if (место < 0) continue;
    const было = Number((мета.preBalances || [])[место]) || 0;
    const стало = Number((мета.postBalances || [])[место]) || 0;
    const разница = (стало - было) / 1e9;
    const подпись = tx.transaction.signatures[0];
    // Вторая сторона перевода — для окна подробностей: кто прислал
    // (плательщик комиссии) или куда ушло (у кого баланс вырос больше всех).
    const адреса = ключи.map((к) => (typeof к === "string" ? к : к.pubkey));
    if (разница > МЕЛОЧЬ) {
      ряд.push({
        id: `in-${подпись}`,
        chain: "solana",
        kind: "deposit",
        amount: разница,
        signature: подпись,
        address: адреса[0] && адреса[0] !== адрес ? адреса[0] : null,
        createdAt: new Date((tx.blockTime || 0) * 1000).toISOString(),
      });
      continue;
    }
    /* Уходящие переводы читаем оттуда же. Свои операции приложение
       записывает в журнал и они уже отсеяны по подписи, а вот перевод,
       сделанный мимо приложения — или тот, чью запись не удалось
       сохранить, — в истории не появлялся вовсе: человек видел, что
       денег стало меньше, и не находил куда.
       Порог здесь выше пыли: комиссия сети сама по себе не перевод. */
    const ушло = -разница;
    if (ушло > РАСХОД_ОТ) {
      let кому = null, больше = 0;
      адреса.forEach((а, i) => {
        if (а === адрес) return;
        const рост = (Number((мета.postBalances || [])[i]) || 0) - (Number((мета.preBalances || [])[i]) || 0);
        if (рост > больше) { больше = рост; кому = а; }
      });
      ряд.push({
        id: `out-${подпись}`,
        chain: "solana",
        kind: "withdraw",
        amount: ушло,
        signature: подпись,
        address: кому,
        createdAt: new Date((tx.blockTime || 0) * 1000).toISOString(),
      });
    }
  }
  return ряд;
}

// Отбрасываем неудачные транзакции: денег они не принесли.
function p_ок(п) {
  return !п.err;
}

/* Адреса TON. tonapi отдаёт их в сыром виде («0:…»), а кошелёк записан
   в дружеском (UQ…/EQ…), и сверка по хвосту строки не сходилась
   никогда: хвост дружеского адреса — контрольная сумма, у сырого — сам
   счёт. Пополнения TON из-за этого в историю не попадали вовсе. Теперь
   оба вида приводятся к сырому, а наружу адрес уходит дружеским — его и
   узнаёт человек. */
let тон = null;
async function адресаTON() {
  if (!тон) тон = await import("@ton/core");
  const сырой = (а) => { try { return тон.Address.parse(String(а)).toRawString(); } catch { return String(а || "").toLowerCase(); } };
  const дружеский = (а) => { try { return тон.Address.parse(String(а)).toString({ bounceable: false, testOnly: TESTNET }); } catch { return а || null; } };
  return { сырой, дружеский };
}

/* Кривые TON площадки — по ним отсеиваются выплаты за продажу и возвраты
   газа: это не пополнение, а сама сделка, она уже в истории. */
let кривыеTON = { до: 0, набор: new Set() };
async function площадкаTON(db) {
  if (кривыеTON.до > Date.now()) return кривыеTON.набор;
  const { сырой } = await адресаTON();
  const { data } = await db.from("tokens").select("curve_address, dex_pool_address").not("curve_address", "is", null).limit(3000);
  const набор = new Set();
  for (const т of data || []) {
    if (т.curve_address) набор.add(сырой(т.curve_address));
    if (т.dex_pool_address) набор.add(сырой(т.dex_pool_address));
  }
  кривыеTON = { до: Date.now() + 5 * 60 * 1000, набор };
  return набор;
}

/* Входящие переводы в TON. tonapi отдаёт готовые события с разбором по
   действиям — самим считать балансы не нужно. */
async function пополненияTON(адрес, чужие, площадка = new Set()) {
  try {
    const { сырой, дружеский } = await адресаTON();
    const res = await fetch(`${TONAPI}/v2/accounts/${адрес}/events?limit=${ВХОДЯЩИХ}`, {
      headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
    });
    if (!res.ok) return [];
    const j = await res.json();
    const ряд = [];
    for (const событие of (j && j.events) || []) {
      for (const действие of событие.actions || []) {
        const п = действие.TonTransfer;
        if (!п || !п.recipient || п.recipient.address === undefined) continue;
        // Сравниваем по «сырому» виду: tonapi отдаёт адреса в нём, а у
        // нас кошелёк записан в дружелюбном.
        const сумма = Number(п.amount || 0) / 1e9;
        if (!(сумма > МЕЛОЧЬ)) continue;
        if (действие.status && действие.status !== "ok") continue;
        if (чужие.has(событие.event_id)) continue;
        const наш = сырой(адрес);
        const кому = сырой(п.recipient.address);
        const откого = п.sender && п.sender.address ? сырой(п.sender.address) : "";
        const намПришло = кому === наш;
        const мыОтправили = !!откого && откого === наш;
        // Выплата кривой или пула за продажу и возврат газа — часть сделки.
        if (намПришло && площадка.has(откого)) continue;
        // Ни то ни другое — событие чужого кошелька, нам его показывать
        // нечего.
        if (!намПришло && !мыОтправили) continue;
        if (!намПришло && сумма < РАСХОД_ОТ) continue;
        ряд.push({
          id: `${намПришло ? "in" : "out"}-${событие.event_id}`,
          chain: "ton",
          // Уходящий перевод — такая же строка истории, как приход:
          // раньше он просто пропускался, и деньги уходили молча.
          kind: намПришло ? "deposit" : "withdraw",
          amount: сумма,
          signature: событие.event_id,
          address: дружеский(намПришло ? откого : кому),
          // От контракта, а не от кошелька: такой приход сверяется со
          // своими сделками рядом по времени (см. сверкаTON).
          изКонтракта: намПришло && п.sender && п.sender.is_wallet === false,
          createdAt: new Date((событие.timestamp || 0) * 1000).toISOString(),
        });
      }
    }
    return ряд;
  } catch {
    return [];
  }
}

async function пополнения(chain, адрес, чужие, площадка) {
  if (!адрес) return [];
  const ключ = `${chain}|${адрес}`;
  const было = кеш.get(ключ);
  const сейчас = Date.now();
  if (было && было.до > сейчас) return было.ряд;

  /* Помним не ответ, а само чтение. Раньше ответ сети ждали три с
     половиной секунды, и если узел не успевал, наружу уходил пустой
     список — а он же и запоминался на полминуты. Пополнение не
     появлялось в истории вообще: каждое следующее открытие экрана
     упиралось в тот же пустой кеш. Теперь чтение идёт своим ходом и
     заполняет память, даже если этот запрос его не дождался. */
  if (было && было.вПути) return было.вПути;

  const чтение = (chain === "ton"
    ? пополненияTON(адрес, чужие, площадка)
    : пополненияSolana(адрес, чужие))
    .then((ряд) => {
      кеш.set(ключ, { до: Date.now() + ПАМЯТЬ_МС, ряд, вПути: null });
      return ряд;
    })
    .catch(() => {
      кеш.delete(ключ);
      return [];
    });

  кеш.set(ключ, { до: 0, ряд: (было && было.ряд) || [], вПути: чтение });
  if (кеш.size > 2000) {
    for (const [к, з] of кеш) if (!з.вПути && з.до <= сейчас) кеш.delete(к);
  }
  return чтение;
}

/* Обещание с пределом ожидания: узел или tonapi могут думать
   десятками секунд, а история к этому моменту уже должна быть на
   экране. */
function неДольше(обещание, мс, запасное) {
  return Promise.race([
    безОшибки(обещание, запасное),
    new Promise((готово) => setTimeout(() => готово(запасное), мс)),
  ]);
}

async function безОшибки(обещание, запасное) {
  try {
    return await обещание;
  } catch {
    return запасное;
  }
}

/* Подробности одной транзакции — для окна в истории.
 *
 * Статус и комиссию знает только сеть, поэтому спрашиваем её, когда
 * человек открыл строку, и помним ответ: подтверждённая транзакция уже
 * не меняется. Отвечаем только про кошелёк самого человека — чужую
 * подпись сюда не подставить, ответ будет «не найдено». */
const КЛАСТЕР_SOL = /devnet/.test(RPC) ? "?cluster=devnet" : /testnet/.test(RPC) ? "?cluster=testnet" : "";
const TONVIEWER = TESTNET ? "https://testnet.tonviewer.com" : "https://tonviewer.com";
const подробностиКеш = new Map(); // сеть|ид -> ответ

async function tonapi(путь) {
  const res = await fetch(`${TONAPI}${путь}`, {
    headers: TONAPI_KEY ? { Authorization: `Bearer ${TONAPI_KEY}` } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tonapi ${res.status}`);
  return res.json();
}

async function подробностиSolana(подпись, адрес) {
  const j = await rpc({
    jsonrpc: "2.0", id: 1, method: "getTransaction",
    params: [подпись, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
  });
  const tx = j && j.result;
  // Узел ещё не видит транзакцию: она в пути или не дошла.
  if (!tx) return { status: "pending", hash: подпись, explorer: `https://solscan.io/tx/${подпись}${КЛАСТЕР_SOL}` };
  const ключи = ((tx.transaction && tx.transaction.message && tx.transaction.message.accountKeys) || [])
    .map((к) => (typeof к === "string" ? к : к.pubkey));
  if (!ключи.includes(адрес)) return null;
  return {
    status: tx.meta && tx.meta.err ? "failed" : "success",
    fee: (Number(tx.meta && tx.meta.fee) || 0) / 1e9,
    feeCoin: "SOL",
    time: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
    hash: подпись,
    explorer: `https://solscan.io/tx/${подпись}${КЛАСТЕР_SOL}`,
    final: true,
  };
}

// Итог события tonapi: все действия прошли — успех; комиссия — то, что
// заплатил сам кошелёк (extra со знаком минус).
function итогСобытия(событие, хеш) {
  const действия = (событие && событие.actions) || [];
  const провал = действия.some((д) => д.status && д.status !== "ok");
  const extra = Number(событие && событие.extra) || 0;
  return {
    status: событие.in_progress ? "pending" : провал ? "failed" : "success",
    fee: extra < 0 ? -extra / 1e9 : 0,
    feeCoin: "TON",
    time: событие.timestamp ? new Date(событие.timestamp * 1000).toISOString() : null,
    hash: хеш,
    explorer: `${TONVIEWER}/transaction/${хеш}`,
    final: !событие.in_progress,
  };
}

async function подробностиTON(ид, адрес) {
  /* Свои переводы записаны номером «seqno:N»: хеша у отправленного
     сообщения до его исполнения нет. Находим транзакцию кошелька с этим
     номером, а итог берём у всего события — покупка проходит в кривой,
     уже за пределами кошелька. */
  const номер = /^seqno:(\d+)/.exec(String(ид));
  let хеш = номер ? null : String(ид);
  let запаснойИтог = null;
  if (номер) {
    const j = await tonapi(`/v2/blockchain/accounts/${encodeURIComponent(адрес)}/transactions?limit=100`);
    const tx = ((j && j.transactions) || []).find((т) => т.in_msg && т.in_msg.msg_type === "ext_in_msg"
      && т.in_msg.decoded_body && Number(т.in_msg.decoded_body.seqno) === Number(номер[1]));
    if (!tx) return { status: "pending", hash: null, explorer: `${TONVIEWER}/${адрес}` };
    хеш = tx.hash;
    запаснойИтог = {
      status: tx.success && !tx.aborted ? "success" : "failed",
      fee: (Number(tx.total_fees) || 0) / 1e9,
      feeCoin: "TON",
      time: tx.utime ? new Date(tx.utime * 1000).toISOString() : null,
      hash: tx.hash,
      explorer: `${TONVIEWER}/transaction/${tx.hash}`,
      final: true,
    };
  }
  const событие = await tonapi(`/v2/accounts/${encodeURIComponent(адрес)}/events/${encodeURIComponent(хеш)}`).catch(() => null);
  if (событие) return итогСобытия(событие, хеш);
  return запаснойИтог;
}

async function подробностиEVM(сеть, хеш, адрес) {
  const { СЕТИ } = await import("./wallet-evm.js");
  const с = СЕТИ[сеть];
  if (!с) return null;
  const вызов = (method, params) => fetch(с.rpc, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  }).then((r) => r.json()).then((j) => j && j.result);
  const [tx, чек] = await Promise.all([вызов("eth_getTransactionByHash", [хеш]), вызов("eth_getTransactionReceipt", [хеш])]);
  const ссылка = `${с.обозреватель}/tx/${хеш}`;
  if (!tx) return { status: "pending", hash: хеш, explorer: ссылка };
  if (String(tx.from || "").toLowerCase() !== String(адрес || "").toLowerCase()
    && String(tx.to || "").toLowerCase() !== String(адрес || "").toLowerCase()) return null;
  if (!чек) return { status: "pending", hash: хеш, explorer: ссылка };
  const газ = BigInt(чек.gasUsed || "0x0") * BigInt(чек.effectiveGasPrice || tx.gasPrice || "0x0");
  return {
    status: чек.status === "0x1" ? "success" : "failed",
    fee: Number(газ) / 1e18,
    feeCoin: с.монета,
    time: null,
    hash: хеш,
    explorer: ссылка,
    final: true,
  };
}

/* Свои переводы TON записаны номером «seqno:N» — хеша до исполнения нет,
   — и подпись не сводит их с тем же переводом, прочитанным из сети. Сводим
   по сути: то же направление, тот же адрес, та же сумма (±1%), рядом по
   времени. Приход от контракта рядом со своей сделкой TON — выплата за
   продажу через биржу: он уже в истории как продажа. */
async function сверкаTON(изСети, свои) {
  const тонСвои = свои.filter((о) => о.chain === "ton");
  if (!тонСвои.length) return изСети;
  const { сырой } = await адресаTON();
  const когда = (о) => new Date(о.createdAt).getTime() || 0;
  const рядом = (а, б, мс) => Math.abs(когда(а) - когда(б)) <= мс;
  const близко = (а, б) => Math.abs(а - б) <= Math.max(1e-9, 0.01 * Math.max(а, б));
  const занятые = new Set();
  return изСети.filter((р) => {
    if (р.chain !== "ton") return true;
    const уход = р.kind === "withdraw";
    const пара = тонСвои.find((о) => !занятые.has(о.id)
      && (уход ? ["withdraw", "transfer", "sweep"].includes(о.kind) : о.kind === "transfer_in")
      && близко(Number(о.amount) || 0, р.amount)
      && (!о.address || !р.address || сырой(о.address) === сырой(р.address))
      && рядом(о, р, 15 * 60 * 1000));
    if (пара) {
      занятые.add(пара.id);
      // У прихода от человека своя подпись — номер чужого seqno: окну
      // подробностей нужен настоящий хеш события, он у строки из сети.
      if (пара.kind === "transfer_in") пара.signature = р.signature;
      return false;
    }
    if (!уход && р.изКонтракта && тонСвои.some((о) => ["sell", "buy", "trade", "swap"].includes(о.kind) && рядом(о, р, 5 * 60 * 1000))) return false;
    return true;
  }).map(({ изКонтракта, ...р }) => р);
}

/* Ник и аватар второй стороны перевода между людьми Mintly. Только для
   переводов по нику: человек сам выбрал получателя (или получил от
   него), и показать ник вместо адреса — не раскрыть чужое. Адрес
   кошелька по-прежнему лежит в строке — для окна подробностей. */
async function людиПереводов(db, свои) {
  const нужные = свои.filter((о) => (о.kind === "transfer" || о.kind === "transfer_in") && о.address);
  if (!нужные.length) return;
  const адреса = [...new Set(нужные.map((о) => о.address))];
  const { data: кошельки } = await db.from("app_wallets").select("user_id, address").in("address", адреса);
  const чей = new Map((кошельки || []).map((к) => [к.address, к.user_id]));
  const ид = [...new Set([...чей.values()])];
  if (!ид.length) return;
  const { data: люди } = await db.from("profiles").select("id, nickname, avatar_url").in("id", ид);
  const кто = new Map((люди || []).map((л) => [л.id, л]));
  for (const о of нужные) {
    const л = кто.get(чей.get(о.address));
    if (л && л.nickname) о.counterparty = { nick: л.nickname, avatar: л.avatar_url || null };
  }
}

async function подробности(db, user, req, res) {
  const сеть = String((req.query && req.query.chain) || "");
  const ид = String((req.query && req.query.id) || "").split(",")[0].trim();
  if (!ид || ид.length > 140 || !/^[A-Za-z0-9:_-]+$/.test(ид)) return res.status(400).json({ error: "bad_request" });
  const вид = сеть === "ton" ? "ton" : ["bsc", "base", "eth"].includes(сеть) ? "evm" : "solana";
  const { data: кошелёк } = await db.from("app_wallets").select("address")
    .eq("user_id", user.id).eq("chain", вид).maybeSingle();
  if (!кошелёк || !кошелёк.address) return res.status(404).json({ error: "no_wallet" });
  const ключ = `${user.id}|${сеть}|${ид}`;
  const было = подробностиКеш.get(ключ);
  res.setHeader("Cache-Control", "no-store");
  if (было) return res.status(200).json(было);
  try {
    const итог = вид === "ton" ? await подробностиTON(ид, кошелёк.address)
      : вид === "evm" ? await подробностиEVM(сеть, ид, кошелёк.address)
        : await подробностиSolana(ид, кошелёк.address);
    if (!итог) return res.status(404).json({ error: "not_found" });
    if (итог.final) {
      подробностиКеш.set(ключ, итог);
      if (подробностиКеш.size > 5000) подробностиКеш.clear();
    }
    return res.status(200).json(итог);
  } catch (e) {
    return res.status(502).json({ error: "upstream", detail: String((e && e.message) || e).slice(0, 120) });
  }
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });

  const user = await хозяин(req, db);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (String((req.query && req.query.action) || "") === "tx") return подробности(db, user, req, res);

  const [{ data, error }, { data: кошельки }] = await Promise.all([
    db.from("wallet_ops")
      .select("id, chain, kind, amount, address, signature, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(ПРЕДЕЛ),
    db.from("app_wallets").select("chain, address").eq("user_id", user.id),
  ]);

  if (error) return res.status(500).json({ error: "db", detail: error.message });

  // Сеть — как записана: у операций Solana её нет вовсе (кошелёк был
  // один), у EVM это bsc, base или eth — раньше их считали Solana.
  const свои = (data || []).map((о) => ({
    id: `op-${о.id}`,
    chain: о.chain || "solana",
    kind: о.kind,
    amount: Number(о.amount) || 0,
    signature: о.signature || null,
    address: о.address || null,
    createdAt: о.created_at,
  }));

  // Подписи своих операций: по ним входящие отличаются от собственных
  // продаж и обменов, которые тоже пополняют кошелёк.
  const наши = new Set(свои.map((о) => о.signature).filter(Boolean));
  const площадка = await площадкаTON(db).catch(() => new Set());
  const входящие = (await Promise.all(
    (кошельки || []).filter((к) => к.chain === "ton" || к.chain === "solana").map((к) => неДольше(
      пополнения(к.chain, к.address, наши, площадка),
      ЖДЁМ_СЕТЬ_МС,
      [],
    )),
  )).flat();
  const изСети = await сверкаTON(входящие, свои);
  await людиПереводов(db, свои);

  /* Сделки на бирже — тоже движение денег человека, только на торговом
     счёте. Без них история молчала о позициях, тейках и ликвидациях, хотя
     переводы на этот счёт в ней уже были. */
  const биржа = await неДольше((async () => {
    const { событияДляИстории } = await import("./hyperliquid.js");
    return событияДляИстории(user);
  })(), ЖДЁМ_СЕТЬ_МС, []).catch(() => []);
  const сделкиБиржи = (биржа || []).map((з) => ({
    id: `perp-${з.id}`,
    chain: "perp",
    kind: "perp",
    amount: Math.abs(Number(з.pnl) || 0) || Number(з.margin) || 0,
    signature: null,
    address: null,
    createdAt: new Date(Number(з.at) || 0).toISOString(),
    perp: {
      kind: з.kind, coin: з.coin, name: з.name, side: з.side, size: Number(з.size) || 0,
      price: Number(з.price) || 0, entry: Number(з.entry) || 0, margin: Number(з.margin) || 0,
      lev: Number(з.lev) || 0, pnl: Number(з.pnl) || 0, fee: Number(з.fee) || 0, payout: Number(з.payout) || 0, add: !!з.add,
    },
  }));

  const всё = [...свои, ...изСети, ...сделкиБиржи]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, ПРЕДЕЛ);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ops: всё });
}
