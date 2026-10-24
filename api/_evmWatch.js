/* Сети EVM — наблюдатель за блоками: цены кривых и переводы кошельков.
 *
 * Цена. Мемпад BNB, Base и Ethereum спрашивал кривую каждого токена у
 * узла сам — по запросу на токен каждые 0,3 секунды с каждого телефона.
 * Узел такое не выдерживает и отвечает отказами, а лента площадки цен EVM
 * не получала вовсе. Здесь сервер читает события своей фабрики (Trade,
 * Graduated) с каждым новым блоком: в событии сделки уже лежат собранное
 * и проданное после неё, и цена считается без единого лишнего вызова.
 * Итог — в живую память (api/_live.js) под ключом «сеть:адрес токена».
 *
 * Переводы. В TON и Solana история кошелька дочитывает пополнения из
 * сети по адресу, а у сетей EVM списка переводов по адресу у узла нет.
 * Поэтому каждый новый блок просматривается целиком: перевод монеты на
 * кошелёк площадки — пополнение, с него на сторонний адрес мимо
 * приложения — вывод. Оба ложатся в журнал wallet_ops, и история
 * показывает их наравне с остальным.
 *
 * Переменные окружения: EVM_CURVE_*, EVM_RPC_* (см. api/wallet-evm.js),
 * EVM_WATCH=0 — выключить.
 */

import { createClient } from "@supabase/supabase-js";
import { записатьЖивое, прочитатьЖивое } from "./_live.js";

const ВИРТ_ТОКЕНОВ = 1_073_000_000n * 10n ** 18n;
const ПРОДАЁТСЯ = 800_000_000n * 10n ** 18n;
// Как часто спрашиваем узел о новом блоке: чуть чаще, чем блок выходит.
const ШАГ_МС = { bsc: 800, base: 1000, eth: 3000 };
// Сколько блоков догоняем за раз после паузы; дальше прыгаем вперёд —
// иначе после долгого простоя круг тонул бы в старых блоках.
const ДОГОНЯТЬ = 120;
const ПАЧКА = 10;

const состояние = new Map(); // сеть -> { блок, вирт, ошибок, жива }
const свои = new Map(); // адрес (строчными) -> user_id
const своиПереводы = new Set(); // хеши, отправленные самим приложением
let запущен = false;
let db = null;

// Для проверки без настоящей базы (как заменитьБазуДляПроверки в api/wallet-evm.js).
export function заменитьБазуНаблюдателяEVM(база) { db = база; }

export function наблюдательEVMЖив() {
  return [...состояние.values()].some((с) => с.жива);
}

/* Перевод, который приложение отправляет само (вывод, перевод другу):
   его запишет сам обработчик, и наблюдатель не должен класть второй. */
export function свойПереводEVM(хеш) {
  if (!хеш) return;
  своиПереводы.add(String(хеш).toLowerCase());
  if (своиПереводы.size > 5000) своиПереводы.clear();
}

let эфир = null;
async function ethers() {
  if (!эфир) эфир = await import("ethers");
  return эфир;
}

async function вызов(rpc, пачка) {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(пачка),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  return res.json();
}
async function один(rpc, method, params) {
  const j = await вызов(rpc, { jsonrpc: "2.0", id: 1, method, params });
  if (j && j.error) throw new Error(j.error.message || "rpc");
  return j && j.result;
}

const слово = (данные, i) => BigInt(`0x${данные.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"}`);
/* Порядок события в сети: блок и номер события в нём. По нему живая
   память не даёт более раннему состоянию лечь поверх позднего
   (api/_live.js). Засев читает кривую на блоке, до которого события
   уже разобраны, — его итог стоит в конце того блока. */
const ВНУТРИ_БЛОКА = 100_000;
const порядокСобытия = (л) => Number(BigInt(л.blockNumber || "0x0")) * ВНУТРИ_БЛОКА + Number(BigInt(л.logIndex || "0x0"));
const адресИзТемы = (тема) => `0x${String(тема).slice(-40)}`.toLowerCase();

function цена(вирт, собрано, продано) {
  const y = ВИРТ_ТОКЕНОВ - продано;
  if (y <= 0n) return 0;
  return Number(((вирт + собрано) * 10n ** 18n) / y) / 1e18;
}

