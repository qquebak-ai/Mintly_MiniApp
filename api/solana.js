/* Торговля мемкоинами Solana.
 *
 * Зачем через сервер. Маршрут сделки и её сборку делает Jupiter —
 * агрегатор, который сам ищет лучший путь по всем биржам сети. Ходить
 * туда прямо из браузера мешают две вещи: у их API свои лимиты на
 * источник и своя политика CORS, а ключ площадки (счёт для комиссии)
 * в браузер отдавать нельзя вовсе. Поэтому приложение спрашивает
 * котировку и готовую транзакцию здесь, а подписывает её человек в
 * своём кошельке — приватных ключей мы по-прежнему не касаемся.
 *
 * Переменные окружения (все серверные, без префикса VITE_):
 *   SOLANA_FEE_ACCOUNT — счёт площадки для комиссии. Это не обычный
 *                        адрес кошелька, а referral-счёт Jupiter под
 *                        конкретный токен; без него комиссия просто не
 *                        берётся, всё остальное работает как обычно.
 *   SOLANA_FEE_BPS     — размер комиссии в сотых долях процента
 *                        (100 = 1%, как на своей кривой).
 *   SOLANA_RPC         — узел сети для баланса и отправки. Публичный
 *                        выдерживает единичные запросы, для нагрузки
 *                        нужен свой (Helius, QuickNode).
 */

const JUP = "https://lite-api.jup.ag/swap/v1";
/* Узел сети — обязательно боевой.
 *
 * SOLANA_RPC на сервере указывает на devnet: там живут своя кривая и
 * кошелёк приложения, пока идёт обкатка. А здесь речь о токенах с
 * биржи — они в боевой сети, и спрашивать про них у devnet бессмысленно:
 * держателей «не видно», балансы нули, а публичный devnet ещё и
 * отбивается отказом. Поэтому боевой адрес берётся отдельно, а devnet в
 * эту дверь не проходит.
 *
 * Запасной узел — на случай, когда публичный отвечает отказом по
 * лимиту: список держателей на карточке важнее, чем то, чьим узлом он
 * прочитан. */
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
// Узлы для рыночных вопросов — только боевые: сколько бы ни стоял
// SOLANA_RPC на devnet, токен с биржи живёт не там.
const УЗЛЫ = [...new Set([
  (process.env.SOLANA_RPC_MAINNET || "").trim(),
  /devnet|testnet/i.test(RPC) ? "" : RPC,
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean))];
const FEE_ACCOUNT = (process.env.SOLANA_FEE_ACCOUNT || "").trim();
// Надбавки площадки к обмену нет: ноль по умолчанию. Переменной её
// можно вернуть, но пустое значение теперь значит «не брать».
const FEE_BPS = Number(process.env.SOLANA_FEE_BPS || 0);

// Обёрнутый SOL: в маршрутах Jupiter обычная монета участвует именно в
// этом виде, разворачивать её обратно он умеет сам.
export const SOL_MINT = "So11111111111111111111111111111111111111112";

// Адрес в Solana — base58 длиной 32–44 символа. Проверка грубая, но
// отсекает и пустое, и чужой формат: дальше строка уходит в чужой API,
// и лучше отбить её здесь, чем ловить невнятный отказ оттуда.
const адресОк = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

