/* Проверка торгового счёта без сети и без базы: сделки, тейк, стоп,
 * ликвидация, переводы карта ⇄ счёт, повторы по ключу, одновременные
 * запросы и запись на диск.
 *
 *   node scripts/trading-check.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

process.env.LIVE_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "trading-check-"));
process.env.SOLANA_RPC = "http://rpc.test";

const счёт = await import("../api/_tradingAccount.js");
const перевод = await import("../api/_tradingTransfer.js");

let прошло = 0;
const проверка = async (имя, дело) => {
  try { await дело(); прошло++; console.log("✓", имя); } catch (e) { console.error("✗", имя, "\n ", e && e.stack); process.exitCode = 1; }
};
const близко = (a, b, допуск = 1e-6) => assert.ok(Math.abs(a - b) <= допуск, `${a} ≠ ${b}`);
const ЧЕЛ = "11111111-2222-3333-4444-555555555555";
const ДРУГОЙ = "66666666-7777-8888-9999-000000000000";
const BTC = { asset: 0, coin: "BTC", name: "BTC", dex: "", maxLeverage: 40, szDecimals: 5 };
const GOLD = { asset: 110000, coin: "xyz:GOLD", name: "GOLD", dex: "xyz", maxLeverage: 20, szDecimals: 4 };

/* Сеть Solana — подменой fetch: статусы подписей и высота блока. */
const статусы = new Map();
let высота = 100;
globalThis.fetch = async (url, опц) => {
  if (String(url) !== "http://rpc.test") throw new Error("неожиданный адрес " + url);
  const т = JSON.parse(опц.body);
  let result = null;
  if (т.method === "getSignatureStatuses") result = { value: т.params[0].map((п) => статусы.get(п) || null) };
  if (т.method === "getBlockHeight") result = высота;
  return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) };
};
let отправлено = [];
let отказатьВОтправке = null;
const журналКошелька = [];
const фальшБаза = {
  from: () => {
    const запрос = { условия: {} };
    const цепь = {
      delete: () => цепь, select: () => цепь,
      insert: async (строка) => { журналКошелька.push(строка); return { error: null }; },
      eq: (к, v) => { запрос.условия[к] = v; return цепь; },
      maybeSingle: async () => ({ data: null }),
      then: (ok) => ok({ data: null, error: null }),
    };
    return цепь;
  },
};
перевод.подменитьДляПроверки({
  кошелёк: {
    отправитьНаБиржу: async ({ user_id, сумма, куда, ключЗапроса, вид }) => {
      if (отказатьВОтправке) throw Object.assign(new Error(отказатьВОтправке), { код: 400 });
      const подпись = `sig-in-${отправлено.length + 1}`;
      отправлено.push({ user_id, сумма, куда, ключЗапроса, вид, подпись });
      return { signature: подпись };
    },
    кошелёкДляБота: async () => ({ address: "Card1111111111111111111111111111111111111111", sol: 5 }),
  },
  казна: {
    админ: () => фальшБаза,
    ключи: () => ({ набор: new Map() }),
    казна: async () => ({ address: "Treasury11111111111111111111111111111111111" }),
  },
  выплатить: async ({ лампорты, запомнить }) => {
    const подпись = `sig-out-${лампорты}`;
    запомнить(подпись, высота + 150);
    if (выплатаВедёт === "ok") { статусы.set(подпись, { confirmationStatus: "confirmed" }); return { подпись, казна: "Treasury11111111111111111111111111111111111" }; }
    if (выплатаВедёт === "fail") throw Object.assign(new Error("payout_failed"), { код: 502, подпись });
    throw Object.assign(new Error("payout_unknown"), { код: 502, неизвестно: true, подпись });
  },
});
let выплатаВедёт = "ok";

await проверка("пополнение зачисляется только после подтверждения сетью", async () => {
  статусы.clear();
  // Подтверждение придёт через секунду — до него денег на счёте нет.
  setTimeout(() => статусы.set("sig-in-1", { confirmationStatus: "confirmed" }), 900);
  const ждём = перевод.наТорговый({ uid: ЧЕЛ, sol: 1, ключ: "k-in-1", цена: 150.129 });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(счёт.счётДляЭкрана(ЧЕЛ).cash, 0);
  const итог = await ждём;
  assert.equal(итог.ok, true);
  // Курс вниз до цента: 1 SOL × $150.12.
  близко(итог.usd, 150.12);
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, 150.12);
  assert.equal(отправлено[0].вид, "trading_in");
  assert.equal(отправлено[0].куда, "Treasury11111111111111111111111111111111111");
});

