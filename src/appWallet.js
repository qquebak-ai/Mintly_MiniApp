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
export async function состояниеВнутреннего() {
  if (!(await внутреннийДоступен())) return null;
  // Кошелёк привязан к аккаунту: без входа его нет и быть не может.
  // Раньше карточка в этом случае просто исчезала, и понять, почему её
  // нет, было нельзя ни человеку, ни нам.
  if (!(await токен())) return { нуженВход: true };
  try {
    return await запрос("/api/wallet-solana?action=state");
  } catch (e) {
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

export async function состояниеВнутреннегоTON() {
  if (!(await внутреннийTONДоступен())) return null;
  if (!(await токен())) return { нуженВход: true };
  try {
    return await запрос("/api/wallet-ton?action=state");
  } catch (e) {
    return { ошибка: String((e && e.message) || e).slice(0, 120) };
  }
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
  return j && j.signature;
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
  return j && j.signature;
}

/* Вывод. Адрес не передаётся: сервер отправит только на привязанный —
   тот, владение которым доказано подписью. all — «всё, что есть»:
   сервер оставит запас на комиссию, иначе перевод не пройдёт вовсе. */
export async function вывестиСВнутреннего({ amount, all = false }) {
  return await запрос("/api/wallet-solana?action=withdraw", {
    amount, all, requestKey: ключЗапроса(),
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
