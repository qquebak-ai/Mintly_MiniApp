/* Покупка токена с биржи через бота.
 *
 * У токенов из ленты своей кривой нет — они торгуются на Ston.fi.
 * Собрать такую сделку сложнее, чем покупку на кривой: маршрут зависит
 * от пула, версии роутера и адреса кошелька покупателя. Поэтому путь
 * такой: спрашиваем у биржи маршрут и ожидаемый выход, собираем
 * транзакцию её же SDK и отдаём человеку ссылкой в кошелёк. Подписывает
 * он сам, ключей мы по-прежнему не касаемся.
 *
 * Комиссия площадки идёт реферальным механизмом биржи: на роутерах
 * второй версии её размер задаём сами (1%, как и на своей кривой), на
 * первой — Ston.fi платит по своим правилам. Отдельным сообщением, как
 * это делает приложение, здесь взять нельзя: universal link кошелька
 * несёт ровно одну транзакцию, и второе подтверждение человек просто не
 * нажмёт.
 */

import { Address } from "@ton/core";
import { TonClient } from "@ton/ton";
import { DEX, pTON } from "@ston-fi/sdk";

const STON_API = "https://api.ston.fi/v1";

// Обёртка TON в жетон: биржа умеет менять только жетон на жетон, и
// «настоящий» TON участвует в сделке под этим адресом.
const PTON = "EQCM3B12QK1e4yZSf8GtBRT0aLMNyEsBc_DhVfRRtOEffLez";

// Биржа живёт только в боевой сети. В тестовой своп собирать не из
// чего, и честнее сказать это прямо, чем отдать ссылку, которая ничего
// не купит.
// Боевая сеть по умолчанию. Тестовая включается явно: TON_TESTNET=1.
const TESTNET = process.env.TON_TESTNET === "1";

// Кошелёк площадки. Тот же, что получает комиссию с кривой.
const FEE_ADDRESS = process.env.FEE_ADDRESS || "UQClGN5huzz-Z3bwgxr7GOPe5Jyi8PNKbsNnDFKFNGbjusvT";

// Доля площадки в сотых долях процента: 100 = 1%. Больше биржа не
// пропускает, да и брать больше своей кривой было бы странно.
// Ноль: комиссии площадки нет и после выхода на биржу.
const REFERRAL_BPS = 0;

// Узел цепочки для расчёта адресов жетонных кошельков. Без ключа
// toncenter пускает считанные запросы в минуту — на бота хватает, но
// ключ в окружении лишним не будет.
const TONCENTER = process.env.TONCENTER_URL || "https://toncenter.com/api/v2/jsonRPC";
const TONCENTER_KEY = process.env.TONCENTER_API_KEY || undefined;

/* Маршрут и ожидаемый выход. Слippage закладываем в min_ask_units сама
   биржа — мы лишь передаём допуск. */
