/* Выход токена TON на STON.fi — сам, как у Solana и EVM.
 *
 * Кривая на пороге закрывается, но собранное сама не отдаёт: нужно
 * сообщение Graduate, отправить его может кто угодно. Его шлёт кошелёк
 * ликвидности (TON_LIQUIDITY_MNEMONIC), он же и получатель: у кривых,
 * запущенных после его заведения, graduationDestination — он.
 *
 * Дальше два шага, по одному за круг:
 *   1. закрытая кривая с деньгами — шлём Graduate; TON и остаток выпуска
 *      приходят на кошелёк ликвидности;
 *   2. на кошельке лежат жетоны токена — вкладываем их и TON в пул STON.fi
 *      (provide_lp с обеих сторон, пул заводится сам), LP-токены сразу
 *      выпускаются на нулевой адрес: вынуть ликвидность не может никто.
 * Адрес пула пишется в tokens.dex_pool_address — по нему приложение
 * переводит сделки на биржу (api/wallet-ton.js).
 *
 * TON в пул — ровно по последней цене кривой: остаток жетонов × цена
 * конца кривой, а не весь баланс кошелька, на котором лежат и деньги
 * других токенов, и запас на газ.
 */
import { createClient } from "@supabase/supabase-js";
import { Address, internal, SendMode, toNano } from "@ton/ton";
import { состояние } from "./refresh-curves.js";
import { клиент, кошелёкЛиквидности, кошелёкВладельца, сообщенияЛиквидности, адресПула, резервыПула, телоВыхода } from "./_stonfi.js";
import { криваяНастоящая, отказатьсяОтВыпуска } from "./wallet-ton.js";

// На кошельке всегда остаётся запас на газ следующих выходов.
const ЗАПАС_ГАЗА = toNano("1");
const ГАЗ_ВЫХОДА = toNano("0.3");
const вРаботе = new Set();

async function балансЖетона(c, jetton, владелец) {
  try {
    const кош = await кошелёкВладельца(c, jetton, владелец);
    const r = await c.runMethod(кош, "get_wallet_data");
    return r.stack.readBigNumber();
  } catch {
    // Кошелька жетона ещё нет — значит и жетонов нет.
    return 0n;
  }
}

async function отправить(c, ликв, сообщения) {
  const кошелёк = c.open(ликв.контракт);
  const seqno = await кошелёк.getSeqno();
  await кошелёк.sendTransfer({
    seqno, secretKey: ликв.пара.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: сообщения,
  });
  // Следующая отправка с того же кошелька до роста seqno была бы отбита.
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    try { if ((await кошелёк.getSeqno()) > seqno) return true; } catch { /* узел моргнул */ }
  }
  return false;
}

export async function вывестиTonНаБиржу() {
  const ликв = await кошелёкЛиквидности().catch(() => null);
  if (!ликв || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: токены, error } = await db
    .from("tokens")
    .select("id, address, curve_address, ticker, chain, owner_id, creator_wallet")
    .or("chain.is.null,chain.eq.ton")
    .not("curve_address", "is", null)
    .is("dex_pool_address", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !токены) return 0;
  const c = клиент();
  const мой = ликв.адрес;
  let баланс = await c.getBalance(мой).catch(() => 0n);
  let сделано = 0;
  for (const tok of токены) {
    if (вРаботе.has(tok.id) || !tok.address) continue;
    вРаботе.add(tok.id);
    try {
      const st = await состояние(tok.curve_address);
      if (!st || !st.graduated) continue;
      /* Адрес кривой и жетон в строке токена пишет браузер создателя. Без
         проверки поддельная «кривая» (свой контракт, отвечающий «закрыта,
         деньги есть») тянула бы газ Graduate каждые полминуты, а свой
         жетон с придуманной ценой конца кривой — весь TON кошелька
         ликвидности в пул, который подделавший тут же и выкупит. */
      if (!(await криваяНастоящая(db, tok, { продажа: true }))) continue;
      const жетонов = await балансЖетона(c, tok.address, мой);
      if (жетонов > 0n) {
        // Шаг 2: ликвидность пришла — в пул по цене конца кривой.
        /* Пул на эту пару уже кто-то завёл — с какой угодно ценой. Вклад
           в него по нашей цене ушёл бы в разницу курсов: лишнее с одной
           стороны остаётся в пуле, и его забирает хозяин первых LP. Такой
           выход — только руками. */
        const чужой = await резервыПула(tok.address).catch(() => null);
        if (чужой && (чужой.ton > 0n || чужой.жетон > 0n)) {
          console.warn("[выход TON]", tok.ticker, "пул STON.fi на эту пару уже есть", чужой.пул.toString(), "— выход отложен");
          continue;
        }
        const x = st.virtualTon + st.graduationTon;
        const y = (st.virtualTon * st.virtualTokens) / x;
        let тонов = (жетонов * x) / y;
        // Не больше, чем отдала кривая: жетоны на кошелёк ликвидности
        // может прислать кто угодно, а платить за них нашим TON незачем.
        if (тонов > st.graduationTon) тонов = st.graduationTon;
        const свободно = баланс - ЗАПАС_ГАЗА;
        if (тонов > свободно) тонов = свободно;
        if (тонов <= 0n) { console.warn("[выход TON]", tok.ticker, "на кошельке ликвидности мало TON"); continue; }
        const [ж, т] = await сообщенияЛиквидности({ jetton: tok.address, жетонов, тонов, кошелёк: мой.toString() });
        const ушло = await отправить(c, ликв, [
          internal({ to: ж.to, value: ж.value, body: ж.body, bounce: true }),
          internal({ to: т.to, value: т.value, body: т.body, bounce: true }),
        ]);
        if (!ушло) continue;
        const пул = await адресПула(tok.address);
        await db.from("tokens").update({ dex_pool_address: пул.toString(), listed_at: new Date().toISOString() }).eq("id", tok.id);
        console.log("[выход TON]", tok.ticker, "пул STON.fi", пул.toString());
        баланс = await c.getBalance(мой).catch(() => баланс);
        сделано += 1;
      } else if (st.realTon > 0n) {
        // Шаг 1: кривая закрыта, деньги ещё на ней — просим отдать.
        // Получатель зашит в кривую: если это не мы, ликвидность уйдёт
        // туда, куда её назначили при запуске, и вреда в этом нет.
        if (баланс < ГАЗ_ВЫХОДА + toNano("0.1")) { console.warn("[выход TON] нет газа на Graduate"); continue; }
        await отправить(c, ликв, [internal({ to: Address.parse(tok.curve_address), value: ГАЗ_ВЫХОДА, body: телоВыхода(), bounce: true })]);
        баланс = await c.getBalance(мой).catch(() => баланс);
      }
    } catch (e) {
      console.warn("[выход TON]", tok.ticker, e && e.message);
    } finally {
      вРаботе.delete(tok.id);
    }
  }
  return сделано;
}

