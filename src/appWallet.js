/* Внутренний кошелёк приложения (Solana) — сторона браузера.
 *
 * Обычная сделка идёт через Phantom: приложение собирает транзакцию,
 * человек уходит в кошелёк, подтверждает, возвращается. Пока он ходит,
 * цена на кривой успевает уехать. Внутренний кошелёк убирает этот шаг —
 * подпись ставит сервер ключом, который лежит у него.
 *
 * Важное про устройство: отсюда наружу не уходит ни одна собранная
 * транзакция. Раньше уходила — браузер собирал её через один
 * обработчик и приносил на подпись в другой, и любой, кто выполнил свой
 * код на странице, мог принести туда перевод всего остатка. Теперь
 * браузер называет только намерение («купить на столько-то»), а
 * собирает, проверяет и подписывает сервер.
 *
 * Ключ запроса на каждую операцию — от повторов: двойное нажатие или
 * автоповтор сети не превращаются во вторую сделку, сервер возвращает
 * исход первой.
 *
 * Баланс мы не считаем: сервер читает его из сети по адресу.
 */

import { supabase } from "./supabaseClient";
import { апи } from "./апи";
import { записатьОстатки, списатьОстаток } from "./остатки";

// Чей вход — по нему общая память остатков (src/остатки.js) не путает
// числа двух аккаунтов на одном телефоне.
let последнийВход = null;
async function токен() {
  const { data } = await supabase.auth.getSession();
  const сессия = data && data.session;
  последнийВход = (сессия && сессия.user && сессия.user.id) || null;
  return (сессия && сессия.access_token) || null;
}

/* Один опрос на всех. Кошелёк спрашивают сразу многие — карточка
   кошелька, окно сделки, форма запуска, позиция, список своих токенов, —
   и каждое раньше шло полным опросом с походом сервера в узел сети:
   пять одинаковых запросов разом, и все ждут самого медленного.
   Теперь одновременные просьбы ждут один ответ, а ответ моложе двух
   секунд отдаётся сразу. «Свежее» — после своей траты: сервер тогда
   идёт в сеть, а не в свою память (api/_остаток.js). */
const СВЕЖО_МС = 2000;
function одинОпрос(сходить) {
  let путь = null;
  let свежийПуть = null;
  let ответ = null;
  let когда = 0;
  const запомнить = (о) => {
    if (о && !о.ошибка) { ответ = о; когда = Date.now(); }
    return о;
  };
  const опрос = ({ свежее = false } = {}) => {
    if (свежее) {
      if (!свежийПуть) свежийПуть = сходить(true).then(запомнить).finally(() => { свежийПуть = null; });
      return свежийПуть;
    }
    if (ответ && Date.now() - когда < СВЕЖО_МС) return Promise.resolve(ответ);
    if (свежийПуть) return свежийПуть;
    if (!путь) путь = сходить(false).then(запомнить).finally(() => { путь = null; });
    return путь;
  };
  опрос.забыть = () => { ответ = null; когда = 0; };
  return опрос;
}

/* Билет второго ключа: его выдаёт сервер, проверив код с почты
   (api/second-key.js). Живёт в памяти страницы и уходит заголовком с
   каждой денежной просьбой, пока не истёк. */
let второйКлюч = null;
export async function подтвердитьКодПочты(код) {
  const t = await токен();
  if (!t) throw new Error("нужен вход в аккаунт");
  const res = await fetch(апи("/api/second-key"), {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code: String(код || "").trim() }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.ticket) throw new Error((json && json.error) || `ошибка ${res.status}`);
  второйКлюч = { билет: json.ticket, до: Number(json.expiresAt) * 1000 };
  return true;
}