export async function симуляция(jetton, tonAmount, допуск = 0.02) {
  const units = BigInt(Math.round(Number(tonAmount) * 1e9));
  const параметры = new URLSearchParams({
    offer_address: PTON,
    ask_address: jetton,
    units: units.toString(),
    slippage_tolerance: String(допуск),
    dex_v2: "true",
  });
  try {
    const res = await fetch(`${STON_API}/swap/simulate?${параметры}`, { method: "POST" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.router_address) return null;
    return json;
  } catch (err) {
    return null;
  }
}

function роутерИProxy(sim) {
  const r = sim.router || {};
  const major = Number(r.major_version) || 1;
  const minor = Number(r.minor_version) || 0;
  const ptonМастер = r.pton_master_address;
  const ptonВерсия = String(r.pton_version || "1.0");

  if (major === 2 && minor >= 2) {
    return {
      router: DEX.v2_2.Router.create(sim.router_address),
      proxy: ptonВерсия.startsWith("2") ? pTON.v2_1.create(ptonМастер) : pTON.v1.create(ptonМастер),
      реферал: true,
    };
  }
  if (major === 2) {
    return {
      router: DEX.v2_1.Router.create(sim.router_address),
      proxy: ptonВерсия.startsWith("2") ? pTON.v2_1.create(ptonМастер) : pTON.v1.create(ptonМастер),
      реферал: true,
    };
  }
  return {
    router: DEX.v1.Router.create(sim.router_address),
    proxy: pTON.v1.create(ptonМастер),
    // У первой версии размер реферальной доли задаёт сам протокол —
    // передаём только адрес.
    реферал: false,
  };
}

/* Готовая покупка: куда, сколько и с каким телом сообщения. */
export async function свопТонВЖетон({ jetton, tonAmount, userWallet, допуск = 0.01 }) {
  if (TESTNET) return null;
  if (!jetton || !userWallet || !(tonAmount > 0)) return null;
  let sim = await симуляция(jetton, tonAmount, допуск);
  if (!sim) return null;
  // Биржа сама говорит, какой запас нужен этому пулу. Если он больше
  // нашего, пересчитываем: со слишком тесным допуском сделка сорвётся в
  // кошельке, и человек решит, что сломан бот.
  const нужен = Number(sim.recommended_slippage_tolerance) || 0;
  if (нужен > допуск) {
    const точнее = await симуляция(jetton, tonAmount, нужен);
    if (точнее) sim = точнее;
  }

  let адресПокупателя;
  try {
    адресПокупателя = Address.parse(userWallet).toString({ bounceable: false });
  } catch (err) {
    return null;
  }

  const client = new TonClient({ endpoint: TONCENTER, apiKey: TONCENTER_KEY });
  const { router, proxy, реферал } = роутерИProxy(sim);
  const открытый = client.open(router);

  const параметры = {
    userWalletAddress: адресПокупателя,
    proxyTon: proxy,
    offerAmount: BigInt(Math.round(Number(tonAmount) * 1e9)),
    askJettonAddress: jetton,
    minAskAmount: BigInt(sim.min_ask_units || 1),
  };
  // Нулевая доля — реферальный адрес не передаём вовсе.
  if (REFERRAL_BPS > 0) {
    параметры.referralAddress = FEE_ADDRESS;
    if (реферал) параметры.referralValue = REFERRAL_BPS;
  }

  let tx;
  try {
    tx = await открытый.getSwapTonToJettonTxParams(параметры);
  } catch (err) {
    console.warn("[swap] не удалось собрать своп:", err && err.message);
    return null;
  }

  const decimals = Number(sim.ask_jetton_decimals ?? 9);
  return {
    // Комиссии пулов и запас на проскальзывание наружу больше не идут:
    // в чате их читают как мелкий шрифт. Остаётся то, что видно в
    // кошельке, — сколько списывается и сколько придёт.
    to: tx.to.toString({ bounceable: true }),
    value: tx.value.toString(),
    body: tx.body.toBoc().toString("base64"),
    получит: Number(sim.ask_units || 0) / 10 ** decimals,
    минимум: Number(sim.min_ask_units || 0) / 10 ** decimals,
    курс: Number(sim.swap_rate) || 0,
    влияние: Number(sim.price_impact) || 0,
    комиссияБиржи: Number(sim.fee_units || 0) / 10 ** decimals,
    доляПлощадки: реферал && REFERRAL_BPS > 0 ? REFERRAL_BPS / 100 : null,
    версияРоутера: `${(sim.router || {}).major_version || 1}.${(sim.router || {}).minor_version || 0}`,
  };
}

/* Сколько знаков после запятой у жетона.
 *
 * Спрашиваем у цепочки, а не подставляем девятку: у мемкоинов TON
 * встречаются и шесть, и два знака, а ошибка здесь — это ошибка в тысячу
 * раз по сумме продажи. Ответ держим в памяти процесса: у жетона он не
 * меняется никогда. */
const знаки = new Map();
async function десятичные(jetton) {
  if (знаки.has(jetton)) return знаки.get(jetton);
  try {
    const r = await fetch(`https://tonapi.io/v2/jettons/${jetton}`, { headers: { accept: "application/json" } });
    const j = r.ok ? await r.json() : null;
    const d = Number((j && j.metadata && j.metadata.decimals) ?? 9);
    const итог = Number.isFinite(d) && d >= 0 && d <= 18 ? d : 9;
    знаки.set(jetton, итог);
    return итог;
  } catch {
    return 9;
  }
}

/* Продажа: жетон за TON.
 *
 * Обратное направление у биржи считается так же, только местами меняются
 * offer и ask. Сумма приходит в самих токенах, а не в единицах: сколько
 * их в одном токене, знает только цепочка. */
export async function свопЖетонВТон({ jetton, amount, userWallet, допуск = 0.01 }) {
  if (TESTNET) return null;
  if (!jetton || !userWallet || !(amount > 0)) return null;

  const dec = await десятичные(jetton);
  const units = BigInt(Math.round(Number(amount) * 10 ** dec));
  if (units <= 0n) return null;

  const спросить = async (д) => {
    const параметры = new URLSearchParams({
      offer_address: jetton,
      ask_address: PTON,
      units: units.toString(),
      slippage_tolerance: String(д),
      dex_v2: "true",
    });
    try {
      const res = await fetch(`${STON_API}/swap/simulate?${параметры}`, { method: "POST" });
      if (!res.ok) return null;
      const json = await res.json();
      return json && json.router_address ? json : null;
    } catch {
      return null;
    }
  };

  let sim = await спросить(допуск);
  if (!sim) return null;
  const нужен = Number(sim.recommended_slippage_tolerance) || 0;
  if (нужен > допуск) sim = (await спросить(нужен)) || sim;

  let адресПродавца;
  try {
    адресПродавца = Address.parse(userWallet).toString({ bounceable: false });
  } catch {
    return null;
  }

  const client = new TonClient({ endpoint: TONCENTER, apiKey: TONCENTER_KEY });
  const { router, proxy, реферал } = роутерИProxy(sim);
  const открытый = client.open(router);

  const параметры = {
    userWalletAddress: адресПродавца,
    offerJettonAddress: jetton,
    offerAmount: units,
    proxyTon: proxy,
    minAskAmount: BigInt(sim.min_ask_units || 1),
  };
  // Нулевая доля — реферальный адрес не передаём вовсе.
  if (REFERRAL_BPS > 0) {
    параметры.referralAddress = FEE_ADDRESS;
    if (реферал) параметры.referralValue = REFERRAL_BPS;
  }

  let tx;
  try {
    tx = await открытый.getSwapJettonToTonTxParams(параметры);
  } catch (err) {
    console.warn("[swap] продажа не собралась:", err && err.message);
    return null;
  }

  return {
    to: tx.to.toString({ bounceable: true }),
    value: tx.value.toString(),
    body: tx.body.toBoc().toString("base64"),
    // Выход этого направления — сам TON, поэтому девятка здесь не
    // угадана, а задана сетью.
    получит: Number(sim.ask_units || 0) / 1e9,
    минимум: Number(sim.min_ask_units || 0) / 1e9,
    влияние: Number(sim.price_impact) || 0,
    десятичные: dec,
    доляПлощадки: реферал && REFERRAL_BPS > 0 ? REFERRAL_BPS / 100 : null,
  };
}

/* Ссылка в кошелёк для собранной сделки. */
export function ссылкаСвопа(tx) {
  if (!tx) return null;
  const boc = String(tx.body).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `https://app.tonkeeper.com/transfer/${tx.to}?amount=${tx.value}&bin=${boc}`;
}