await проверка("повтор пополнения с тем же ключом не зачисляет второй раз", async () => {
  const итог = await перевод.наТорговый({ uid: ЧЕЛ, sol: 1, ключ: "k-in-1", цена: 150 });
  близко(итог.usd, 150.12);
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, 150.12);
  assert.equal(отправлено.length, 1);
});

await проверка("неудачная отправка пополнения не оставляет ожидания", async () => {
  отказатьВОтправке = "not_enough";
  await assert.rejects(перевод.наТорговый({ uid: ЧЕЛ, sol: 100, ключ: "k-in-2", цена: 150 }), /not_enough/);
  отказатьВОтправке = null;
  assert.equal(счёт.счётДляЭкрана(ЧЕЛ).transfers.length, 0);
});

await проверка("открытие лонга: залог и комиссия списаны, ликвидация по формуле", async () => {
  const до = счёт.счётДляЭкрана(ЧЕЛ).cash;
  const о = счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 80000, isBuy: true, usd: 50, плечо: 10, ключ: "o-1" });
  assert.equal(о.ok, true);
  const п = о.position;
  // 50 × 10 / (80000 × 1.0001) = 0.0062493… → вниз до 5 знаков = 0.00624
  близко(п.size, 0.00624);
  const вход = 80000 * 1.0001;
  близко(п.entry, вход, 1e-6);
  const объём = 0.00624 * вход;
  const залог = Math.ceil((объём / 10) * 1e6) / 1e6;
  const комиссия = Math.ceil(объём * 0.00045 * 1e6) / 1e6;
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, до - залог - комиссия, 1e-6);
  const mmr = 1 / 80;
  близко(п.liquidation, (вход - залог / 0.00624) / (1 - mmr), 1e-6);
  assert.ok(п.liquidation < 80000 && п.liquidation > 72000);
});

await проверка("повтор открытия с тем же ключом — тот же ответ, без второй сделки", async () => {
  const было = счёт.счётДляЭкрана(ЧЕЛ);
  const о = счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 81000, isBuy: true, usd: 50, плечо: 10, ключ: "o-1" });
  близко(о.position.entry, 80000 * 1.0001);
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, было.cash);
  assert.equal(счёт.журнал(ЧЕЛ).filter((з) => з.kind === "open").length, 1);
});

await проверка("встречная сторона при открытой позиции отклоняется", async () => {
  assert.throws(() => счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 80000, isBuy: false, usd: 20, плечо: 2 }), /opposite_position/);
});

await проверка("тейк ниже цены у лонга и стоп за ликвидацией не принимаются", async () => {
  assert.throws(() => счёт.тейкСтоп(ЧЕЛ, { coin: "BTC", цена: 80000, tp: 79000 }), /tp_side/);
  assert.throws(() => счёт.тейкСтоп(ЧЕЛ, { coin: "BTC", цена: 80000, sl: 70000 }), /sl_beyond_liq/);
  assert.throws(() => счёт.тейкСтоп(ЧЕЛ, { coin: "BTC", цена: 80000, sl: 81000 }), /sl_side/);
  const т = счёт.тейкСтоп(ЧЕЛ, { coin: "BTC", цена: 80000, tp: 84000, sl: 78000 });
  assert.equal(т.position.tp, 84000);
  assert.equal(т.position.sl, 78000);
});

await проверка("тейк срабатывает по цене и приносит прибыль минус комиссия", async () => {
  const до = счёт.счётДляЭкрана(ЧЕЛ).cash;
  assert.equal(счёт.проверитьЦены(new Map([["BTC", 83999]])).length, 0);
  const с = счёт.проверитьЦены(new Map([["BTC", 84010]]));
  assert.equal(с.length, 1);
  assert.equal(с[0].reason, "tp");
  const вход = 80000 * 1.0001, выход = 84010 * (1 - 0.0001);
  const pnl = Math.floor(0.00624 * (выход - вход) * 1e6) / 1e6;
  const комиссия = Math.ceil(0.00624 * выход * 0.00045 * 1e6) / 1e6;
  const залог = Math.ceil(((0.00624 * вход) / 10) * 1e6) / 1e6;
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, до + залог + pnl - комиссия, 2e-6);
  assert.equal(счёт.счётДляЭкрана(ЧЕЛ).positions.length, 0);
  assert.equal(счёт.журнал(ЧЕЛ)[0].kind, "tp");
});