async function jup(path, init) {
  const res = await fetch(`${JUP}${path}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* Jupiter иногда отвечает текстом */ }
  if (!res.ok) {
    const причина = (json && (json.error || json.message)) || text.slice(0, 200);
    throw new Error(`jupiter ${res.status}: ${причина}`);
  }
  return json;
}

/* Котировка: сколько токенов дадут за столько-то SOL (или наоборот).
   Комиссию площадки закладываем в сам маршрут — Jupiter удержит её при
   исполнении, отдельным переводом брать нечего. */
export async function котировка({ input, output, amount, slippageBps = 100 }) {
  if (!адресОк(input) || !адресОк(output)) return null;
  const сумма = BigInt(amount || 0);
  if (сумма <= 0n) return null;

  const параметры = new URLSearchParams({
    inputMint: input,
    outputMint: output,
    amount: сумма.toString(),
    slippageBps: String(slippageBps),
  });
  // Комиссия берётся только когда есть куда: без referral-счёта Jupiter
  // отказывается собирать сделку целиком, а сделка людям нужнее.
  if (FEE_ACCOUNT && FEE_BPS > 0) параметры.set("platformFeeBps", String(FEE_BPS));

  return await jup(`/quote?${параметры}`);
}

/* Готовая транзакция под конкретный кошелёк. Возвращается в base64 —
   приложение перекодирует её и отдаёт кошельку на подпись. */
export async function сделка({ quote, wallet }) {
  if (!quote || !адресОк(wallet)) return null;
  const тело = {
    quoteResponse: quote,
    userPublicKey: wallet,
    // Разворачивать обёрнутый SOL обратно — забота Jupiter: иначе после
    // продажи человек получил бы не монеты, а токен-обёртку и не понял,
    // куда делись деньги.
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
  };
  if (FEE_ACCOUNT && FEE_BPS > 0) тело.feeAccount = FEE_ACCOUNT;

  const json = await jup("/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(тело),
  });
  return json && json.swapTransaction ? json.swapTransaction : null;
}

/* Баланс кошелька: сколько SOL и сколько единиц конкретного токена.
   Оба вопроса — обычные вызовы узла сети, своей библиотеки не нужно. */
async function rpc(method, params, узлы = [RPC]) {
  let последняя = null;
  for (const узел of узлы) {
    try {
      const res = await fetch(узел, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      // Отказ по лимиту — повод спросить у соседнего узла, а не сдаться:
      // у публичных он наступает быстро и проходит так же быстро.
      if (res.status === 429 || res.status >= 500) { последняя = new Error(`rpc ${res.status}`); continue; }
      if (!res.ok) throw new Error(`rpc ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(`rpc: ${json.error.message}`);
      return json.result;
    } catch (err) {
      последняя = err;
    }
  }
  throw последняя || new Error("rpc недоступен");
}

export async function балансы({ wallet, mint }) {
  if (!адресОк(wallet)) return null;
  const итог = { sol: 0, token: 0, decimals: 0 };
  try {
    const b = await rpc("getBalance", [wallet]);
    итог.sol = Number((b && b.value) || 0) / 1e9;
  } catch { /* узел не ответил — покажем нули, это лучше пустого экрана */ }

  if (адресОк(mint)) {
    try {
      const r = await rpc("getTokenAccountsByOwner", [
        wallet,
        { mint },
        { encoding: "jsonParsed" },
      ]);
      const счета = (r && r.value) || [];
      for (const счёт of счета) {
        const сумма = счёт?.account?.data?.parsed?.info?.tokenAmount;
        if (!сумма) continue;
        итог.token += Number(сумма.uiAmount) || 0;
        итог.decimals = Number(сумма.decimals) || итог.decimals;
      }
    } catch { /* токенового счёта может не быть вовсе — это ноль */ }
  }
  return итог;
}

/* Крупнейшие держатели токена. Сеть отдаёт двадцать самых больших
   счетов и общую эмиссию — этого хватает, чтобы показать, кому
   принадлежит монета и не собрана ли она в одних руках. */
/* Память ровно на пару секунд. Раньше ответ жил пять минут, и покупка
   с другого телефона появлялась в списке минутами позже — человек видел
   старую картинку и считал, что сделка не прошла. Двух секунд хватает,
   чтобы несколько открытых карточек не били в узел наперегонки, и мало,
   чтобы это было заметно глазу. */
const держателиКеш = new Map();
const ДЕРЖАТЕЛИ_МС = 2000;

/* Полный выпуск — величина неподвижная: в продаже столько-то плюс запас
   под пару, и меняется она только при закрытии кривой. Спрашивать её
   вместе с каждым списком незачем, поэтому она живёт своей памятью и
   переживает десятки обновлений держателей. */
const выпускКеш = new Map();
const ВЫПУСК_МС = 60 * 1000;

/* Обход всех счетов токена — самый дорогой запрос из трёх, и нужен он
   лишь у токенов с длинным списком. Держим его ответ пять минут: у
   монеты с сотней тысяч держателей узел перебирает их несколько секунд,
   а карточка спрашивает список каждые четыре. На самом числе это не
   сказывается — сотня держателей за пять минут ни на что не влияет,
   тогда как список крупнейших и доли обновляются по-прежнему сразу. */
const всехКеш = new Map();
const ВСЕХ_МС = 5 * 60 * 1000;

// Ниже этой доли выпуска (в процентах) счёт считается пустым.
const ПЫЛЬ_ДОЛЯ = 0.000001;

