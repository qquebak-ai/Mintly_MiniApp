/* Проверка основного бота без сети Telegram и без ключей площадки.
 *
 * Поднимает на localhost подделку базы — несколько таблиц в памяти и ровно
 * те запросы PostgREST, что делает бот, — подменяет fetch к Telegram (все
 * ответы бота копятся в списке) и кошелёк приложения
 * (подменитьКошелёкДляПроверки в api/_botTrade.js). Дальше прогоняет
 * обновления так, как их прислал бы Telegram, и сверяет ответы. Внешние
 * источники (tonapi, CoinGecko, картинки) отвечают отказом: бот обязан
 * переживать их молчание.
 *
 * Запуск: node scripts/bot-check.mjs
 * Ответы бота глазами: BOT_CHECK_SHOW=1 node scripts/bot-check.mjs
 */

import http from "node:http";
import assert from "node:assert/strict";

const сейчас = Date.now();
const минутНазад = (м) => new Date(сейчас - м * 60000).toISOString();

const ТОКЕНЫ = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Tony", ticker: "TONY", logo_url: "https://example.com/tony.png", address: "EQ" + "A".repeat(46), curve_address: "EQ" + "B".repeat(46), chain: "ton", network: "testnet", created_at: минутНазад(5), owner_id: "u2", dex_pool_address: null },
  { id: "22222222-2222-4222-8222-222222222222", name: "Soly", ticker: "SOLY", logo_url: null, address: "So1y" + "1".repeat(36) + "pump", curve_address: "Cu" + "2".repeat(40), chain: "solana", network: "devnet", created_at: минутНазад(30), owner_id: "u2", dex_pool_address: null },
  { id: "33333333-3333-4333-8333-333333333333", name: "Evmy", ticker: "EVMY", logo_url: null, address: "0x" + "ab".repeat(20), curve_address: "0x" + "cd".repeat(20), chain: "bsc", network: "testnet", created_at: минутНазад(60), owner_id: "u2", dex_pool_address: null },
  // Боевой TON при тестовой сети — в выдаче его быть не должно.
  { id: "44444444-4444-4444-8444-444444444444", name: "Oldy", ticker: "OLDY", logo_url: null, address: "EQ" + "C".repeat(46), curve_address: "EQ" + "D".repeat(46), chain: "ton", network: "mainnet", created_at: минутНазад(2), owner_id: "u2", dex_pool_address: null },
];
const таблицы = {
  tokens: ТОКЕНЫ,
  feed_cache: [
    { chain: "solana", pool_address: "FrongusPoo" + "1".repeat(32), token_address: "Frongus" + "1".repeat(33) + "pump", name: "Frongus", ticker: "FRONGUS", logo_url: null, price: "0.00008", change24: "-71.2", mcap: "81583", liq: "28400", vol24: "8504654", dex_name: "PumpSwap", pool_created_at: минутНазад(900) },
  ],
  curve_cache: [
    { token_id: ТОКЕНЫ[0].id, real_ton: 120, graduation_ton: 1500, tokens_sold: 100000000, price_ton: 0.0000021, fee_bps: 0, graduated: false, updated_at: new Date().toISOString() },
  ],
  profiles: [{ id: "u1", telegram_id: 111, nickname: "tester", wallet_address: null }],
  app_wallets: [
    { user_id: "u1", chain: "ton", address: "UQ" + "T".repeat(46) },
    { user_id: "u1", chain: "solana", address: "So1W" + "2".repeat(38) },
    { user_id: "u1", chain: "evm", address: "0x" + "ee".repeat(20) },
  ],
  trades: [],
  launch_drafts: [],
  pending_referrals: [],
  support_relay: [],
};