await проверка("стоп шорта срабатывает раньше ликвидации при скачке цены", async () => {
  // При предельном плече ликвидация в 2–3% от входа — стоп 4100 оказался бы за ней.
  assert.throws(() => счёт.открыть(ЧЕЛ, { рынок: GOLD, цена: 4000, isBuy: false, usd: 20, плечо: 20, sl: 4100 }), /sl_beyond_liq/);
  const о = счёт.открыть(ЧЕЛ, { рынок: GOLD, цена: 4000, isBuy: false, usd: 20, плечо: 10, sl: 4100 });
  assert.ok(о.position.liquidation > 4100, "ликвидация шорта выше стопа");
  // Цена перепрыгнула и стоп, и ликвидацию — закрываем стопом, остаток (если есть) — человеку.
  const с = счёт.проверитьЦены(new Map([["xyz:GOLD", 4400]]));
  assert.equal(с[0].reason, "sl");
  assert.ok(с[0].payout >= 0);
  assert.ok(счёт.счётДляЭкрана(ЧЕЛ).cash >= 0);
});

await проверка("ликвидация забирает залог, но счёт не уходит в минус", async () => {
  const до = счёт.счётДляЭкрана(ЧЕЛ).cash;
  const страховкаДо = счёт.дляПроверки.касса().страховка;
  const о = счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 80000, isBuy: true, usd: 10, плечо: 40 });
  const после = счёт.счётДляЭкрана(ЧЕЛ).cash;
  const liq = о.position.liquidation;
  const { size, entry, margin } = о.position;
  assert.equal(счёт.проверитьЦены(new Map([["BTC", liq + 1]])).length, 0);
  const с = счёт.проверитьЦены(new Map([["BTC", liq - 500]]));
  assert.equal(с[0].reason, "liq");
  assert.equal(с[0].payout, 0);
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, после);
  assert.ok(до - после > 9.9);
  // Остаток залога — в страховой запас.
  const остаток = margin + Math.floor(size * (liq - 500 - entry) * 1e6) / 1e6;
  близко((счёт.дляПроверки.касса().страховка - страховкаДо) / 1e6, остаток, 2e-6);
  assert.ok(остаток > 0, "ликвидация до точки банкротства");
});

await проверка("не хватает денег — позиция не открывается и счёт не меняется", async () => {
  const до = счёт.счётДляЭкрана(ЧЕЛ).cash;
  assert.throws(() => счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 80000, isBuy: true, usd: до + 1, плечо: 1 }), /not_enough/);
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, до);
  assert.throws(() => счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 80000, isBuy: true, usd: 5, плечо: 1 }), /min_10_usd/);
  assert.throws(() => счёт.открыть(ДРУГОЙ, { рынок: BTC, цена: 80000, isBuy: true, usd: 20, плечо: 1 }), /not_enough/);
});

await проверка("одновременные сделки на весь остаток: проходит одна", async () => {
  const есть = счёт.счётДляЭкрана(ЧЕЛ).cash;
  const половина = Math.floor((есть * 0.6) * 100) / 100;
  const итоги = await Promise.allSettled([
    Promise.resolve().then(() => счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 80000, isBuy: true, usd: половина, плечо: 2 })),
    Promise.resolve().then(() => счёт.открыть(ЧЕЛ, { рынок: GOLD, цена: 4000, isBuy: true, usd: половина, плечо: 2 })),
  ]);
  assert.equal(итоги.filter((и) => и.status === "fulfilled").length, 1);
  assert.ok(счёт.счётДляЭкрана(ЧЕЛ).cash >= 0);
});

await проверка("ручное закрытие возвращает залог с итогом", async () => {
  const п = счёт.счётДляЭкрана(ЧЕЛ, () => 80000).positions[0];
  const до = счёт.счётДляЭкрана(ЧЕЛ).cash;
  const з = счёт.закрыть(ЧЕЛ, { coin: п.coin, цена: п.coin === "BTC" ? 80000 : 4000, ключ: "c-1" });
  assert.equal(з.reason, "close");
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, до + з.payout);
  // Повтор закрытия по ключу — тот же ответ, не ошибка «позиции нет».
  const ещё = счёт.закрыть(ЧЕЛ, { coin: п.coin, цена: 1, ключ: "c-1" });
  assert.equal(ещё.payout, з.payout);
  assert.throws(() => счёт.закрыть(ЧЕЛ, { coin: п.coin, цена: 80000 }), /no_position/);
});

await проверка("вывод: доллары списаны до выплаты, после — запись в журнал кошелька", async () => {
  const до = счёт.счётДляЭкрана(ЧЕЛ).cash;
  выплатаВедёт = "ok";
  const итог = await перевод.сТоргового({ uid: ЧЕЛ, usd: 20, ключ: "w-1", цена: 150 });
  assert.equal(итог.ok, true);
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, до - 20);
  // SOL на выход — по курсу вверх до цента: 20 / 150 = 0.1333… SOL
  близко(итог.sol, Math.floor((20 / 150) * 1e9) / 1e9, 1e-9);
  assert.equal(журналКошелька.at(-1).kind, "trading_out");
  assert.equal(журналКошелька.at(-1).request_key, "ta:out:w-1");
});

