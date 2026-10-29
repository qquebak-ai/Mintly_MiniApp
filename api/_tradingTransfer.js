/* Переводы между картой и учебным торговым счётом (api/_tradingAccount.js).
 *
 * Пополнение: SOL с карты (внутренний Solana-кошелёк человека) уходит в
 * казну площадки (api/_treasury.js) обычным переводом, и как только сеть
 * его подтвердила — на счёт ложатся доллары по живому курсу SOL с биржи.
 * Вывод: доллары списываются со счёта, казна шлёт SOL на ту же карту.
 * Адрес назначения в обе стороны сервер берёт сам: казну — из своей
 * таблицы, карту — из кошелька человека. Из запроса адрес не приходит
 * вовсе, поэтому увести деньги «на сторону» этим путём нельзя.
 *
 * Порядок шагов выбран так, чтобы не было ни двойного зачисления, ни
 * потерянных денег:
 *  - пополнение: запись «ждёт» → перевод → подтверждение сетью →
 *    зачисление. Деньги на счёте появляются только после подтверждения;
 *  - вывод: списание → запись подписи на диск → отправка → подтверждение.
 *    Подпись сохраняется до отправки, поэтому даже после падения процесса
 *    сверка знает, какую транзакцию искать: дошла — вывод завершён, срок
 *    блока вышел, а её нет — доллары возвращаются на счёт.
 * Перевод, чей исход сеть не сказала сразу, доводит довестиПереводы —
 * сервер зовёт её по кругу (api/hyperliquid.js, запуститьСторожа).
 */

import * as счёт from "./_tradingAccount.js";

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const LAMPORTS = 1_000_000_000;
// Меньше доллара не переводим: комиссия сети и курс съели бы смысл.
export const МИН_ПЕРЕВОДА_USD = 1;
/* Сколько остаётся у казны после выплаты: плата за хранение счёта
   (0.00089 SOL — меньше сеть не даёт оставить, перевод отклоняется) и
   её собственные комиссии. */
const ЗАПАС_КАЗНЫ = 1_000_000;