async function запрос(путь, тело) {
  const t = await токен();
  if (!t) throw new Error("нужен вход в аккаунт");
  const билет = второйКлюч && второйКлюч.до > Date.now() + 5000 ? второйКлюч.билет : null;
  const res = await fetch(путь, {
    method: тело ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${t}`,
      ...(билет ? { "X-Second-Key": билет } : {}),
      ...(тело ? { "Content-Type": "application/json" } : {}),
    },
    body: тело ? JSON.stringify(тело) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && (json.detail || json.error)) || `ошибка ${res.status}`);
  return json;
}

/* Одноразовая метка операции. Живёт ровно одно нажатие: сервер по ней
   узнаёт повтор и не делает вторую сделку. */
function ключЗапроса() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* старый браузер — соберём вручную */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* Включён ли внутренний кошелёк на этой площадке. Ответ не меняется без
   перезапуска сервера, поэтому спрашиваем один раз за сеанс. */
let включён = null;
export async function внутреннийДоступен() {
  if (включён !== null) return включён;
  try {
    const j = await fetch(апи("/api/wallet-solana?action=enabled")).then((r) => r.json());
    включён = !!(j && j.enabled);
  } catch {
    включён = false;
  }
  return включён;
}

/* Адрес, остаток и всё, что нужно разделу кошелька: привязанный адрес
   вывода, ожидающая привязка, порог автовывода и остаток суточного
   лимита. Возвращает null, если человек не вошёл или кошелёк выключен —
   вызывающий код тогда просто идёт прежним путём. */
let прежнееSol = null;
let прежнееСостояние = null;
const опросSol = одинОпрос(async (свежее) => {
  if (!(await внутреннийДоступен())) return null;
  // Кошелёк привязан к аккаунту: без входа его нет и быть не может.
  // Раньше карточка в этом случае просто исчезала, и понять, почему её
  // нет, было нельзя ни человеку, ни нам.
  if (!(await токен())) return { нуженВход: true };
  const кто = последнийВход;
  try {
    const св = await запрос(`/api/wallet-solana?action=state${свежее ? "&fresh=1" : ""}`);
    // Сеть не ответила (sol: null) — держим прежнее число, а не ноль.
    if (св && св.sol == null) св.sol = прежнееSol != null ? прежнееSol : null;
    if (св && св.sol != null) прежнееSol = св.sol;
    if (св) прежнееСостояние = св;
    if (св && св.sol != null) записатьОстатки(кто, { sol: св.sol });
    return св;
  } catch (e) {
    // Сбой запроса — отдаём прежнее состояние, если оно было: карточка
    // не должна обнуляться из-за одного неудачного опроса.
    if (прежнееСостояние) return прежнееСостояние;
    return { ошибка: String((e && e.message) || e).slice(0, 120) };
  }
});
export function состояниеВнутреннего(опции) {
  return опросSol(опции);
}

/* Адрес кошелька Solana без похода в сеть, если он уже известен. Адрес
   не меняется, а сделка, которая перед отправкой ждала полный опрос
   состояния (с остатком из сети), теряла на этом лишние полсекунды. */
export async function адресВнутреннего() {
  if (прежнееСостояние && прежнееСостояние.address) return прежнееСостояние.address;
  const св = await состояниеВнутреннего();
  return св && св.address ? св.address : null;
}

/* --- Тот же кошелёк, только в TON -------------------------------------
 *
 * Устроен так же: ключ рождается и живёт на сервере, браузер называет
 * намерение. Отдельная пара функций, а не флаг у прежних, потому что
 * сети ничего общего не имеют — ни адреса, ни единицы, ни обработчик.
 */
let включёнTON = null;
export async function внутреннийTONДоступен() {
  if (включёнTON !== null) return включёнTON;
  try {
    const j = await fetch(апи("/api/wallet-ton?action=enabled")).then((r) => r.json());
    включёнTON = !!(j && j.enabled);
  } catch {
    включёнTON = false;
  }
  return включёнTON;
}

let прежнееTON = null;
const опросTON = одинОпрос(async (свежее) => {
  if (!(await внутреннийTONДоступен())) return null;
  if (!(await токен())) return { нуженВход: true };
  const кто = последнийВход;
  try {
    const св = await запрос(`/api/wallet-ton?action=state${свежее ? "&fresh=1" : ""}`);
    // Сеть не ответила (ton: null) — держим прежнее число, а не ноль.
    if (св && св.ton == null && прежнееTON && прежнееTON.ton != null) св.ton = прежнееTON.ton;
    if (св) прежнееTON = св;
    if (св && св.ton != null) записатьОстатки(кто, { ton: св.ton });
    return св;
  } catch (e) {
    if (прежнееTON) return прежнееTON;
    return { ошибка: String((e && e.message) || e).slice(0, 120) };
  }
});
export function состояниеВнутреннегоTON(опции) {
  return опросTON(опции);
}

/* После своей траты — переспросить сеть, не дожидаясь круга опроса, а
   потраченное сразу вычесть из общей памяти: «Макс» и «Доступно» должны
   показать новый остаток в ту же секунду, а не когда узел увидит сделку.
   Узлы видят её не сразу — спрашиваем трижды. */
function послеТраты(сеть, потрачено = 0) {
  if (Number(потрачено) > 0) списатьОстаток(сеть, Number(потрачено));
  const опрос = сеть === "sol" ? опросSol : сеть === "ton" ? опросTON : опросEVM;
  for (const мс of [1200, 3500, 8000]) {
    setTimeout(() => { опрос({ свежее: true }).catch(() => {}); }, мс);
  }
}

/* Покупка и продажа на кривой TON — кошельком приложения.
   Наружу уходит только «этот токен, столько-то»: адрес кривой сервер
   берёт из базы по токену, и подсунуть чужой контракт нельзя. */
export async function купитьВнутреннимTON({ tokenId, сумма, скорость = скоростьСделки() }) {
  // Ключ запроса — от повторов: двойное нажатие не должно превращаться
  // во вторую покупку, сервер по нему вернёт исход первой. Скорость — как
  // в Solana и EVM: от неё наценка и путь сделки на сервере.
  const j = await запрос("/api/wallet-ton?action=buy", { tokenId, amount: сумма, speed: скорость, payCoins: платитьМонетами(), requestKey: ключЗапроса() });
  послеТраты("ton", сумма);
  return j;
}

/* Запуск токена в TON кошельком приложения: сервер получает адрес уже
   загруженных метаданных и сумму покупки, остальное собирает сам. */
export async function запуститьВнутреннимTON({ metadataUrl, buyAmount }) {
  const j = await запрос("/api/wallet-ton?action=launch", { metadataUrl, buyAmount, requestKey: ключЗапроса() });
  послеТраты("ton", buyAmount);
  return j;
}

export async function продатьВнутреннимTON({ tokenId, количество, скорость = скоростьСделки() }) {
  const j = await запрос("/api/wallet-ton?action=sell", { tokenId, amount: количество, speed: скорость, payCoins: платитьМонетами(), requestKey: ключЗапроса() });
  послеТраты("ton");
  return j;
}

/* --- Действия, которые тратят монеты ---------------------------------
   Все они называют серверу намерение, а не транзакцию. */

export async function запуститьВнутренним({ имя, тикер, взносSol = 0 }) {
  const j = await запрос("/api/wallet-solana?action=launch", {
    name: имя, ticker: тикер, buySol: взносSol, requestKey: ключЗапроса(),
  });
  послеТраты("sol", взносSol);
  return j;
}

/* Скорость сделки — выбор человека в окне сделки и в «Быстрой покупке»
   (см. App.tsx): от неё чаевые сети, наценка площадке и путь сделки на
   сервере (api/_speed.js). */
/* Платить наценку за скорость монетами приложения (раздел «Тариф»).
   Хватит ли монет, решает сервер: не хватит — наценка уйдёт как обычно. */
export function платитьМонетами() {
  try { return localStorage.getItem("mintly_pay_coins") === "1"; } catch { return false; }
}
export function скоростьСделки() {
  // Разовая скорость из меню сделки («По рынку» — без ускорения тарифа).
  if (typeof window !== "undefined" && window.__mintlyРазоваяСкорость) return window.__mintlyРазоваяСкорость;
  try { const v = localStorage.getItem("mintly_trade_speed"); return ["normal", "fast", "turbo"].includes(v) ? v : "fast"; } catch { return "fast"; }
}
export async function сделкаВнутренним({ mint, продажа = false, amount, minOut = 0, скорость = скоростьСделки() }) {
  const j = await запрос("/api/wallet-solana?action=trade", {
    mint, sell: продажа, amount, minOut, speed: скорость, payCoins: платитьМонетами(), requestKey: ключЗапроса(),
  });
  // Без подписи сделки не было. Молчать об этом нельзя: приложение
  // запишет её в историю и уменьшит позицию, а в цепочке ничего не
  // произошло — ровно то, на что человек и жаловался.
  if (!j || !j.signature) throw new Error("сделка не прошла");
  послеТраты("sol", продажа ? 0 : amount);
  // Вместе с подписью приходят настоящие числа сделки: сколько токенов
  // ушло и сколько монет пришло. История пишется по ним.
  return { signature: j.signature, tokens: j.tokens, bought: j.bought, solOut: j.solOut };
}

/* Курс обмена. Спрашивается на каждое изменение суммы, поэтому без
   ключа операции и без подписи: это только предпросмотр. */
export async function курсОбмена({ вход, выход, сумма, проскальзывание = 150 }) {
  const п = new URLSearchParams({
    action: "quote", input: вход, output: выход,
    amount: String(сумма), slippage: String(проскальзывание),
  });
  const j = await запрос(`/api/wallet-solana?${п}`);
  return j || null;
}

// Обёрнутый SOL — так обмен называет саму монету сети.
const SOL_МИНТ = "So11111111111111111111111111111111111111112";

export async function свопВнутренним({ вход, выход, сумма, проскальзывание = 150 }) {
  const j = await запрос("/api/wallet-solana?action=swap", {
    input: вход, output: выход, amount: String(сумма),
    slippage: проскальзывание, requestKey: ключЗапроса(),
  });
  if (!j || !j.signature) throw new Error("обмен не прошёл");
  // Отдали SOL — сумма в лямпортах; отдали токен — SOL только придёт.
  послеТраты("sol", вход === SOL_МИНТ ? Number(сумма) / 1e9 : 0);
  // Тот же вид ответа, что и у сделки на кривой: у биржи точных чисел
  // сделки нет, поэтому здесь только подпись.
  return { signature: j.signature };
}

/* --- Обмен между сетями ----------------------------------------------
   SOL и GRAM живут в разных цепочках, и одной сделкой их не поменять:
   моста у площадки нет. Меняет казначейство — запас обеих монет на своих
   кошельках: монета человека уходит на казначейский адрес, а казна тем
   же движением шлёт другую в другой сети (см. api/treasury-swap.js). */

export async function казнаСостояние() {
  try {
    const res = await fetch(апи("/api/treasury-swap?action=state"));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function курсМеждуСетями({ откуда, сумма }) {
  const res = await fetch(апи("/api/treasury-swap?action=quote"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: откуда, amount: сумма }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && (json.detail || json.error)) || `ошибка ${res.status}`);
  return json;
}

export async function обменМеждуСетями({ откуда, сумма }) {
  const j = await запрос(апи("/api/treasury-swap?action=swap"), {
    from: откуда, amount: сумма, requestKey: ключЗапроса(),
  });
  // Меняются обе сети: одна монета ушла, другая придёт.
  послеТраты(откуда === "GRAM" ? "ton" : "sol", сумма);
  послеТраты(откуда === "GRAM" ? "sol" : "ton");
  return j;
}

/* Вывод. Адрес не передаётся: сервер отправит только на привязанный —
   тот, владение которым доказано подписью. all — «всё, что есть»:
   сервер оставит запас на комиссию, иначе перевод не пройдёт вовсе. */
export async function вывестиСВнутреннего({ amount, all = false, адрес = "", кому = null }) {
  const j = await запрос("/api/wallet-solana?action=withdraw", {
    amount, all, address: адрес || undefined, toUser: кому || undefined, requestKey: ключЗапроса(),
  });
  // «Всё» — сколько именно ушло, знает сервер; дождёмся сети.
  послеТраты("sol", all ? 0 : amount);
  return j;
}

/* Вывод в TON — та же дорога, только другая ручка. Адрес, как и в
   Solana, нужен лишь пока не привязан постоянный. */
export async function вывестиСВнутреннегоTON({ amount, all = false, адрес = "", кому = null }) {
  const j = await запрос("/api/wallet-ton?action=withdraw", {
    amount, all, address: адрес || undefined, toUser: кому || undefined, requestKey: ключЗапроса(),
  });
  послеТраты("ton", all ? 0 : amount);
  return j;
}

/* Перевод человеку Mintly — по нику. Сервер отдаёт ник, аватар и id;
   адрес кошелька получателя он найдёт сам, когда дойдёт до перевода
   (toUser в выводе). */
export async function найтиЧеловека(ник) {
  const j = await запрос(апи(`/api/transfer?nick=${encodeURIComponent(String(ник || "").replace(/^@/, ""))}`));
  return j && j.user ? j.user : null;
}

/* --- Привязка адреса вывода ------------------------------------------
   Кошелёк подписывает строку, которую выдал сервер, и этим доказывает,
   что адрес его. Смена уже привязанного адреса вступает в силу через
   сутки — за это время хозяин увидит письмо от бота и успеет отменить,
   если привязку заказал не он. */
export async function привязатьАдресВывода(сессияPhantom) {
  const { подключить, сохранённаяСессия, подписатьСообщение } = await import("./phantom");
  const сессия = сессияPhantom || сохранённаяСессия() || (await подключить());

  const { message } = await запрос("/api/wallet-solana?action=payout-nonce", { address: сессия.wallet });
  const подпись = await подписатьСообщение(message, сессия);
  return await запрос("/api/wallet-solana?action=payout-set", {
    address: сессия.wallet, signature: подпись,
  });
}

export async function отменитьПривязку() {
  return await запрос("/api/wallet-solana?action=payout-cancel", { });
}

/* Порог автовывода: всё, что выше, уходит на свой адрес по расписанию.
   null — выключить. */
export async function автовывод(порог) {
  return await запрос("/api/wallet-solana?action=sweep-set", { above: порог });
}

/* Фраза кошелька: показать один раз и отметить, что её записали.
 *
 * Кошелёк заводится сам, вместе с аккаунтом, — и до этого экрана человек
 * ни разу не видел запись из двадцати четырёх слов, по которой деньги
 * возвращаются. Сервер отдаёт её ровно до подтверждения и больше не
 * повторяет: открытая сессия не должна открывать кошелёк целиком. */
export async function состояниеФразы() {
  return запрос(апи("/api/wallet-seed?action=state"));
}

/* Повторный показ фразы сервер пускает только из свежего входа.
   Внутри Telegram входим заново молча — по подписи, которую Telegram
   выдал при открытии приложения, — и спрашиваем ещё раз. */
async function войтиЗаново() {
  const wa = typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp;
  const initData = wa && wa.initData;
  if (!initData) return false;
  const res = await fetch(апи("/api/telegram-auth"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.token_hash) return false;
  const { error } = await supabase.auth.verifyOtp({ token_hash: json.token_hash, type: "magiclink" });
  return !error;
}

export async function показатьФразу() {
  try {
    return await запрос(апи("/api/wallet-seed?action=reveal"), {});
  } catch (e) {
    if (!String((e && e.message) || "").includes("need_fresh_login")) throw e;
    if (!(await войтиЗаново())) throw e;
    return запрос(апи("/api/wallet-seed?action=reveal"), {});
  }
}

export async function отметитьФразу() {
  return запрос(апи("/api/wallet-seed?action=confirm"), {});
}

/* Отложить запись. Кошелёк идёт в работу, а слова человек перепишет
   позже — из пункта «Секретная фраза». Пока отметки нет, «Создать
   кошелёк» каждый раз заводит новую фразу: уйти с середины проверки
   безопасно. */
export async function отложитьФразу() {
  return запрос(апи("/api/wallet-seed?action=skip"), {});
}

/* --- Сети EVM: BNB Chain, Base, Ethereum --------------------------------
 *
 * Адрес один на все три сети и выводится из той же фразы, что и TON с
 * Solana (тот же, что покажет MetaMask по этой фразе). Как и в других
 * сетях, отсюда уходит только намерение: «запусти токен с таким именем»,
 * «купи этот токен на столько-то». Контракт фабрики сервер берёт из
 * своих настроек. */
let сетиEVM = null;
export async function сетиEVMВключены() {
  if (сетиEVM) return сетиEVM;
  try {
    const j = await fetch(апи("/api/wallet-evm?action=enabled")).then((r) => r.json());
    сетиEVM = j && j.enabled ? j.chains || {} : {};
    // Тестовые ли сети — одной пометкой на все три.
    Object.defineProperty(сетиEVM, "тестовые", { value: !!(j && j.testnet), enumerable: false });
  } catch {
    сетиEVM = {};
  }
  return сетиEVM;
}

let прежнееEVM = null;
const опросEVM = одинОпрос(async (свежее) => {
  if (!(await токен())) return null;
  const кто = последнийВход;
  try {
    const св = await запрос(апи(`/api/wallet-evm?action=state${свежее ? "&fresh=1" : ""}`));
    // Сеть, которая не ответила, держит прежнее число, а не ноль.
    if (св && св.chains && прежнееEVM && прежнееEVM.chains) {
      for (const [к, v] of Object.entries(св.chains)) {
        if (v && v.native == null && прежнееEVM.chains[к]) св.chains[к] = прежнееEVM.chains[к];
      }
    }
    if (св) прежнееEVM = св;
    if (св && св.chains) {
      записатьОстатки(кто, Object.fromEntries(Object.entries(св.chains).map(([к, v]) => [к, v ? v.native : null])));
    }
    return св;
  } catch {
    return прежнееEVM;
  }
});
export function состояниеEVM(опции) {
  return опросEVM(опции);
}

export async function запуститьEVM({ сеть, имя, тикер, metadataUrl, взнос = 0 }) {
  const j = await запрос(апи("/api/wallet-evm?action=launch"), {
    chain: сеть, name: имя, ticker: тикер, metadataUrl, buyAmount: взнос, speed: "normal", requestKey: ключЗапроса(),
  });
  послеТраты(сеть, взнос);
  return j;
}

export async function сделкаEVM({ сеть, токен: адрес, продажа = false, сумма, raw = null }) {
  const j = await запрос(апи(`/api/wallet-evm?action=${продажа ? "sell" : "buy"}`), {
    chain: сеть, token: адрес, amount: сумма, raw, speed: скоростьСделки(), payCoins: платитьМонетами(), requestKey: ключЗапроса(),
  });
  послеТраты(сеть, продажа ? 0 : сумма);
  return j;
}

export async function остатокТокенаEVM({ сеть, токен: адрес }) {
  return await запрос(апи(`/api/wallet-evm?action=token-balance&chain=${сеть}&token=${адрес}`));
}

export async function криваяEVM({ сеть, токен: адрес }) {
  const r = await fetch(апи(`/api/wallet-evm?action=curve&chain=${сеть}&token=${адрес}`));
  if (!r.ok) return null;
  return r.json();
}

export async function котировкаEVM({ сеть, токен: адрес, продажа = false, сумма }) {
  const r = await fetch(апи(`/api/wallet-evm?action=quote&chain=${сеть}&token=${адрес}&side=${продажа ? "sell" : "buy"}&amount=${encodeURIComponent(String(сумма))}`));
  if (!r.ok) return null;
  return r.json();
}

/* Вывод монеты сети EVM на чужой адрес. Адрес и сумму сервер проверяет
   сам (контрольная сумма, запас на газ). */
export async function вывестиEVM({ сеть, amount, all = false, адрес = "", кому = null }) {
  const j = await запрос(апи("/api/wallet-evm?action=withdraw"), {
    chain: сеть, amount, all, address: адрес || undefined, toUser: кому || undefined, requestKey: ключЗапроса(),
  });
  послеТраты(сеть, all ? 0 : amount);
  return j;
}

/* Сменился аккаунт — прежние ответы не его: иначе после выхода и входа
   под другим именем первые две секунды показывали бы чужой кошелёк. */
try {
  supabase.auth.onAuthStateChange((событие, сессия) => {
    const кто = (сессия && сессия.user && сессия.user.id) || null;
    if (событие !== "SIGNED_OUT" && (!кто || кто === последнийВход || !последнийВход)) return;
    опросSol.забыть(); опросTON.забыть(); опросEVM.забыть();
    прежнееSol = null; прежнееСостояние = null; прежнееTON = null; прежнееEVM = null;
    последнийВход = кто;
  });
} catch { /* без подписки ответы просто доживут свои две секунды */ }