async function полныйВыпуск(mint, эмиссия) {
  const было = выпускКеш.get(mint);
  if (было && Date.now() - было.ts < ВЫПУСК_МС) return было.выпуск || эмиссия;
  let выпуск = 0;
  try {
    const { состояние, КРИВАЯ } = await import("./solana-launch.js");
    const с = await состояние(mint);
    if (с && с.вПродаже > 0) выпуск = с.вПродаже + КРИВАЯ.liquidityTokens / 1e6;
  } catch { /* не наш токен или узел молчит — остаётся эмиссия */ }
  выпускКеш.set(mint, { ts: Date.now(), выпуск });
  if (выпускКеш.size > 300) {
    for (const [k, v] of выпускКеш) if (Date.now() - v.ts > ВЫПУСК_МС) выпускКеш.delete(k);
  }
  return выпуск || эмиссия;
}

/* Сколько держателей у токена — по данным Jupiter.
 *
 * Обход всех счетов узлу приходится делать по индексу, а публичные это
 * почти везде запрещают: с сервера площадки ответ приходил отказом, и
 * на карточке монеты за четверть миллиарда стояли двадцать держателей —
 * ровно столько, сколько сеть отдаёт крупнейших. У Jupiter то же число
 * лежит готовым в карточке токена, отвечает он за доли секунды и ключа
 * не просит — а сделки мы и так собираем через него.
 *
 * Свои токены на кривой Jupiter не знает: для них остаётся обход по
 * счетам, он же и запасной путь, когда карточки нет. */
async function числоИзJupiter(mint) {
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const список = await res.json();
    const карточка = Array.isArray(список) ? список.find((т) => т && т.id === mint) : null;
    const сколько = карточка ? Number(карточка.holderCount) : NaN;
    return Number.isFinite(сколько) && сколько > 0 ? Math.round(сколько) : null;
  } catch {
    // Молчит или отвечает мусором — считаем сами.
    return null;
  }
}

/* Сколько всего кошельков держит токен. Крупнейшие счета сеть отдаёт
   готовым списком, а общего числа среди них нет: его приходится считать
   по всем счетам этого mint. Запрос тяжёлый, поэтому живёт в том же
   кеше, что и список, и молча возвращает null, когда узел его не
   разрешает (публичные часто отказывают). */
const TOKEN_СТАРЫЙ = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/* Чья программа выпустила токен. Их две, и счета у них лежат под разными
   программами: обход «старой» у токена Token-2022 находит ноль счетов, и
   число держателей молча падало к двадцати крупнейшим. Спрашиваем у
   самого mint, кому он принадлежит, и идём именно туда. */
async function программаТокена(mint, узлы) {
  const инфо = await rpc("getAccountInfo", [mint, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }], узлы).catch(() => null);
  const хозяин = инфо && инфо.value && инфо.value.owner;
  return хозяин === TOKEN_2022 || хозяин === TOKEN_СТАРЫЙ ? хозяин : null;
}

async function числоДержателей(mint, узлы, минимумЕдиниц = 0) {
  /* Из каждого счёта берём только восемь байт с остатком — поле amount
     лежит по смещению 64. Раньше здесь стоял jsonParsed, и у монеты со
     ста тысячами держателей ответ разрастался до сотни мегабайт: узел
     его либо обрывал, либо отдавал пустоту, и на карточке оставались
     ровно двадцать крупнейших. С вырезкой тот же запрос укладывается в
     пару секунд. */
  const программа = await программаТокена(mint, узлы);
  if (!программа) return null;
  /* Размер счёта проверяем только у старой программы: там он всегда 165
     байт. У Token-2022 к счёту дописываются расширения, и размер гуляет —
     жёсткий фильтр отсекал бы как раз такие токены. Отбор по mint в
     первых тридцати двух байтах остаётся в обоих случаях. */
  const фильтры = программа === TOKEN_2022
    ? [{ memcmp: { offset: 0, bytes: mint } }]
    : [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }];
  const ответ = await rpc("getProgramAccounts", [
    программа,
    { encoding: "base64", dataSlice: { offset: 64, length: 8 }, filters: фильтры },
  ], узлы).catch(() => null);
  if (!Array.isArray(ответ)) return null;
  let счёт = 0;
  for (const с of ответ) {
    const данные = с && с.account && с.account.data;
    const b64 = Array.isArray(данные) ? данные[0] : null;
    if (!b64) continue;
    const буфер = Buffer.from(b64, "base64");
    if (буфер.length < 8) continue;
    // Остаток лежит восемью байтами от младшего к старшему.
    if (буфер.readBigUInt64LE(0) > минимумЕдиниц) счёт += 1;
  }
  return счёт;
}