async function события(сеть, с, з, от, до) {
  const { id } = await ethers();
  const темы = [id("Trade(address,address,bool,uint256,uint256,uint256,uint256)"), id("Graduated(address,address,uint256,uint256)")];
  const логи = await один(с.rpc, "eth_getLogs", [{
    address: с.фабрика, fromBlock: `0x${от.toString(16)}`, toBlock: `0x${до.toString(16)}`, topics: [темы],
  }]);
  const цель = Number((з.вирт * ВИРТ_ТОКЕНОВ) / (ВИРТ_ТОКЕНОВ - ПРОДАЁТСЯ) - з.вирт) / 1e18;
  for (const л of логи || []) {
    const токен = адресИзТемы(л.topics[1]);
    const ключ = `${сеть}:${токен}`;
    if (л.topics[0] === темы[0]) {
      // Trade: isBuy, nativeAmount, tokenAmount, realNative, sold — после сделки.
      const собрано = слово(л.data, 3);
      const продано = слово(л.data, 4);
      записатьЖивое(ключ, {
        price: цена(з.вирт, собрано, продано),
        raised: Number(собрано) / 1e18, sold: Number(продано) / 1e18,
        graduation: цель, graduated: false,
      }, { порядок: порядокСобытия(л) });
    } else {
      // Выход на биржу: цена дальше живёт в пуле, кривая — закрыта.
      const было = прочитатьЖивое(ключ);
      const п = было && было.событие;
      if (п) записатьЖивое(ключ, { price: п.price, raised: п.raised, sold: п.sold, graduation: цель, graduated: true }, { порядок: порядокСобытия(л) });
    }
  }
}

/* Переводы монеты в блоках. Пополнение пишем сразу; вывод — через
   полторы минуты и только если его не записало само приложение:
   сделки и выводы через приложение журнал получает от обработчика. */
async function переводы(сеть, с, блоки) {
  if (!db || !свои.size) return;
  const мимо = new Set([с.фабрика, с.роутер].filter(Boolean).map((а) => а.toLowerCase()));
  for (const б of блоки) {
    for (const tx of (б && б.transactions) || []) {
      const value = BigInt(tx.value || "0x0");
      if (value <= 0n) continue;
      const кому = String(tx.to || "").toLowerCase();
      const откуда = String(tx.from || "").toLowerCase();
      const хеш = String(tx.hash || "").toLowerCase();
      const сумма = Number(value) / 1e18;
      const получатель = свои.get(кому);
      if (получатель && !своиПереводы.has(хеш)) {
        await db.from("wallet_ops").insert({
          user_id: получатель, chain: сеть, kind: "deposit", amount: сумма,
          address: tx.from, signature: tx.hash, request_key: `in:${хеш}`.slice(0, 64),
        }).then(() => {}, () => {});
      }
      const отправитель = свои.get(откуда);
      const простой = !tx.input || tx.input === "0x";
      if (отправитель && простой && !мимо.has(кому) && !своиПереводы.has(хеш)) {
        setTimeout(async () => {
          const { data } = await db.from("wallet_ops").select("id").eq("user_id", отправитель).eq("signature", tx.hash).limit(1);
          if (data && data.length) return;
          await db.from("wallet_ops").insert({
            user_id: отправитель, chain: сеть, kind: "withdraw", amount: сумма,
            address: tx.to, signature: tx.hash, request_key: `out:${хеш}`.slice(0, 64),
          }).then(() => {}, () => {});
        }, 90_000);
      }
    }
  }
}

async function шаг(сеть, с) {
  const з = состояние.get(сеть);
  try {
    if (с.фабрика && !з.вирт) {
      const { id } = await ethers();
      const ответ = await один(с.rpc, "eth_call", [{ to: с.фабрика, data: id("virtualNative()").slice(0, 10) }, "latest"]);
      з.вирт = BigInt(ответ || "0x0");
    }
    const последний = Number(BigInt(await один(с.rpc, "eth_blockNumber", [])));
    if (!з.блок) { з.блок = последний; з.жива = true; return; }
    if (последний <= з.блок) { з.жива = true; return; }
    let от = з.блок + 1;
    if (последний - от > ДОГОНЯТЬ) от = последний - ДОГОНЯТЬ;
    const до = Math.min(последний, от + ПАЧКА * 3 - 1);
    if (с.фабрика && з.вирт > 0n) await события(сеть, с, з, от, до);
    if (свои.size) {
      for (let н = от; н <= до; н += ПАЧКА) {
        const пачка = [];
        for (let к = н; к <= Math.min(до, н + ПАЧКА - 1); к += 1) {
          пачка.push({ jsonrpc: "2.0", id: к, method: "eth_getBlockByNumber", params: [`0x${к.toString(16)}`, true] });
        }
        const ответы = await вызов(с.rpc, пачка);
        await переводы(сеть, с, (Array.isArray(ответы) ? ответы : [ответы]).map((о) => о && о.result).filter(Boolean));
      }
    }
    з.блок = до;
    з.ошибок = 0;
    з.жива = true;
  } catch {
    з.ошибок = (з.ошибок || 0) + 1;
    if (з.ошибок > 3) з.жива = false;
  }
}

/* Начальные цены. События приходят только со сделками, и токен, по
   которому с запуска сервера не торговали, без этого стоял бы в ленте
   нулём. Кривые таких токенов читаются один раз пачкой вызовов
   curves(token) — дальше их ведут события. */
