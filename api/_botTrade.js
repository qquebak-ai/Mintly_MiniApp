/* Кошелёк и сделки из чата с ботом.
 *
 * Бот сам ничего не подписывает и правил сделки не повторяет: он зовёт
 * тот же обработчик кошелька, что и нажатие в приложении, — изнутри
 * сервера, от имени человека (api/_внутри.js), как это делает
 * исполнитель лимитных заявок. Так у сделки из чата те же проверки
 * остатка, обещаний создателя и повторов, что и в приложении, та же
 * дорога на биржу после выхода токена с кривой и та же история.
 *
 * Раньше в TON бот собирал ссылку во внешний кошелёк («подпиши в
 * кошельке»), а торговать внутренним умел только в Solana. Внешнего
 * кошелька у приложения давно нет — деньги живут в кошельке приложения
 * во всех сетях, — и половина кнопок в чате вела в тупик.
 */

import crypto from "node:crypto";
import { ВНУТРЕННИЙ_ВХОД, ответВнутри } from "./_внутри.js";
import { adminClient } from "./_support.js";
import { МОНЕТА, ИМЯ_СЕТИ, ЦЕПИ_EVM, курсМонеты } from "./_market.js";

export { МОНЕТА, ИМЯ_СЕТИ };

// Строка кошелька в app_wallets: у всех сетей EVM один адрес на троих.
const ЗАПИСЬ = { ton: "ton", solana: "solana", bsc: "evm", base: "evm", eth: "evm" };

/* Суммы быстрой покупки — в монете сети. Порядок величин один: от
   пробной покупки до заметной, по нынешним курсам — от нескольких
   долларов до сотни. Мельче сделка теряет смысл: сеть и аренда счёта
   съедают заметную долю. */
export const СУММЫ = {
  solana: [0.05, 0.1, 0.25, 0.5],
  ton: [1, 5, 10, 25],
  bsc: [0.01, 0.05, 0.1, 0.25],
  base: [0.002, 0.005, 0.01, 0.05],
  eth: [0.002, 0.005, 0.01, 0.05],
};

// Сколько монеты держать сверх суммы покупки на газ — те же запасы, что
// проверяет сервер (api/wallet-*.js). Нужны только для понятного «не
// хватает» до похода к обработчику.
const ЗАПАС = { solana: 0.002, ton: 0.2, bsc: 0.001, base: 0.0002, eth: 0.0005 };

/* Подмена обработчиков кошелька — только для проверки без сети и ключей
   (scripts/bot-check.mjs): настоящие обработчики подписывают сделки
   ключами площадки, которых на машине разработчика нет и быть не должно. */
let подмена = null;
export function подменитьКошелёкДляПроверки(ф) { подмена = ф; }

async function вызвать(путь, действие, userId, { метод = "POST", тело = {}, запрос = {} } = {}) {
  if (подмена) return подмена(путь, действие, userId, { метод, тело, запрос });
  const { default: обработчик } = await import(`./${путь}.js`);
  const ответ = ответВнутри();
  await обработчик({
    method: метод,
    url: `/api/${путь}?action=${действие}`,
    query: { action: действие, ...запрос },
    body: тело,
    headers: { "x-forwarded-for": "telegram-bot" },
    [ВНУТРЕННИЙ_ВХОД]: { id: userId },
  }, ответ);
  return ответ;
}

/* Какие кошельки у человека уже заведены. Бот их не заводит: кошелёк
   создаётся в приложении, осознанно, вместе с секретной фразой, — а
   обработчик завёл бы его при первом же обращении. Поэтому сначала
   смотрим, есть ли строка, и только тогда спрашиваем остаток. */
async function заведённые(userId) {
  const db = adminClient();
  if (!db || !userId) return new Map();
  const { data } = await db.from("app_wallets").select("chain, address").eq("user_id", userId);
  return new Map((data || []).map((r) => [r.chain, r.address]));
}

export async function естьКошелёк(userId, цепь) {
  return (await заведённые(userId)).has(ЗАПИСЬ[цепь]);
}

/* Все кошельки и остатки разом: TON, Solana и общий адрес EVM с
   остатками в трёх сетях. Сеть, что не ответила, — прочерк, а не ноль:
   ноль на экране читается как «деньги пропали». */