// Для проверки без сети (scripts/trading-check.mjs): кошелёк, казна и выплата — подменой.
let подмена = null;
export function подменитьДляПроверки(з) { подмена = з; }
const кошелёкSolana = async () => (подмена && подмена.кошелёк) || import("./wallet-solana.js");
const модульКазны = async () => (подмена && подмена.казна) || import("./_treasury.js");

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`rpc ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc");
  return j.result;
}

/* Исход транзакции: true — подтверждена, false — упала, null — сеть пока
   не знает. Историю ищем тоже: подтверждённая минуту назад транзакция
   уходит из быстрого кеша узла, и без этого казалась бы пропавшей. */
async function исход(подпись) {
  const о = await rpc("getSignatureStatuses", [[подпись], { searchTransactionHistory: true }]);
  const с = о && о.value && о.value[0];
  if (!с) return null;
  if (с.err) return false;
  return с.confirmationStatus === "confirmed" || с.confirmationStatus === "finalized" ? true : null;
}
async function дождаться(подпись, мс) {
  const до = Date.now() + мс;
  while (Date.now() < до) {
    const и = await исход(подпись).catch(() => null);
    if (и !== null) return и;
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}

async function казнаSolana() {
  const { админ, ключи, казна } = await модульКазны();
  const db = админ();
  const набор = ключи();
  if (!db || !набор) throw Object.assign(new Error("not_configured"), { код: 503 });
  return { db, набор, строка: await казна(db, набор, "solana") };
}

// Вычеркнуть из журнала кошелька перевод, который так и не состоялся.
async function вычеркнуть(uid, ключЗапроса) {
  try {
    const { админ } = await модульКазны();
    const db = админ();
    if (db) await db.from("wallet_ops").delete().eq("user_id", uid).eq("request_key", ключЗапроса).eq("kind", "trading_in");
  } catch { /* журнал — не главное */ }
}

/* Карта → торговый счёт. sol — сколько SOL перевести; цена — курс SOL
   с биржи в эту минуту (по нему и зачисляем). */
export async function наТорговый({ uid, sol, ключ, цена }) {
  const лампорты = Math.floor((Number(sol) || 0) * LAMPORTS);
  if (!(лампорты > 0)) throw Object.assign(new Error("bad_amount"), { код: 400 });
  if (!(цена > 0)) throw Object.assign(new Error("price_stale"), { код: 503 });
  // Курс — вниз до цента за SOL: зачисляем не больше, чем стоит перевод.
  const µ = Math.floor((лампорты / LAMPORTS) * Math.floor(цена * 100) / 100 * 1e6);
  if (µ < МИН_ПЕРЕВОДА_USD * 1e6) throw Object.assign(new Error("min_transfer"), { код: 400, min: МИН_ПЕРЕВОДА_USD });
  const начало = счёт.начатьВвод(uid, { ключ, лампорты, цена, µ });
  if (начало.повтор) return начало.ответ;
  if (начало.идёт) return { ok: true, pending: true };

  const { строка } = await казнаSolana();
  const { отправитьНаБиржу } = await кошелёкSolana();
  let итог;
  try {
    итог = await отправитьНаБиржу({
      user_id: uid, сумма: лампорты / LAMPORTS, куда: строка.address,
      ключЗапроса: `ta:in:${ключ}`, вид: "trading_in",
    });
  } catch (e) {
    // Перевод не ушёл — ждать нечего, запись снимаем.
    счёт.снятьПеревод(uid, ключ);
    throw e;
  }
  счёт.подписьПеревода(uid, ключ, итог.signature);
  const ок = await дождаться(итог.signature, 30_000);
  if (ок === true) return счёт.зачестьВвод(uid, ключ);
  if (ок === false) {
    счёт.снятьПеревод(uid, ключ);
    await вычеркнуть(uid, `ta:in:${ключ}`);
    throw Object.assign(new Error("rejected"), { код: 400 });
  }
  // Сеть пока молчит — зачислит сверка, как только подтвердит.
  return { ok: true, pending: true, signature: итог.signature };
}

/* Выплата из казны на карту. Подпись известна до отправки — её сначала
   запоминает счёт (запомнить), и только потом транзакция уходит в сеть. */
async function выплатить({ куда, лампорты, запомнить }) {
  const { набор, строка } = await казнаSolana();
  const { открытьСекрет } = await модульКазны();
  const { Keypair, Connection, PublicKey, SystemProgram, Transaction } = await import("@solana/web3.js");
  const bs58 = (await import("bs58")).default;
  const пара = Keypair.fromSecretKey(new Uint8Array(открытьСекрет(строка, набор, "treasury:solana")));
  const соединение = new Connection(RPC, "confirmed");
  let есть = await соединение.getBalance(пара.publicKey, "confirmed");
  if (есть < лампорты + ЗАПАС_КАЗНЫ && /devnet|testnet/i.test(RPC)) {
    /* Учебная казна иссякла — просим кран девнета. Он часто отказывает
       (предел на адрес), тогда вывод честно говорит «казна пуста», а
       доллары остаются на счёте. */
    try {
      const п = await соединение.requestAirdrop(пара.publicKey, 2 * LAMPORTS);
      await соединение.confirmTransaction(п, "confirmed");
      есть = await соединение.getBalance(пара.publicKey, "confirmed");
    } catch { /* кран отказал */ }
  }
  if (есть < лампорты + ЗАПАС_КАЗНЫ) throw Object.assign(new Error("treasury_low"), { код: 503 });
  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: пара.publicKey, toPubkey: new PublicKey(куда), lamports: лампорты,
  }));
  const { blockhash, lastValidBlockHeight } = await соединение.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = пара.publicKey;
  tx.sign(пара);
  const подпись = bs58.encode(tx.signature);
  запомнить(подпись, lastValidBlockHeight);
  try {
    await соединение.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 });
  } catch (e) {
    /* Прогонку отклонил сам узел — транзакция в сеть не попала, и деньги
       можно вернуть сразу. Обрыв связи — другое: она могла и уйти, тогда
       решит сверка по подписи. */
    const отказ = /simulation|preflight|insufficient|custom program error/i.test(String(e && e.message));
    throw Object.assign(new Error(отказ ? "payout_failed" : "payout_unknown"), { код: 502, неизвестно: !отказ, подпись });
  }
  const ок = await дождаться(подпись, 45_000);
  if (ок === true) return { подпись, казна: строка.address };
  if (ок === false) throw Object.assign(new Error("payout_failed"), { код: 502, подпись });
  throw Object.assign(new Error("payout_unknown"), { код: 502, неизвестно: true, подпись });
}

async function записатьВывод(uid, { лампорты, казна, подпись, ключ }) {
  try {
    const { админ } = await модульКазны();
    const db = админ();
    if (!db) return;
    const { error } = await db.from("wallet_ops").insert({
      user_id: uid, chain: "solana", kind: "trading_out", amount: лампорты / LAMPORTS,
      address: казна, signature: подпись, request_key: `ta:out:${ключ}`,
    });
    // Повтор того же вывода — строка уже есть, вторая не нужна.
    if (error && !/duplicate|unique/i.test(error.message)) console.warn("[торговый счёт] журнал вывода", error.message);
  } catch (e) { console.warn("[торговый счёт] журнал вывода", e && e.message); }
}

/* Торговый счёт → карта. usd — сколько долларов вывести; SOL считается по
   курсу биржи в эту минуту, вниз до лампорта. */
export async function сТоргового({ uid, usd, ключ, цена }) {
  const µ = Math.floor((Number(usd) || 0) * 100) * 1e4;
  if (µ < МИН_ПЕРЕВОДА_USD * 1e6) throw Object.assign(new Error("min_transfer"), { код: 400, min: МИН_ПЕРЕВОДА_USD });
  if (!(цена > 0)) throw Object.assign(new Error("price_stale"), { код: 503 });
  // Курс — вверх до цента за SOL: SOL на выход не больше, чем стоят доллары.
  const лампорты = Math.floor((µ / 1e6 / (Math.ceil(цена * 100) / 100)) * LAMPORTS);
  const { кошелёкДляБота } = await кошелёкSolana();
  const карта = await кошелёкДляБота(uid);
  if (!карта || !карта.address) throw Object.assign(new Error("no_wallet"), { код: 400 });
  const начало = счёт.начатьВывод(uid, { ключ, µ, цена, лампорты });
  if (начало.повтор) return начало.ответ;
  if (начало.идёт) return { ok: true, pending: true };
  try {
    const { подпись, казна } = await ((подмена && подмена.выплатить) || выплатить)({
      куда: карта.address, лампорты,
      запомнить: (п, до) => счёт.подписьПеревода(uid, ключ, п, до),
    });
    const ответ = счёт.завершитьВывод(uid, ключ, подпись);
    await записатьВывод(uid, { лампорты, казна, подпись, ключ });
    return ответ;
  } catch (e) {
    if (e && e.неизвестно) return { ok: true, pending: true, signature: e.подпись || null };
    счёт.снятьПеревод(uid, ключ);
    throw e;
  }
}

/* Сверка переводов с сетью — для тех, чей исход не был ясен сразу, и для
   оставшихся после перезапуска. Решает только по ответу сети: подтверждена
   — довести, упала или срок блока вышел — отменить. */
export async function довестиПереводы() {
  const ждут = счёт.ждущиеПереводы();
  if (!ждут.length) return 0;
  let высота = null;
  let сделано = 0;
  for (const ж of ждут) {
    try {
      const возраст = Date.now() - (ж.отправлен || ж.at);
      if (!ж.подпись) {
        // Пополнение без подписи — процесс упал на отправке. Журнал кошелька
        // знает подпись по ключу запроса, если перевод всё же ушёл.
        if (ж.вид === "in" && возраст > 90_000) {
          const { админ } = await модульКазны();
          const db = админ();
          const { data } = db ? await db.from("wallet_ops").select("signature").eq("user_id", ж.uid).eq("request_key", `ta:in:${ж.ключ}`).maybeSingle() : { data: null };
          if (data && data.signature) счёт.подписьПеревода(ж.uid, ж.ключ, data.signature);
          else if (возраст > 5 * 60_000) { счёт.снятьПеревод(ж.uid, ж.ключ); сделано++; }
        }
        // Вывод без подписи не отправлялся вовсе: подпись пишется до отправки.
        if (ж.вид === "out" && возраст > 90_000) { счёт.снятьПеревод(ж.uid, ж.ключ); сделано++; }
        continue;
      }
      const и = await исход(ж.подпись);
      if (и === true) {
        if (ж.вид === "in") счёт.зачестьВвод(ж.uid, ж.ключ);
        else {
          счёт.завершитьВывод(ж.uid, ж.ключ, ж.подпись);
          const { строка } = await казнаSolana();
          await записатьВывод(ж.uid, { лампорты: ж.лампорты, казна: строка.address, подпись: ж.подпись, ключ: ж.ключ });
        }
        сделано++;
        continue;
      }
      let истёк = false;
      if (и === null) {
        if (ж.до) {
          if (высота == null) высота = await rpc("getBlockHeight", [{ commitment: "confirmed" }]).catch(() => null);
          истёк = высота != null && высота > ж.до + 30;
        } else истёк = возраст > 5 * 60_000;
      }
      if (и === false || истёк) {
        счёт.снятьПеревод(ж.uid, ж.ключ);
        if (ж.вид === "in") await вычеркнуть(ж.uid, `ta:in:${ж.ключ}`);
        сделано++;
      }
    } catch (e) {
      console.warn("[торговый счёт] сверка перевода", e && e.message);
    }
  }
  return сделано;
}