export async function держатели({ mint }) {
  if (!адресОк(mint)) return null;
  const было = держателиКеш.get(mint);
  if (было && Date.now() - было.ts < ДЕРЖАТЕЛИ_МС) return было.тело;
  /* Токены площадки живут там же, где её кривая, — в devnet, пока идёт
     обкатка. Боевые узлы про них не знают вовсе, поэтому спрашиваем
     сначала свой узел, а уже потом боевые: у токена с биржи наоборот. */
  const свои = /devnet|testnet/i.test(RPC) ? [RPC, ...УЗЛЫ] : УЗЛЫ;
  let крупные = null, запас = null;
  try {
    [крупные, запас] = await Promise.all([
      rpc("getTokenLargestAccounts", [mint], свои),
      rpc("getTokenSupply", [mint], свои).catch(() => null),
    ]);
  } catch (err) {
    // Публичные узлы отбиваются по лимиту, и спрашивать их снова прямо
    // сейчас — только тратить время карточки. Помним отказ несколько
    // секунд и отдаём пустой список: «держателей не видно» честнее
    // ошибки. Метка ставится вперёд — на столько кеш и считается свежим.
    держателиКеш.set(mint, { ts: Date.now() + 6000, тело: { всего: 0, счета: [], держателей: null } });
    return { всего: 0, счета: [], держателей: null };
  }
  const эмиссия = Number(запас && запас.value && запас.value.uiAmount) || 0;
  /* Доля считается от полного выпуска, а не от нынешней эмиссии.
     Токены площадки рождаются по мере покупок: кривая держит право
     выпуска и минтит их прямо покупателю. Пока сбор идёт, эмиссия равна
     проданному — и у первого же покупателя выходило «100% всего токена»,
     хотя на руках у него пятьдесят миллионов из миллиарда. Полный выпуск
     спрашиваем у самой кривой: в продаже столько-то плюс запас под пару.
     У токена с биржи кривой нет, и делить не от чего — там эмиссия и
     есть весь выпуск. */
  const выпуск = await полныйВыпуск(mint, эмиссия);
  const делитель = выпуск > 0 ? выпуск : эмиссия;

  const сырые = ((крупные && крупные.value) || []).map((с) => ({
    счёт: с.address,
    количество: Number(с.uiAmount) || 0,
    доля: делитель > 0 ? ((Number(с.uiAmount) || 0) / делитель) * 100 : 0,
  }));
  /* Сеть отдаёт токеновые счета, а не кошельки: у каждого владельца под
     каждый токен заведён свой счёт с собственным адресом. Показывать его
     человеку бессмысленно — по нему не найти ни профиля, ни кошелька в
     обозревателе. Спрашиваем владельцев одним запросом. */
  const владельцы = сырые.length
    ? await rpc("getMultipleAccounts", [сырые.map((с) => с.счёт), { encoding: "jsonParsed" }], свои).catch(() => null)
    : null;
  const счета = сырые.map((с, i) => {
    const инфо = владельцы && владельцы.value && владельцы.value[i];
    const хозяин = инфо && инфо.data && инфо.data.parsed && инфо.data.parsed.info
      ? инфо.data.parsed.info.owner
      : null;
    return { адрес: хозяин || с.счёт, счёт: с.счёт, количество: с.количество, доля: с.доля };
  })
  /* Пыль держателем не делает. После продажи «всего» на счету оседают
     миллионные доли токена, и такой кошелёк попадал и в список строкой
     «0.0%», и в счётчик держателей. Порог относительный — миллионная
     доля процента от выпуска: он одинаково верен и для миллиардного
     мемкоина, и для токена с крошечной эмиссией. */
    .filter((с) => с.доля >= ПЫЛЬ_ДОЛЯ);
  /* Сколько всего держателей. Сеть отдаёт двадцать крупнейших счетов, и
     пока их меньше двадцати, считать больше нечего: это и есть все, кто
     держит токен. Тяжёлый обход всех счетов остаётся только на случай
     полного списка — и живёт своей, более долгой памятью, чтобы не
     тормозить обновление на каждой сделке. */
  const ненулевых = счета.length;
  let держателей = ненулевых;
  if (ненулевых >= 20) {
    const было = всехКеш.get(mint);
    /* Порог пыли — в тех же единицах, в каких остаток лежит на счету:
       доля выпуска, умноженная на десятичные знаки монеты. */
    const знаки = Number(запас && запас.value && запас.value.decimals) || 0;
    const минимумЕдиниц = BigInt(Math.floor(((делитель * ПЫЛЬ_ДОЛЯ) / 100) * Math.pow(10, знаки)));
    const годится = (с) => с != null && с >= ненулевых;
    if (было && Date.now() - было.ts < ВСЕХ_МС) {
      if (годится(было.сколько)) держателей = было.сколько;
    } else {
      // Сначала спрашиваем Jupiter: он знает число сразу. Обход счетов —
      // запасной путь, для своих токенов и на случай его молчания.
      let сколько = await числоИзJupiter(mint);
      if (!годится(сколько)) сколько = await числоДержателей(mint, свои, минимумЕдиниц);
      всехКеш.set(mint, { ts: Date.now(), сколько });
      /* Меньше, чем крупнейших на руках, держателей быть не может: такой
         ответ — признак того, что узел отдал обрезанный список, и верить
         ему нельзя. Тогда остаётся число видимых. */
      if (годится(сколько)) держателей = сколько;
    }
  }
  const тело = { всего: эмиссия, эмиссия, выпуск: делитель, счета, держателей };
  держателиКеш.set(mint, { ts: Date.now(), тело });
  if (держателиКеш.size > 300) {
    for (const [k, v] of держателиКеш) if (Date.now() - v.ts > ДЕРЖАТЕЛИ_МС) держателиКеш.delete(k);
  }
  return тело;
}

