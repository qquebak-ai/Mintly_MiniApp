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

async function токен() {
  const { data } = await supabase.auth.getSession();
  return (data && data.session && data.session.access_token) || null;
}

async function запрос(путь, тело) {
  const t = await токен();
  if (!t) throw new Error("нужен вход в аккаунт");
  const res = await fetch(путь, {
    method: тело ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${t}`,
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
export async function состояниеВнутреннего() {
  if (!(await внутреннийДоступен())) return null;
  // Кошелёк привязан к аккаунту: без входа его нет и быть не может.
  // Раньше карточка в этом случае просто исчезала, и понять, почему её
  // нет, было нельзя ни человеку, ни нам.
  if (!(await токен())) return { нуженВход: true };
  try {
    const св = await запрос("/api/wallet-solana?action=state");
    // Сеть не ответила (sol: null) — держим прежнее число, а не ноль.
    if (св && св.sol == null) св.sol = прежнееSol != null ? прежнееSol : null;
    if (св && св.sol != null) прежнееSol = св.sol;
    if (св) прежнееСостояние = св;
    return св;
  } catch (e) {
    // Сбой запроса — отдаём прежнее состояние, если оно было: карточка
    // не должна обнуляться из-за одного неудачного опроса.
    if (прежнееСостояние) return прежнееСостояние;
    return { ошибка: String((e && e.message) || e).slice(0, 120) };
  }
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
export async function состояниеВнутреннегоTON() {
  if (!(await внутреннийTONДоступен())) return null;
  if (!(await токен())) return { нуженВход: true };
  try {
    const св = await запрос("/api/wallet-ton?action=state");
    // Сеть не ответила (ton: null) — держим прежнее число, а не ноль.
    if (св && св.ton == null && прежнееTON && прежнееTON.ton != null) св.ton = прежнееTON.ton;
    if (св) прежнееTON = св;
    return св;
  } catch (e) {
    if (прежнееTON) return прежнееTON;
    return { ошибка: String((e && e.message) || e).slice(0, 120) };
  }
}

/* Покупка и продажа на кривой TON — кошельком приложения.
   Наружу уходит только «этот токен, столько-то»: адрес кривой сервер
   берёт из базы по токену, и подсунуть чужой контракт нельзя. */
export async function купитьВнутреннимTON({ tokenId, сумма }) {
  // Ключ запроса — от повторов: двойное нажатие не должно превращаться
  // во вторую покупку, сервер по нему вернёт исход первой.
  return await запрос("/api/wallet-ton?action=buy", { tokenId, amount: сумма, requestKey: ключЗапроса() });
}

/* Запуск токена в TON кошельком приложения: сервер получает адрес уже
   загруженных метаданных и сумму покупки, остальное собирает сам. */
export async function запуститьВнутреннимTON({ metadataUrl, buyAmount }) {
  return await запрос("/api/wallet-ton?action=launch", { metadataUrl, buyAmount, requestKey: ключЗапроса() });
}

export async function продатьВнутреннимTON({ tokenId, количество }) {
  return await запрос("/api/wallet-ton?action=sell", { tokenId, amount: количество, requestKey: ключЗапроса() });
}

/* --- Действия, которые тратят монеты ---------------------------------
   Все они называют серверу намерение, а не транзакцию. */

export async function запуститьВнутренним({ имя, тикер, взносSol = 0 }) {
  return await запрос("/api/wallet-solana?action=launch", {
    name: имя, ticker: тикер, buySol: взносSol, requestKey: ключЗапроса(),
  });
}

export async function сделкаВнутренним({ mint, продажа = false, amount, minOut = 0 }) {
  const j = await запрос("/api/wallet-solana?action=trade", {
    mint, sell: продажа, amount, minOut, requestKey: ключЗапроса(),
  });
  // Без подписи сделки не было. Молчать об этом нельзя: приложение
  // запишет её в историю и уменьшит позицию, а в цепочке ничего не
  // произошло — ровно то, на что человек и жаловался.
  if (!j || !j.signature) throw new Error("сделка не прошла");
  // Вместе с подписью приходят настоящие числа сделки: сколько токенов
  // ушло и сколько монет пришло. История пишется по ним.
  return { signature: j.signature, tokens: j.tokens, solOut: j.solOut };
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

export async function свопВнутренним({ вход, выход, сумма, проскальзывание = 150 }) {
  const j = await запрос("/api/wallet-solana?action=swap", {
    input: вход, output: выход, amount: String(сумма),
    slippage: проскальзывание, requestKey: ключЗапроса(),
  });
  if (!j || !j.signature) throw new Error("обмен не прошёл");
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
  return await запрос(апи("/api/treasury-swap?action=swap"), {
    from: откуда, amount: сумма, requestKey: ключЗапроса(),
  });
}

/* Вывод. Адрес не передаётся: сервер отправит только на привязанный —
   тот, владение которым доказано подписью. all — «всё, что есть»:
   сервер оставит запас на комиссию, иначе перевод не пройдёт вовсе. */
export async function вывестиСВнутреннего({ amount, all = false, адрес = "" }) {
  return await запрос("/api/wallet-solana?action=withdraw", {
    amount, all, address: адрес || undefined, requestKey: ключЗапроса(),
  });
}

/* Вывод в TON — та же дорога, только другая ручка. Адрес, как и в
   Solana, нужен лишь пока не привязан постоянный. */
export async function вывестиСВнутреннегоTON({ amount, all = false, адрес = "" }) {
  return await запрос("/api/wallet-ton?action=withdraw", {
    amount, all, address: адрес || undefined, requestKey: ключЗапроса(),
  });
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

export async function показатьФразу() {
  return запрос(апи("/api/wallet-seed?action=reveal"), {});
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
export async function состояниеEVM() {
  if (!(await токен())) return null;
  try {
    const св = await запрос(апи("/api/wallet-evm?action=state"));
    // Сеть, которая не ответила, держит прежнее число, а не ноль.
    if (св && св.chains && прежнееEVM && прежнееEVM.chains) {
      for (const [к, v] of Object.entries(св.chains)) {
        if (v && v.native == null && прежнееEVM.chains[к]) св.chains[к] = прежнееEVM.chains[к];
      }
    }
    if (св) прежнееEVM = св;
    return св;
  } catch {
    return прежнееEVM;
  }
}

export async function запуститьEVM({ сеть, имя, тикер, metadataUrl, взнос = 0 }) {
  return await запрос(апи("/api/wallet-evm?action=launch"), {
    chain: сеть, name: имя, ticker: тикер, metadataUrl, buyAmount: взнос, requestKey: ключЗапроса(),
  });
}

export async function сделкаEVM({ сеть, токен: адрес, продажа = false, сумма, raw = null }) {
  return await запрос(апи(`/api/wallet-evm?action=${продажа ? "sell" : "buy"}`), {
    chain: сеть, token: адрес, amount: сумма, raw, requestKey: ключЗапроса(),
  });
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