export async function кошелькиЧеловека(userId) {
  const есть = await заведённые(userId);
  const итог = { ton: null, solana: null, evm: null, пусто: есть.size === 0 };
  const остаток = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  await Promise.all([
    есть.has("ton") && вызвать("wallet-ton", "state", userId, { метод: "GET" })
      .then((о) => { итог.ton = { address: (о.тело && о.тело.address) || есть.get("ton"), баланс: о.код === 200 ? остаток(о.тело.ton) : null }; })
      .catch(() => { итог.ton = { address: есть.get("ton"), баланс: null }; }),
    есть.has("solana") && вызвать("wallet-solana", "state", userId, { метод: "GET" })
      .then((о) => { итог.solana = { address: (о.тело && о.тело.address) || есть.get("solana"), баланс: о.код === 200 ? остаток(о.тело.sol) : null }; })
      .catch(() => { итог.solana = { address: есть.get("solana"), баланс: null }; }),
    есть.has("evm") && вызвать("wallet-evm", "state", userId, { метод: "GET" })
      .then((о) => {
        const сети = (о.код === 200 && о.тело && о.тело.chains) || {};
        итог.evm = {
          address: (о.тело && о.тело.address) || есть.get("evm"),
          сети: Object.fromEntries(ЦЕПИ_EVM.map((к) => [к, сети[к] ? остаток(сети[к].native) : null])),
        };
      })
      .catch(() => { итог.evm = { address: есть.get("evm"), сети: {} }; }),
  ]);
  return итог;
}

/* Кошелёк одной сети: адрес и остаток монеты — для экрана покупки.
   Спрашиваем только нужный обработчик: остальные сети на этом шаге не
   нужны, а каждая — свой круг к узлу. null — кошелька в этой сети нет. */
export async function кошелёкСети(userId, цепь) {
  const есть = await заведённые(userId);
  const запись = ЗАПИСЬ[цепь];
  if (!запись || !есть.has(запись)) return null;
  const адрес = есть.get(запись);
  const число = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  try {
    if (цепь === "ton") {
      const о = await вызвать("wallet-ton", "state", userId, { метод: "GET" });
      return { адрес: (о.тело && о.тело.address) || адрес, есть: о.код === 200 ? число(о.тело.ton) : null };
    }
    if (цепь === "solana") {
      const о = await вызвать("wallet-solana", "state", userId, { метод: "GET" });
      return { адрес: (о.тело && о.тело.address) || адрес, есть: о.код === 200 ? число(о.тело.sol) : null };
    }
    const о = await вызвать("wallet-evm", "state", userId, { метод: "GET" });
    const сеть = о.код === 200 && о.тело && о.тело.chains && о.тело.chains[цепь];
    return { адрес: (о.тело && о.тело.address) || адрес, есть: сеть ? число(сеть.native) : null };
  } catch {
    return { адрес, есть: null };
  }
}

// Сколько держать сверх суммы покупки — для экрана «не хватает».
export function запасНаГаз(цепь) {
  return ЗАПАС[цепь] || 0;
}

async function остатокМонеты(userId, цепь) {
  const к = await кошелёкСети(userId, цепь);
  return к ? к.есть : null;
}

/* Токены человека: то, чем он торговал в Mintly, с остатком больше нуля.
   Список всех монет кошелька сеть отдаёт по-разному в каждой цепочке, а
   своя история сделок одна на все — по ней и смотрим, не дальше восьми
   последних токенов: каждый остаток — свой поход в сеть. */