/* Отказ от выпуска у старых токенов — по нескольку за круг.
   Проверка стоит двух запросов к tonapi, поэтому каждый токен
   спрашиваем не чаще раза в десять минут, а отказавшийся — больше
   никогда (до перезапуска). */
const следующаяПроверка = new Map(); // id -> когда
export async function отказыСтарыхТокенов() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: токены } = await db
    .from("tokens")
    .select("id, address, curve_address, owner_id, creator_wallet, chain")
    .or("chain.is.null,chain.eq.ton")
    .not("curve_address", "is", null)
    .not("owner_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  let проверено = 0;
  let отправлено = 0;
  const сейчас = Date.now();
  for (const tok of токены || []) {
    if (проверено >= 4) break;
    if ((следующаяПроверка.get(tok.id) || 0) > сейчас) continue;
    проверено += 1;
    следующаяПроверка.set(tok.id, сейчас + 10 * 60 * 1000);
    try {
      if (await криваяНастоящая(db, tok)) { следующаяПроверка.set(tok.id, Infinity); continue; }
      if (await отказатьсяОтВыпуска(db, tok)) отправлено += 1;
    } catch (e) {
      console.warn("[отказ от выпуска]", tok.id, e && e.message);
    }
  }
  if (следующаяПроверка.size > 20000) следующаяПроверка.clear();
  return отправлено;
}

/* Цены пулов площадки — для продолжения графика (api/dex-history.js).
   Все сети одним кругом: токены, у которых записан пул биржи, и токены
   EVM, у которых фабрика сама завела пару. */
export async function записатьЦеныПулов() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const [{ data: вышедшие }, { data: evm }] = await Promise.all([
    db.from("tokens").select("address, chain, dex_pool_address").not("dex_pool_address", "is", null).order("created_at", { ascending: false }).limit(80),
    db.from("tokens").select("address, chain").in("chain", ["bsc", "base", "eth"]).order("created_at", { ascending: false }).limit(80),
  ]);
  const { default: пул } = await import("./dex-pool.js");
  const { записатьЦенуПула, сохранитьИсторию } = await import("./dex-history.js");
  const спросить = (query) => new Promise((готово) => пул({ query }, { setHeader() {}, status() { return { json: готово }; } }));
  for (const т of [...(вышедшие || []), ...(evm || [])]) {
    if (!т.address) continue;
    const сеть = т.chain === "solana" ? "solana" : ["bsc", "base", "eth"].includes(т.chain) ? т.chain : "ton";
    const р = await спросить({ chain: сеть, token: т.address, pool: т.dex_pool_address || "" }).catch(() => null);
    if (р && р.ready) записатьЦенуПула(т.address, р.price);
  }
  сохранитьИсторию();
}