const засеяно = new Set();
async function засеять(СЕТИ, ТЕСТОВЫЕ) {
  if (!db) return;
  const { data } = await db.from("tokens").select("chain, address")
    .in("chain", Object.keys(СЕТИ)).eq("network", ТЕСТОВЫЕ ? "testnet" : "mainnet")
    .order("created_at", { ascending: false }).limit(1000);
  const { id } = await ethers();
  const выбор = id("curves(address)").slice(0, 10);
  const поСетям = new Map();
  for (const т of data || []) {
    const адрес = String(т.address || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(адрес) || засеяно.has(`${т.chain}:${адрес}`)) continue;
    // Кривую уже ведут события — засевать нечего.
    if (прочитатьЖивое(`${т.chain}:${адрес}`)) { засеяно.add(`${т.chain}:${адрес}`); continue; }
    if (!поСетям.has(т.chain)) поСетям.set(т.chain, []);
    поСетям.get(т.chain).push(адрес);
  }
  for (const [сеть, адреса] of поСетям) {
    const с = СЕТИ[сеть];
    const з = состояние.get(сеть);
    if (!с || !с.фабрика || !з || !(з.вирт > 0n) || !з.блок) continue;
    const цель = Number((з.вирт * ВИРТ_ТОКЕНОВ) / (ВИРТ_ТОКЕНОВ - ПРОДАЁТСЯ) - з.вирт) / 1e18;
    for (let i = 0; i < адреса.length; i += 20) {
      const кусок = адреса.slice(i, i + 20);
      // На том блоке, до которого события уже разобраны: сделки после него
      // придут событиями, и состояние не перескочит через них назад.
      const блок = з.блок;
      const ответы = await вызов(с.rpc, кусок.map((а, к) => ({
        jsonrpc: "2.0", id: к, method: "eth_call",
        params: [{ to: с.фабрика, data: `${выбор}${а.slice(2).padStart(64, "0")}` }, `0x${блок.toString(16)}`],
      }))).catch(() => null);
      for (const о of Array.isArray(ответы) ? ответы : []) {
        const а = кусок[о && о.id];
        const r = о && о.result;
        if (!а || !r || r.length < 2 + 64 * 4) continue;
        засеяно.add(`${сеть}:${а}`);
        // curves(token): creator, realNative, sold, graduated.
        if (слово(r, 0) === 0n) continue;
        const собрано = слово(r, 1);
        const продано = слово(r, 2);
        записатьЖивое(`${сеть}:${а}`, {
          price: цена(з.вирт, собрано, продано),
          raised: Number(собрано) / 1e18, sold: Number(продано) / 1e18,
          graduation: цель, graduated: слово(r, 3) !== 0n,
        }, { порядок: блок * ВНУТРИ_БЛОКА + (ВНУТРИ_БЛОКА - 1) });
      }
    }
  }
}

// Адреса кошельков площадки: у всех сетей EVM он один на человека.
async function освежитьАдреса() {
  if (!db) return;
  const новые = new Map();
  for (let с = 0; ; с += 1000) {
    const { data, error } = await db.from("app_wallets").select("user_id, address").eq("chain", "evm").range(с, с + 999);
    if (error) return;
    for (const р of data || []) if (р.address) новые.set(String(р.address).toLowerCase(), р.user_id);
    if (!data || data.length < 1000) break;
  }
  свои.clear();
  for (const [к, v] of новые) свои.set(к, v);
}

export async function наблюдатьЗаEVM() {
  if (запущен || process.env.EVM_WATCH === "0") return;
  запущен = true;
  const url = process.env.SUPABASE_URL;
  const ключ = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!db && url && ключ) db = createClient(url, ключ, { auth: { persistSession: false } });
  const { СЕТИ, ТЕСТОВЫЕ } = await import("./wallet-evm.js");
  освежитьАдреса().catch(() => {});
  setInterval(() => { освежитьАдреса().catch(() => {}); }, 60_000);
  // Засев — после первого шага сетей: ему нужен виртуальный запас фабрики.
  setTimeout(() => { засеять(СЕТИ, ТЕСТОВЫЕ).catch(() => {}); }, 5000);
  setInterval(() => { засеять(СЕТИ, ТЕСТОВЫЕ).catch(() => {}); }, 60_000);
  for (const [сеть, с] of Object.entries(СЕТИ)) {
    if (!с.rpc) continue;
    состояние.set(сеть, { блок: 0, вирт: 0n, ошибок: 0, жива: false });
    let идёт = false;
    setInterval(async () => {
      if (идёт) return;
      идёт = true;
      try { await шаг(сеть, с); } finally { идёт = false; }
    }, ШАГ_МС[сеть] || 2000);
  }
}