export async function токеныЧеловека(userId, предел = 8) {
  const db = adminClient();
  if (!db || !userId) return [];
  const { data: сделки } = await db
    .from("trades")
    .select("token_id")
    .eq("user_id", userId)
    .not("token_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const ид = [...new Set((сделки || []).map((с) => с.token_id).filter(Boolean))].slice(0, предел);
  if (!ид.length) return [];
  const { data: токены } = await db.from("tokens").select("id, ticker, address, chain").in("id", ид);
  const ряд = await Promise.all((токены || []).map(async (т) => {
    const цепь = ЦЕПИ_EVM.includes(т.chain) || т.chain === "solana" ? т.chain : "ton";
    const card = { tokenId: т.id, chain: цепь, address: т.address, ticker: String(т.ticker || "").toUpperCase() };
    const штук = await остатокТокена(userId, card).catch(() => 0);
    return штук > 0 ? { ...card, штук } : null;
  }));
  return ряд.filter(Boolean);
}

/* Сколько этого токена лежит в кошельке приложения — продажа в чате
   идёт долями от него: «продать половину» человек понимает, «продать
   4 173 902» — нет. */
export async function остатокТокена(userId, card) {
  const есть = await заведённые(userId);
  if (!есть.has(ЗАПИСЬ[card.chain]) || !card.address) return 0;
  if (подмена) {
    const о = await подмена("остаток-токена", card.chain, userId, { card });
    return Number(о && о.тело && о.тело.token) || 0;
  }
  if (card.chain === "solana") {
    const { балансТокенаДляБота } = await import("./wallet-solana.js");
    return Number(await балансТокенаДляБота(userId, card.address)) || 0;
  }
  if (card.chain === "ton") {
    const { жетонныйКошелёк } = await import("./_wallet.js");
    const ж = await жетонныйКошелёк(есть.get("ton"), card.address);
    return ж ? Number(ж.raw) / 10 ** ж.decimals : 0;
  }
  const о = await вызвать("wallet-evm", "token-balance", userId, { метод: "GET", запрос: { chain: card.chain, token: card.address } });
  return о.код === 200 && о.тело ? Number(о.тело.token) || 0 : 0;
}

/* Ключ запроса — из одноразовой метки на кнопке подтверждения: повторное
   нажатие той же кнопки обработчик узнаёт и второй сделки не делает, а
   новая сделка с теми же суммами — это уже новая кнопка. Длина ключа у
   обработчиков ограничена 64 знаками, поэтому хешируем. */
function ключСделки(card, покупка, метка) {
  const основа = `${card.tokenId}:${покупка ? "b" : "s"}:${метка}`;
  return `tg:${crypto.createHash("sha256").update(основа).digest("hex").slice(0, 40)}`;
}

// Коды отказов обработчиков — человеческими словами.
function причина(тело, card) {
  const код = String((тело && тело.error) || "");
  const монета = МОНЕТА[card.chain];
  if (код === "not_enough" || код === "not_enough_gas") return `не хватает ${монета} на кошельке`;
  if (код === "nothing_to_sell" || код === "not_enough_tokens" || код === "no_jetton_wallet") return `на кошельке нет $${card.ticker}`;
  if (код === "trade_in_flight" || код === "wallet_busy") return "прошлая сделка ещё в пути — подожди пару секунд";
  if (код === "unverified_curve" || код === "no_curve") return "этот токен сейчас торгуется только в приложении";
  if (код === "token_not_found") return "токен не найден";
  if (код === "launch_disabled") return "торговля в этой сети пока выключена";
  if (код === "rate_limited") return "слишком много сделок подряд — попробуй через минуту";
  if (код === "unauthorized" || код === "not_configured") return "кошелёк приложения сейчас недоступен";
  const подробно = String((тело && (тело.detail || тело.message)) || "").trim();
  return подробно ? подробно.slice(0, 200) : "сеть не приняла сделку";
}

/* Где посмотреть сделку. У TON обработчик отвечает номером перевода, а
   не хешем: сделка там уходит асинхронно, — поэтому ведём на сам
   кошелёк, где она появится через несколько секунд. */
async function ссылкаНаСделку(card, тело, адресTon) {
  if (card.chain === "solana") {
    const { SOLANA_ТЕСТОВАЯ } = await import("./wallet-solana.js").catch(() => ({}));
    const подпись = тело && тело.signature;
    return подпись ? `https://solscan.io/tx/${подпись}${SOLANA_ТЕСТОВАЯ ? "?cluster=devnet" : ""}` : null;
  }
  if (card.chain === "ton") {
    if (!адресTon) return null;
    return `${process.env.TON_TESTNET === "1" ? "https://testnet.tonviewer.com" : "https://tonviewer.com"}/${адресTon}`;
  }
  const { СЕТИ } = await import("./wallet-evm.js").catch(() => ({}));
  const хеш = тело && (тело.tx || тело.signature);
  const обозреватель = СЕТИ && СЕТИ[card.chain] && СЕТИ[card.chain].обозреватель;
  return хеш && обозреватель ? `${обозреватель}/tx/${хеш}` : null;
}

/* Запись в историю — так же, как её пишет приложение после своей
   сделки (recordTrade в src/App.tsx): по этой таблице строятся история
   кошелька, «мои дела» и кружки сделок на графике. Не записалась — не
   повод портить ответ о прошедшей сделке. */
async function записатьВИсторию(userId, card, { покупка, монет, штук }) {
  const db = adminClient();
  if (!db) return;
  const курс = await курсМонеты(card.chain).catch(() => 0);
  await db.from("trades").insert({
    user_id: userId,
    token_id: card.tokenId || null,
    token_address: card.address || null,
    ticker: card.ticker || null,
    side: покупка ? "buy" : "sell",
    ton_amount: Number(монет) || 0,
    token_amount: Number(штук) || 0,
    ton_price_usd: Number(курс) || 0,
  }).then(() => {}, () => {});
}

/* Покупка на сумму в монете сети или продажа доли от остатка.
 *
 * Скорость — обычная: без наценки площадке. Быструю и «Молнию» с их
 * доплатой человек выбирает в приложении, где видит цену выбора; в чате
 * за него доплачивать никто не должен. */
export async function сделкаИзЧата({ userId, card, покупка, сумма = 0, доля = 0, метка }) {
  if (!card || !card.tokenId || !card.chain) return { ok: false, текст: "токен не найден" };
  if (!(await естьКошелёк(userId, card.chain))) {
    return { ok: false, нетКошелька: true, текст: "кошелёк ещё не создан — открой «Кошелёк» в приложении" };
  }

  let количество = 0;
  if (покупка) {
    if (!(сумма > 0)) return { ok: false, текст: "нужна сумма" };
    const есть = await остатокМонеты(userId, card.chain).catch(() => null);
    if (есть != null && есть < сумма + (ЗАПАС[card.chain] || 0)) {
      return { ok: false, нехватка: { есть, нужно: сумма + (ЗАПАС[card.chain] || 0) }, текст: `не хватает ${card.монета}` };
    }
  } else {
    const всего = await остатокТокена(userId, card).catch(() => 0);
    if (!(всего > 0)) return { ok: false, текст: `на кошельке нет $${card.ticker}` };
    // «Всё» — ровно остаток: доля от него с округлением могла бы выйти на
    // пылинку больше, и сеть отбила бы продажу.
    количество = доля >= 100 ? всего : (всего * доля) / 100;
    if (!(количество > 0)) return { ok: false, текст: "нечего продавать" };
  }

  const ключ = ключСделки(card, покупка, метка || String(Date.now()));
  let путь, действие, тело;
  if (card.chain === "solana") {
    путь = "wallet-solana"; действие = "trade";
    тело = { mint: card.address, sell: !покупка, amount: покупка ? сумма : количество, minOut: 0, speed: "normal", requestKey: ключ };
  } else if (card.chain === "ton") {
    путь = "wallet-ton"; действие = покупка ? "buy" : "sell";
    тело = { tokenId: card.tokenId, amount: покупка ? сумма : количество, speed: "normal", requestKey: ключ };
  } else {
    путь = "wallet-evm"; действие = покупка ? "buy" : "sell";
    тело = { chain: card.chain, token: card.address, amount: покупка ? сумма : количество, speed: "normal", requestKey: ключ };
  }

  let ответ;
  try {
    ответ = await вызвать(путь, действие, userId, { тело });
  } catch (e) {
    return { ok: false, текст: String((e && e.message) || e).slice(0, 200) };
  }
  const т = ответ.тело || {};
  if (ответ.код >= 300 || т.error) return { ok: false, текст: причина(т, card) };

  // Числа — по ответу кривой там, где он их даёт (Solana), иначе по цене
  // из карточки: TON и EVM отвечают номером или хешем перевода.
  const монет = покупка ? сумма : (Number(т.solOut) || (card.цена > 0 ? количество * card.цена : 0));
  const штук = покупка ? (Number(т.bought) || Number(т.tokens) || (card.цена > 0 ? сумма / card.цена : 0)) : количество;
  if (!т.repeat) await записатьВИсторию(userId, card, { покупка, монет, штук });
  const к = card.chain === "ton" ? await заведённые(userId) : null;
  return {
    ok: true,
    повтор: !!т.repeat,
    монет,
    штук,
    ссылка: await ссылкаНаСделку(card, т, к ? к.get("ton") : null),
  };
}
