/* Исполнитель лимитных заявок.
 *
 * Раз в секунду сверяет открытые заявки с живой ценой кривой (память
 * сервера, api/_live.js: её пишут поток Solana и наблюдатели TON и EVM)
 * и, когда цена дошла до заданной, проводит сделку от имени человека —
 * через тот же обработчик кошелька, что и нажатие в приложении
 * (api/_внутри.js), со всеми его проверками остатка и запретов.
 *
 * Заявку сначала забираем в работу условным обновлением «open →
 * executing»: два круга подряд или два сервера не исполнят её дважды.
 */
import { createClient } from "@supabase/supabase-js";
import { прочитатьЖивое } from "./_live.js";
import { ВНУТРЕННИЙ_ВХОД, ответВнутри } from "./_внутри.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ШАГ_МС = 1000;
// Список заявок перечитываем реже, чем сверяем цену: цена в памяти, а
// база — сетевой круг.
const ПЕРЕЧИТАТЬ_МС = 8000;

let db = null;
let заявки = [];
let прочитано = 0;
let идёт = false;

async function перечитать() {
  const { data, error } = await db.from("limit_orders")
    .select("id, user_id, token_id, chain, side, amount, price, direction, tokens(id, address, curve_address, chain, ticker)")
    .eq("status", "open")
    .limit(2000);
  if (!error) { заявки = data || []; прочитано = Date.now(); }
}

function ключЖивого(т) {
  const сеть = т.chain || "ton";
  if (сеть === "solana") return т.address;
  if (сеть === "ton") return т.curve_address;
  return `${сеть}:${String(т.address || "").toLowerCase()}`;
}

async function провести(з) {
  const т = з.tokens || {};
  const сеть = т.chain || з.chain || "ton";
  const пользователь = { id: з.user_id };
  const ключ = `limit-${з.id}`;
  let путь, тело;
  if (сеть === "solana") {
    путь = "wallet-solana"; тело = { action: "trade", mint: т.address, sell: з.side === "sell", amount: Number(з.amount), minOut: 0, speed: "turbo", requestKey: ключ };
  } else if (сеть === "ton") {
    путь = "wallet-ton"; тело = { action: з.side, tokenId: т.id, amount: Number(з.amount), speed: "turbo", requestKey: ключ };
  } else {
    путь = "wallet-evm"; тело = { action: з.side, chain: сеть, token: т.address, amount: Number(з.amount), speed: "turbo", requestKey: ключ };
  }
  const { default: обработчик } = await import(`./${путь}.js`);
  const ответ = ответВнутри();
  const { action, ...остальное } = тело;
  await обработчик({
    method: "POST", url: `/api/${путь}?action=${action}`, query: { action }, body: остальное,
    headers: { "x-forwarded-for": "limit-order" }, [ВНУТРЕННИЙ_ВХОД]: пользователь,
  }, ответ);
  return ответ;
}

async function круг() {
  if (идёт) return;
  идёт = true;
  try {
    if (Date.now() - прочитано > ПЕРЕЧИТАТЬ_МС) await перечитать();
    for (const з of заявки) {
      const т = з.tokens;
      if (!т) continue;
      const живое = прочитатьЖивое(ключЖивого(т));
      const цена = живое && живое.событие && Number(живое.событие.price);
      if (!(цена > 0)) continue;
      const дошла = з.direction === "below" ? цена <= Number(з.price) : цена >= Number(з.price);
      if (!дошла) continue;
      // Забираем в работу: если строка уже не open — её взял другой круг.
      const { data: взята } = await db.from("limit_orders").update({ status: "executing" })
        .eq("id", з.id).eq("status", "open").select("id");
      заявки = заявки.filter((x) => x.id !== з.id);
      if (!взята || !взята.length) continue;
      let итог;
      try { итог = await провести(з); } catch (e) { итог = { код: 500, тело: { error: String((e && e.message) || e) } }; }
      const ок = итог.код < 300 && итог.тело && !итог.тело.error;
      const подпись = ок ? (итог.тело.signature || итог.тело.tx || null) : null;
      await db.from("limit_orders").update(ок
        ? { status: "filled", filled_at: new Date().toISOString(), tx: подпись }
        : { status: "failed", error: String((итог.тело && (итог.тело.error || итог.тело.detail)) || итог.код).slice(0, 200) })
        .eq("id", з.id);
      // Сделка из заявки попадает в историю так же, как своя.
      if (ок) {
        const монет = з.side === "buy" ? Number(з.amount) : Number(итог.тело.solOut || 0);
        const токенов = з.side === "sell" ? Number(з.amount) : Number(итог.тело.tokens || итог.тело.bought || 0);
        await db.from("trades").insert({
          user_id: з.user_id, token_id: т.id, token_address: т.address, ticker: т.ticker,
          side: з.side, ton_amount: монет, token_amount: токенов, ton_price_usd: 0,
        }).then(() => {}, () => {});
      }
    }
  } catch (e) {
    console.warn("[лимиты]", e && e.message);
  } finally {
    идёт = false;
  }
}

export function исполнятьЛимиты() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return false;
  db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  setInterval(() => { круг(); }, ШАГ_МС);
  return true;
}