await проверка("вывод больше остатка и двойной вывод того же остатка отклоняются", async () => {
  const есть = счёт.счётДляЭкрана(ЧЕЛ).cash;
  await assert.rejects(перевод.сТоргового({ uid: ЧЕЛ, usd: есть + 1, ключ: "w-2", цена: 150 }), /not_enough/);
  выплатаВедёт = "unknown";
  const первый = await перевод.сТоргового({ uid: ЧЕЛ, usd: есть, ключ: "w-3", цена: 150 });
  assert.equal(первый.pending, true);
  await assert.rejects(перевод.сТоргового({ uid: ЧЕЛ, usd: 1, ключ: "w-4", цена: 150 }), /not_enough/);
  // Вывод — целыми центами, доли цента остаются на счёте.
  assert.ok(счёт.счётДляЭкрана(ЧЕЛ).cash < 0.01);
});

await проверка("сверка: выплата не дошла и срок блока вышел — доллары возвращаются", async () => {
  высота = 10_000;
  await перевод.довестиПереводы();
  assert.equal(счёт.счётДляЭкрана(ЧЕЛ).transfers.length, 0);
  assert.ok(счёт.счётДляЭкрана(ЧЕЛ).cash > 0);
});

await проверка("сверка: неясная выплата, потом подтверждена — вывод завершён без возврата", async () => {
  высота = 100;
  выплатаВедёт = "unknown";
  const есть = счёт.счётДляЭкрана(ЧЕЛ).cash;
  const итог = await перевод.сТоргового({ uid: ЧЕЛ, usd: 5, ключ: "w-5", цена: 150 });
  assert.equal(итог.pending, true);
  статусы.set(итог.signature, { confirmationStatus: "finalized" });
  await перевод.довестиПереводы();
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, есть - 5);
  assert.equal(счёт.журнал(ЧЕЛ)[0].kind, "out");
});

await проверка("выплата отклонена — доллары сразу на счёте", async () => {
  выплатаВедёт = "fail";
  const есть = счёт.счётДляЭкрана(ЧЕЛ).cash;
  await assert.rejects(перевод.сТоргового({ uid: ЧЕЛ, usd: 2, ключ: "w-6", цена: 150 }), /payout_failed/);
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, есть);
});

await проверка("после перезапуска счёт читается с диска тем же", async () => {
  счёт.открыть(ЧЕЛ, { рынок: GOLD, цена: 4000, isBuy: true, usd: 3, плечо: 5, tp: 4500 });
  const было = счёт.счётДляЭкрана(ЧЕЛ, () => 4000);
  счёт.дляПроверки.сбросить();
  const стало = счёт.счётДляЭкрана(ЧЕЛ, () => 4000);
  assert.deepEqual(стало, было);
  // Сторож после перезапуска знает позицию.
  assert.ok(счёт.монетыСПозициями().has("xyz:GOLD"));
  const с = счёт.проверитьЦены(new Map([["xyz:GOLD", 4600]]));
  assert.equal(с[0].reason, "tp");
});

await проверка("испорченный файл счёта не заменяется пустым", async () => {
  const файл = path.join(счёт.дляПроверки.КАТАЛОГ, `${ДРУГОЙ}.json`);
  fs.writeFileSync(файл, "{битый");
  счёт.дляПроверки.сбросить();
  assert.throws(() => счёт.открыть(ДРУГОЙ, { рынок: BTC, цена: 80000, isBuy: true, usd: 20, плечо: 1 }), /account_unavailable/);
  assert.equal(fs.readFileSync(файл, "utf8"), "{битый");
});

await проверка("запись не удалась — изменение не применилось", async () => {
  const до = счёт.счётДляЭкрана(ЧЕЛ).cash;
  // Диск отказал на переименовании — так же, как при полном разделе.
  const настоящее = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }); };
  try {
    assert.throws(() => счёт.открыть(ЧЕЛ, { рынок: BTC, цена: 80000, isBuy: true, usd: 5, плечо: 5 }), /storage/);
  } finally {
    fs.renameSync = настоящее;
  }
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, до);
  assert.equal(счёт.счётДляЭкрана(ЧЕЛ).positions.length, 0);
  // И после перезапуска на диске — прежний счёт.
  счёт.дляПроверки.сбросить();
  близко(счёт.счётДляЭкрана(ЧЕЛ).cash, до);
});

console.log(`\nпрошло ${прошло}`);