/* Отправка подписанной сделки в сеть.
 *
 * Раньше этим занимался сам кошелёк — deeplink signAndSendTransaction
 * подписывал и отправлял разом. Phantom его отключил, и теперь кошелёк
 * только подписывает; довести сделку до сети — наша работа.
 *
 * preflightCommitment намеренно мягкий: строгая проверка на узле, чуть
 * отставшем от сети, отбивает совершенно нормальные сделки.
 */
export async function отправить(signedBase64) {
  if (!signedBase64 || typeof signedBase64 !== "string") return null;
  const подпись = await rpc("sendTransaction", [
    signedBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "processed", maxRetries: 3 },
  ]);
  return подпись || null;
}

export default async function handler(req, res) {
  const действие = String((req.query && req.query.action) || "");
  try {
    if (действие === "quote") {
      const q = await котировка({
        input: req.query.input,
        output: req.query.output,
        amount: req.query.amount,
        slippageBps: Number(req.query.slippage) || 100,
      });
      if (!q) return res.status(400).json({ error: "bad_request" });
      // Котировка живёт секунды: кешировать её — значит показывать цену,
      // по которой сделка уже не пройдёт.
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        input: q.inputMint,
        output: q.outputMint,
        inAmount: q.inAmount,
        outAmount: q.outAmount,
        minOut: q.otherAmountThreshold,
        impactPct: Number(q.priceImpactPct) || 0,
        feeBps: FEE_ACCOUNT ? FEE_BPS : 0,
        // Сырой ответ нужен для сборки сделки: Jupiter принимает обратно
        // ровно его, без изменений.
        quote: q,
      });
    }

    if (действие === "holders") {
      const h = await держатели({ mint: req.query.mint });
      if (!h) return res.status(400).json({ error: "bad_request" });
      /* Ни браузеру, ни промежуточным узлам список не кешируем: карточка
         обновляет его на каждой сделке, и кеш в минуту показывал бы
         старых держателей вместо только что купившего. Свой короткий
         кеш на сервере эту нагрузку и так держит. */
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(h);
    }

    if (действие === "balances") {
      const b = await балансы({ wallet: req.query.wallet, mint: req.query.mint });
      if (!b) return res.status(400).json({ error: "bad_request" });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(b);
    }

    if (действие === "send") {
      if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
      const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const подпись = await отправить(тело.transaction);
      if (!подпись) return res.status(400).json({ error: "bad_request" });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ signature: подпись });
    }

    if (действие === "swap") {
      if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
      const тело = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const tx = await сделка({ quote: тело.quote, wallet: тело.wallet });
      if (!tx) return res.status(400).json({ error: "bad_request" });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ transaction: tx });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (err) {
    console.warn("[solana]", err && err.message);
    return res.status(502).json({ error: "upstream_failed", detail: String((err && err.message) || err).slice(0, 200) });
  }
}