/* --- Подделка PostgREST ------------------------------------------- */
function условие(строка, выражение) {
  // «col.op.value» — значение может содержать точки (адреса, проценты).
  const [кол, оп, ...хвост] = выражение.split(".");
  const v = хвост.join(".");
  const есть = строка[кол];
  if (оп === "eq") return String(есть) === v;
  if (оп === "neq") return String(есть) !== v;
  if (оп === "ilike") {
    const рег = new RegExp(`^${v.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*")}$`, "i");
    return рег.test(String(есть ?? ""));
  }
  if (оп === "in") return v.replace(/^\(|\)$/g, "").split(",").includes(String(есть));
  if (оп === "is") return v === "null" ? есть == null : String(есть) === v;
  if (оп === "not") {
    const [оп2, ...хв2] = хвост;
    return !условие(строка, `${кол}.${оп2}.${хв2.join(".")}`);
  }
  throw new Error(`подделка базы не знает «${оп}»`);
}
function разбитьИли(тело) {
  // or=(a.eq.1,b.ilike.%x%) — запятые внутри скобок не встречаются.
  return тело.replace(/^\(|\)$/g, "").split(",");
}
const сервер = http.createServer(async (req, res) => {
  const адрес = new URL(req.url, "http://x");
  const имя = адрес.pathname.replace("/rest/v1/", "");
  const ряд = таблицы[имя];
  const отдать = (код, тело) => { res.writeHead(код, { "content-type": "application/json" }); res.end(JSON.stringify(тело)); };
  if (!ряд) return отдать(404, { code: "42P01", message: `нет таблицы ${имя}` });
  let тело = "";
  for await (const кусок of req) тело += кусок;
  if (req.method === "POST") {
    const строки = [].concat(JSON.parse(тело || "[]")).map((r) => ({ id: r.id || `${имя}-${ряд.length + 1}`, created_at: new Date().toISOString(), ...r }));
    ряд.push(...строки);
    const объект = String(req.headers.accept || "").includes("vnd.pgrst.object");
    return отдать(201, объект ? строки[0] : строки);
  }
  if (req.method !== "GET") return отдать(200, []);
  let итог = ряд.slice();
  for (const [ключ, значение] of адрес.searchParams) {
    if (["select", "order", "limit", "offset"].includes(ключ)) continue;
    if (ключ === "or") { const части = разбитьИли(значение); итог = итог.filter((r) => части.some((ч) => условие(r, ч))); continue; }
    итог = итог.filter((r) => условие(r, `${ключ}.${значение}`));
  }
  const порядок = адрес.searchParams.get("order");
  if (порядок) {
    const [кол, куда] = порядок.split(".");
    итог.sort((a, b) => (String(a[кол]) < String(b[кол]) ? -1 : 1) * (куда === "desc" ? -1 : 1));
    if (["vol24"].includes(кол)) итог.sort((a, b) => (Number(a[кол]) - Number(b[кол])) * (куда === "desc" ? -1 : 1));
  }
  const предел = Number(адрес.searchParams.get("limit")) || итог.length;
  итог = итог.slice(0, предел);
  if (String(req.headers.accept || "").includes("vnd.pgrst.object")) {
    if (итог.length !== 1) return отдать(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return отдать(200, итог[0]);
  }
  return отдать(200, итог);
});
await new Promise((r) => сервер.listen(0, "127.0.0.1", r));
const базаАдрес = `http://127.0.0.1:${сервер.address().port}`;

/* --- Окружение до загрузки модулей: они читают его при импорте ------ */
Object.assign(process.env, {
  TELEGRAM_BOT_TOKEN: "0:test",
  TELEGRAM_WEBHOOK_SECRET: "secret",
  SUPABASE_URL: базаАдрес,
  SUPABASE_SERVICE_ROLE_KEY: "test",
  TON_TESTNET: "1",
  SOLANA_RPC: "https://api.devnet.solana.com",
  APP_URL: "https://mintly.company",
  TG_BOT: "MintlyCobot",
});
delete process.env.TG_APP;
delete process.env.EVM_MAINNET;

/* --- Telegram и внешний мир ---------------------------------------- */
const ушло = [];
const настоящий = globalThis.fetch;
let номер = 100;
globalThis.fetch = async (url, опции = {}) => {
  const u = String(url);
  if (u.startsWith(базаАдрес)) return настоящий(url, опции);
  if (u.startsWith("https://api.telegram.org/")) {
    const метод = u.split("/").pop();
    const тело = опции.body instanceof FormData ? Object.fromEntries([...опции.body.entries()].filter(([, v]) => typeof v === "string")) : JSON.parse(опции.body || "{}");
    ушло.push({ метод, тело });
    const ответ = метод === "getMe"
      ? { id: 1, is_bot: true, username: "MintlyCobot", supports_inline_queries: false, has_main_web_app: false }
      : метод === "getWebhookInfo" ? { url: "https://mintly.company/api/telegram-bot" } : { message_id: ++номер };
    return new Response(JSON.stringify({ ok: true, result: ответ }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
};

/* --- Кошелёк приложения -------------------------------------------- */
const кошелёк = { ton: 12.5, solana: 0.4, bsc: 0.2, токенов: 1000, вызовы: [], отказ: null };
const { подменитьКошелёкДляПроверки, сделкаИзЧата } = await import("../api/_botTrade.js");
подменитьКошелёкДляПроверки(async (путь, действие, userId, { тело }) => {
  кошелёк.вызовы.push({ путь, действие, userId, тело });
  if (путь === "остаток-токена") return { код: 200, тело: { token: кошелёк.токенов } };
  if (действие === "state") {
    if (путь === "wallet-ton") return { код: 200, тело: { address: таблицы.app_wallets[0].address, ton: кошелёк.ton } };
    if (путь === "wallet-solana") return { код: 200, тело: { address: таблицы.app_wallets[1].address, sol: кошелёк.solana } };
    return { код: 200, тело: { address: таблицы.app_wallets[2].address, chains: { bsc: { native: кошелёк.bsc }, base: { native: 0 }, eth: { native: null } } } };
  }
  if (кошелёк.отказ) return кошелёк.отказ;
  if (путь === "wallet-evm") return { код: 200, тело: { ok: true, tx: "0x" + "f".repeat(64) } };
  if (путь === "wallet-solana") return { код: 200, тело: { signature: "sig123", bought: 4242 } };
  return { код: 200, тело: { ok: true, seqno: 7 } };
});

const { default: handler } = await import("../api/telegram-bot.js");

function ответ() {
  const о = { код: 200, тело: null, status(к) { о.код = к; return о; }, json(т) { о.тело = т; return о; }, setHeader() {}, send(т) { о.тело = т; return о; } };
  return о;
}
async function прислать(обновление) {
  ушло.length = 0;
  const res = ответ();
  await handler({ method: "POST", url: "/api/telegram-bot", headers: { "x-telegram-bot-api-secret-token": "secret", host: "mintly.company" }, body: обновление }, res);
  assert.equal(res.код, 200);
  // BOT_CHECK_SHOW=1 — показать, что бот ответил: тексты и кнопки глазами.
  if (process.env.BOT_CHECK_SHOW) {
    for (const о of ушло) {
      const т = о.тело.text || о.тело.caption || (о.тело.results ? о.тело.results.map((r) => `• ${r.title} — ${r.description || ""}`).join("\n") : "");
      const к = ((о.тело.reply_markup && о.тело.reply_markup.inline_keyboard) || []).map((ряд) => ряд.map((b) => `[${b.text}]`).join(" ")).join("\n");
      console.log(`\n=== ${о.метод}\n${т}${к ? `\n${к}` : ""}`);
    }
  }
  return ушло.slice();
}
const личка = { id: 111, type: "private" };
const группа = { id: -100500, type: "supergroup" };
const от = { id: 111, first_name: "Тест", language_code: "ru" };
const сообщение = (text, chat = личка, extra = {}) => ({ update_id: 1, message: { message_id: 10, from: от, chat, text, ...extra } });
const нажатие = (data, chat = личка) => ({ update_id: 2, callback_query: { id: "cb1", from: от, data, message: { message_id: 20, chat } } });
const кнопки = (о) => ((о.тело.reply_markup && о.тело.reply_markup.inline_keyboard) || []).flat();
const текстВсех = (список) => список.map((о) => о.тело.text || о.тело.caption || "").join("\n---\n");
let проверок = 0;
const проверить = (условие, что) => { assert.ok(условие, что); проверок++; };

/* 1. Пустая подсказка — свежие запуски всех сетей и лента рынка. */
let ход = await прислать({ update_id: 3, inline_query: { id: "iq", from: от, query: "" } });
let подсказка = ход.find((о) => о.метод === "answerInlineQuery");
const заголовки = подсказка.тело.results.map((r) => r.title).join(" | ");
проверить(/\$TONY/.test(заголовки) && /\$SOLY/.test(заголовки) && /\$EVMY/.test(заголовки), `в пустой подсказке токены всех сетей: ${заголовки}`);
проверить(!/\$OLDY/.test(заголовки), "боевой TON в тестовой сети не показан");
проверить(/FRONGUS/.test(заголовки), "лента рынка добирает подсказку");
проверить(!подсказка.тело.button, "кнопки «пусто» нет, раз нашлось");
const кнопкаTony = подсказка.тело.results.find((r) => r.title.includes("TONY")).reply_markup.inline_keyboard.flat();
проверить(кнопкаTony.some((к) => к.url === `https://t.me/MintlyCobot?start=buy_t_${ТОКЕНЫ[0].id}`), "в чужом чате «Торговать» ведёт к новому боту");

/* 2. Поиск по тикеру и справка. */
ход = await прислать({ update_id: 4, inline_query: { id: "iq2", from: от, query: "evmy" } });
проверить(ход[0].тело.results[0].title.includes("EVMY"), "тикер EVM находится");
ход = await прислать({ update_id: 5, inline_query: { id: "iq3", from: от, query: "help" } });
проверить(/BNB Chain/.test(ход[0].тело.results[0].input_message_content.message_text), "справка подсказки — про все сети");

/* 3. Приветствие, справка, новые. */
ход = await прислать(сообщение("/start"));
let т = текстВсех(ход);
проверить(/пяти сетях/.test(т) && /@MintlyCobot/.test(т) && !/Подпиши в кошельке/.test(т), "приветствие нового бота");
проверить(ход.some((о) => кнопки(о).some((к) => к.text === "💼 Кошелёк")), "кнопка кошелька в меню");
ход = await прислать(сообщение("/help"));
проверить(/\/wallet/.test(текстВсех(ход)) && /тестовых сетях/.test(текстВсех(ход)), "справка с кошельком и пометкой тестовой сети");
ход = await прислать(сообщение("/new"));
т = текстВсех(ход);
проверить(/TONY/.test(т) && /SOLY/.test(т) && /EVMY/.test(т) && !/OLDY/.test(т), "/new — свежие во всех сетях");

/* 4. Карточка в личке — сразу с суммами сделки в монете сети. */
ход = await прислать(сообщение("/token TONY"));
let карточка = ход.find((о) => о.метод === "sendMessage");
проверить(/GRAM/.test(карточка.тело.text) && /Тестовая сеть TON/.test(карточка.тело.text), "карточка TON — в GRAM и с пометкой сети");
проверить(кнопки(карточка).some((к) => к.callback_data === `k:t:${ТОКЕНЫ[0].id}:5`), "сумма покупки кнопкой");
проверить(кнопки(карточка).some((к) => к.callback_data === `d:t:${ТОКЕНЫ[0].id}:100`), "продажа долей кнопкой");

/* 5. Покупка: экран подтверждения → сделка кошельком приложения. */
ход = await прислать(нажатие(`k:t:${ТОКЕНЫ[0].id}:5`));
let экран = ход.find((о) => о.метод === "sendMessage");
проверить(/Спишется: <b>5 GRAM<\/b>/.test(экран.тело.text) && /12\.5 GRAM/.test(экран.тело.text), "экран покупки с остатком");
const подтвердить = кнопки(экран).find((к) => /^K:/.test(к.callback_data)).callback_data;
проверить(/^K:t:[0-9a-f-]+:5:[0-9a-f]{8}$/.test(подтвердить), "подтверждение с одноразовой меткой");
кошелёк.вызовы.length = 0;
ход = await прислать(нажатие(подтвердить));
const сделка = кошелёк.вызовы.find((в) => в.действие === "buy");
проверить(сделка && сделка.путь === "wallet-ton" && сделка.тело.tokenId === ТОКЕНЫ[0].id && сделка.тело.amount === 5 && сделка.тело.speed === "normal", "покупка ушла обработчику TON с обычной скоростью");
проверить(/^tg:[0-9a-f]{40}$/.test(сделка.тело.requestKey), "ключ запроса — хеш метки");
проверить(/Куплено/.test(текстВсех(ход)), "итог «Куплено»");
проверить(таблицы.trades.some((с) => с.token_id === ТОКЕНЫ[0].id && с.side === "buy" && с.ton_amount === 5), "сделка записана в историю");
const ключПервый = сделка.тело.requestKey;
кошелёк.вызовы.length = 0;
await прислать(нажатие(подтвердить));
проверить(кошелёк.вызовы.find((в) => в.действие === "buy").тело.requestKey === ключПервый, "повторное нажатие — тот же ключ, второй сделки не будет");

/* 6. Продажа доли. */
ход = await прислать(нажатие(`d:t:${ТОКЕНЫ[0].id}:50`));
экран = ход.find((о) => о.метод === "sendMessage");
проверить(/Продаём: <b>500 \$TONY<\/b>/.test(экран.тело.text), "экран продажи от остатка");
кошелёк.вызовы.length = 0;
await прислать(нажатие(кнопки(экран).find((к) => /^D:/.test(к.callback_data)).callback_data));
проверить(кошелёк.вызовы.some((в) => в.действие === "sell" && в.тело.amount === 500), "продажа половины ушла обработчику");

/* 7. Не хватает денег и отказ сети. */
кошелёк.ton = 1;
ход = await прислать(нажатие(`k:t:${ТОКЕНЫ[0].id}:5`));
проверить(/Не хватает на кошельке/.test(текстВсех(ход)) && текстВсех(ход).includes(таблицы.app_wallets[0].address), "нехватка — с адресом пополнения");
кошелёк.ton = 50;
кошелёк.отказ = { код: 400, тело: { error: "unverified_curve" } };
ход = await прислать(нажатие(`K:t:${ТОКЕНЫ[0].id}:5:abcdef12`));
проверить(/Не вышло: этот токен сейчас торгуется только в приложении/.test(текстВсех(ход)), "отказ обработчика — человеческими словами");
кошелёк.отказ = null;

/* 8. Сделки в группе не идут, кошелёк — только в личке. */
ход = await прислать(нажатие(`k:t:${ТОКЕНЫ[0].id}:5`, группа));
проверить(ход.some((о) => о.метод === "answerCallbackQuery" && /в личке/.test(о.тело.text)), "сделка из группы отбита");
ход = await прислать(сообщение("/token TONY", группа));
проверить(кнопки(ход[0]).some((к) => /^https:\/\/t\.me\/MintlyCobot\?start=buy_t_/.test(к.url || "")), "в группе — ссылка к боту");
ход = await прислать(сообщение("/wallet", группа));
проверить(/в личке/.test(текстВсех(ход)), "кошелёк в группе не показывается");

/* 9. Кошелёк во всех сетях. */
таблицы.trades.push({ user_id: "u1", token_id: ТОКЕНЫ[2].id, side: "buy", created_at: new Date().toISOString() });
ход = await прислать(сообщение("/wallet"));
т = текстВсех(ход);
проверить(/TON<\/b> · 50\.000 GRAM/.test(т) && /Solana<\/b> · 0\.4000 SOL/.test(т) && /BNB Chain · 0\.2000 BNB/.test(т) && /Ethereum · — ETH/.test(т), `кошелёк во всех сетях: ${т.slice(0, 400)}`);
проверить(/\$TONY — 1[\s ]000 · TON/.test(т) && /\$EVMY — 1[\s ]000 · BNB Chain/.test(т), "токены кошелька с сетью");

/* 10. Команды покупки и продажи, ссылки из чужих чатов. */
ход = await прислать(сообщение(`/buy ${ТОКЕНЫ[0].address} 5`));
проверить(/Спишется: <b>5 GRAM/.test(текстВсех(ход)), "/buy АДРЕС СУММА — сразу подтверждение");
ход = await прислать(сообщение("/sell TONY 25%"));
проверить(/Продаём: <b>250 \$TONY<\/b> \(25%\)/.test(текстВсех(ход)), "/sell ТИКЕР 25%");
ход = await прислать(сообщение(`/start buy_m5000000_t_${ТОКЕНЫ[0].id}`));
проверить(/Спишется: <b>5 GRAM/.test(текстВсех(ход)), "ссылка с суммой из чужого чата");
ход = await прислать(сообщение(`/start tok_${ТОКЕНЫ[1].id}`));
проверить(/Soly/.test(текстВсех(ход)) && /Тестовая сеть Solana/.test(текстВсех(ход)), "ссылка на токен Solana");
ход = await прислать(сообщение("/start draft_55555555-5555-4555-8555-555555555555"));
проверить(кнопки(ход[0]).some((к) => к.web_app && /\?draft=5555/.test(к.web_app.url)), "черновик открывает форму в приложении");

/* 11. Простой текст в личке: тикер — поиск, фраза — подсказка. */
ход = await прислать(сообщение("tony"));
проверить(/Tony/.test(текстВсех(ход)), "тикер без команды — карточка");
ход = await прислать(сообщение("привет, а как вывести деньги?"));
проверить(ход.some((о) => кнопки(о).some((к) => к.web_app && /open=support/.test(к.web_app.url))), "вопрос — кнопка поддержки");
ход = await прислать(сообщение(`/wallet ${"UQ" + "Z".repeat(46)}`));
проверить(/внешний кошелёк больше не нужно/.test(текстВсех(ход)), "привязки внешнего кошелька больше нет");

/* 12. Сделка в EVM — обработчику EVM с сетью и адресом токена. */
кошелёк.вызовы.length = 0;
const итогEVM = await сделкаИзЧата({ userId: "u1", card: { tokenId: ТОКЕНЫ[2].id, chain: "bsc", address: ТОКЕНЫ[2].address, ticker: "EVMY", монета: "BNB", цена: 0.000001 }, покупка: true, сумма: 0.05, метка: "a1b2c3d4" });
const вызовEVM = кошелёк.вызовы.find((в) => в.действие === "buy");
проверить(итогEVM.ok && вызовEVM.путь === "wallet-evm" && вызовEVM.тело.chain === "bsc" && вызовEVM.тело.token === ТОКЕНЫ[2].address, "EVM-покупка ушла обработчику EVM");
проверить(/testnet\.bscscan\.com\/tx\/0x/.test(итогEVM.ссылка || ""), "ссылка на тестовый обозреватель BNB");
const итогSol = await сделкаИзЧата({ userId: "u1", card: { tokenId: ТОКЕНЫ[1].id, chain: "solana", address: ТОКЕНЫ[1].address, ticker: "SOLY", монета: "SOL", цена: 0 }, покупка: true, сумма: 0.1, метка: "b2c3d4e5" });
проверить(итогSol.ok && итогSol.штук === 4242 && /cluster=devnet/.test(итогSol.ссылка || ""), "Solana: числа от кривой, ссылка на devnet");

/* 13. Тренды из ленты и проверка поиска для админа. */
ход = await прислать(сообщение("/top"));
проверить(/Мемкоины в тренде/.test(текстВсех(ход)) && /FRONGUS/.test(текстВсех(ход)), "/top — из ленты рынка");
const проба = ответ();
await handler({ method: "GET", url: "/api/telegram-bot?probe=secret", headers: { host: "mintly.company" } }, проба);
проверить(проба.тело.свои.some((с) => /TONY · ton · testnet/.test(с)) && проба.тело.свои.length === 3, `проба поиска видит свои токены: ${проба.тело.свои.join(", ")}`);

/* 14. Картинка-график: EVM, TON и пул Solana из ленты рисуются, а не 404. */
const { default: график } = await import("../api/chart.js");
for (const [что, адрес] of [["EVM", `/api/chart?token=${ТОКЕНЫ[2].id}`], ["TON", `/api/chart?token=${ТОКЕНЫ[0].id}`], ["пул Solana", `/api/chart?pool=${таблицы.feed_cache[0].pool_address}`]]) {
  const к = ответ();
  await график({ method: "GET", url: адрес, query: {}, headers: { host: "mintly.company" } }, к);
  проверить(к.код === 200 && Buffer.isBuffer(к.тело) && к.тело.length > 1000, `график ${что}: ${к.код}`);
}

/* 15. Подключение: вебхук и визитка нового бота. */
ушло.length = 0;
const res = ответ();
await handler({ method: "GET", url: "/api/telegram-bot?setup=secret", headers: { host: "mintly.company" } }, res);
const методы = ушло.map((о) => о.метод);
проверить(["setWebhook", "setMyDescription", "setMyShortDescription", "setMyCommands", "setChatMenuButton"].every((м) => методы.includes(м)), `setup ставит вебхук и визитку: ${методы.join(",")}`);
проверить(res.тело.осталось.length === 2 && /setinline/.test(res.тело.осталось[0]), "setup называет шаги для BotFather");
проверить(ушло.find((о) => о.метод === "setMyDescription").тело.description.includes("@MintlyCobot"), "описание с именем нового бота");

сервер.close();
console.log(`Бот: все ${проверок} проверок прошли.`);
process.exit(0);
