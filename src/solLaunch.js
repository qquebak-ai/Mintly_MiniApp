/* Запуск и торговля своим токеном в Solana.
 *
 * Разделение работы такое же, как у сделок через Jupiter: сервер
 * собирает транзакцию, Phantom её подписывает, отправляем мы. Кошелёк
 * при этом остаётся единственным владельцем ключей — приложение видит
 * только готовые байты и подпись под ними.
 *
 * Пока программа кривой не развёрнута, запуск в Solana выключен целиком:
 * сервер отвечает, что её нет, и приложение даже не показывает кнопку.
 * Так лучше, чем предлагать действие, которое всё равно не пройдёт.
 */

import { подписать, сохранённаяСессия, подключить } from "./phantom";

async function запрос(путь, тело) {
  const res = await fetch(путь, тело ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(тело),
  } : undefined);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const причина = (json && (json.detail || json.error)) || `ошибка ${res.status}`;
    throw new Error(причина);
  }
  return json;
}

/* Развёрнута ли программа. Спрашивается один раз за сеанс: ответ не
   меняется без переустановки приложения. Заодно запоминаем параметры
   кривой: по ним форма запуска считает, сколько токенов достанется за
   стартовую покупку. Своей копии этих чисел в приложении нет намеренно —
   держать их в двух местах значит однажды показать не то, что сделает
   программа. */
let включено = null;
let параметрыКривой = null;
export async function запускВSolanaДоступен() {
  if (включено !== null) return включено;
  try {
    const j = await запрос("/api/solana-launch?action=enabled");
    включено = !!(j && j.enabled);
    if (j && j.curve) параметрыКривой = j.curve;
  } catch {
    включено = false;
  }
  return включено;
}

export async function кривойSolПараметры() {
  if (параметрыКривой) return параметрыКривой;
  try {
    const j = await запрос("/api/solana-launch?action=enabled");
    if (j && j.curve) параметрыКривой = j.curve;
  } catch { /* не ответил — считать нечем, вызывающий покажет прочерк */ }
  return параметрыКривой;
}

/* Хватает ли на внутреннем кошельке. Если да — вся операция уходит на
   сервер целиком: он и соберёт транзакцию, и подпишет, и отправит.
   Транзакция при этом не появляется в браузере ни на миг — подсунуть на
   подпись чужую попросту негде. Не хватило или кошелёк выключен —
   работаем прежним путём, через Phantom. */
async function внутреннийХватит(нужноSol = 0) {
  const { состояниеВнутреннего } = await import("./appWallet");
  const внутренний = await состояниеВнутреннего();
  return !!(внутренний && внутренний.address && (внутренний.sol || 0) >= нужноSol);
}

async function кошелёкЧеловека() {
  const сессия = сохранённаяСессия();
  if (сессия) return сессия;
  return await подключить();
}

/* Отправка подписанной транзакции. Своим узлом, а не кошельком: Phantom
   по ссылке умеет только подписывать. */
async function отправить(base64) {
  const j = await запрос("/api/solana?action=send", { transaction: base64 });
  if (!j || !j.signature) throw new Error("сеть не приняла транзакцию");
  return j.signature;
}

/* Запуск токена: одна подпись создаёт токен, метаданные и кривую, а
   заодно проводит стартовую покупку создателя. */
export async function запуститьТокенSol({ имя, тикер, стартовыйВзносSol = 0 }) {
  // Запуск стоит стартовой покупки плюс аренда счетов токена: просим у
  // внутреннего кошелька запас, иначе транзакция отвалится на середине.
  if (await внутреннийХватит(Number(стартовыйВзносSol || 0) + 0.02)) {
    const { запуститьВнутренним } = await import("./appWallet");
    const итог = await запуститьВнутренним({ имя, тикер, взносSol: стартовыйВзносSol });
    return {
      mint: итог.mint,
      curve: итог.curve,
      decimals: итог.decimals,
      signature: итог.signature,
      creatorWallet: итог.creatorWallet || "",
      explorerUrl: `https://solscan.io/token/${итог.mint}`,
    };
  }

  const сессия = await кошелёкЧеловека();
  const собрано = await запрос("/api/solana-launch?action=launch", {
    wallet: сессия.wallet,
    name: имя,
    ticker: тикер,
    buySol: стартовыйВзносSol,
  });
  const подпись = await отправить(await подписать(собрано.transaction, сессия));

  return {
    mint: собрано.mint,
    curve: собрано.curve,
    decimals: собрано.decimals,
    signature: подпись,
    creatorWallet: сессия.wallet,
    explorerUrl: `https://solscan.io/token/${собрано.mint}`,
  };
}

/* Сделка на своей кривой. amount — в SOL при покупке и в токенах при
   продаже; minOut защищает от проскальзывания. */
export async function сделкаНаКривойSol({ mint, продажа = false, amount, minOut = 0 }) {
  // При покупке нужна сама сумма плюс комиссия сети и аренда счёта
  // токена; при продаже с кошелька уходит только комиссия.
  if (await внутреннийХватит(продажа ? 0.003 : Number(amount || 0) + 0.003)) {
    const { сделкаВнутренним } = await import("./appWallet");
    return await сделкаВнутренним({ mint, продажа, amount, minOut });
  }

  const сессия = await кошелёкЧеловека();
  const собрано = await запрос("/api/solana-launch?action=trade", {
    wallet: сессия.wallet,
    mint,
    sell: продажа,
    amount,
    minOut,
  });
  return await отправить(await подписать(собрано.transaction, сессия));
}

/* Состояние кривой: цена, собранная сумма и путь до листинга. */
export async function состояниеКривойSol(mint) {
  try {
    return await запрос(`/api/solana-launch?action=state&mint=${encodeURIComponent(mint)}`);
  } catch {
    return null;
  }
}
