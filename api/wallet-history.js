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
    if (разница > МЕЛОЧЬ) {
      ряд.push({
        id: `in-${подпись}`,
        chain: "solana",
        kind: "deposit",
        amount: разница,
        signature: подпись,
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
      ряд.push({
        id: `out-${подпись}`,
        chain: "solana",
        kind: "withdraw",
        amount: ушло,
        signature: подпись,
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

/* Входящие переводы в TON. tonapi отдаёт готовые события с разбором по
   действиям — самим считать балансы не нужно. */
async function пополненияTON(адрес, чужие) {
  try {
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
        const наш = String(адрес || "");
        const кому = String(п.recipient.address || "");
        const откого = String((п.sender && п.sender.address) || "");
        const намПришло = !кому || !наш || похожи(кому, наш);
        const мыОтправили = !!откого && !!наш && похожи(откого, наш);
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
          createdAt: new Date((событие.timestamp || 0) * 1000).toISOString(),
        });
      }
    }
    return ряд;
  } catch {
    return [];
  }
}

// Адрес TON пишется в трёх видах сразу; для сверки хватает последних
// знаков — они одинаковы у всех представлений одного счёта.
function похожи(a, b) {
  const хвост = (s) => String(s).replace(/[^A-Za-z0-9]/g, "").slice(-8).toLowerCase();
  return хвост(a) === хвост(b);
}

async function пополнения(chain, адрес, чужие) {
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
    ? пополненияTON(адрес, чужие)
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

export default async function handler(req, res) {
  const db = admin();
  if (!db) return res.status(503).json({ error: "not_configured" });

  const user = await хозяин(req, db);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const [{ data, error }, { data: кошельки }] = await Promise.all([
    db.from("wallet_ops")
      .select("id, chain, kind, amount, signature, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(ПРЕДЕЛ),
    db.from("app_wallets").select("chain, address").eq("user_id", user.id),
  ]);

  if (error) return res.status(500).json({ error: "db", detail: error.message });

  const свои = (data || []).map((о) => ({
    id: `op-${о.id}`,
    chain: о.chain === "ton" ? "ton" : "solana",
    kind: о.kind,
    amount: Number(о.amount) || 0,
    signature: о.signature || null,
    createdAt: о.created_at,
  }));

  // Подписи своих операций: по ним входящие отличаются от собственных
  // продаж и обменов, которые тоже пополняют кошелёк.
  const наши = new Set(свои.map((о) => о.signature).filter(Boolean));
  const входящие = (await Promise.all(
    (кошельки || []).map((к) => неДольше(
      пополнения(к.chain === "ton" ? "ton" : "solana", к.address, наши),
      ЖДЁМ_СЕТЬ_МС,
      [],
    )),
  )).flat();

  const всё = [...свои, ...входящие]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, ПРЕДЕЛ);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ops: всё });
}
