/* Чужие запуски — в ленту сразу, как они появились в сети.
 *
 * Mintly показывает не только свои токены, а все свежие мемкоины с
 * площадок запуска. Обход биржевых лент (api/refresh-feed.js) ходит раз
 * в минуту, а пул на бирже у мемкоина появляется только после выхода с
 * кривой, — для «только что созданных» это поздно. Поэтому новые токены
 * pump.fun и letsbonk.fun берём из открытого потока PumpPortal: событие
 * о создании приходит через доли секунды после сделки в сети.
 *
 * Поток держит один процесс сервера (server/index.mjs), приложение
 * спрашивает готовое у api/new-launches.js. Каждый новый токен минут
 * десять сопровождаем его же сделками — капитализация в ленте живая, а
 * не та, что была в момент создания. */

const АДРЕС = "wss://pumpportal.fun/api/data";
const ДЕРЖИМ = 200;               // столько последних запусков помним
const СЛЕДИМ_МС = 10 * 60 * 1000; // столько ведём сделки нового токена
const МЕТАДАННЫЕ_МС = 4000;
// Повторы чтения метаданных: IPFS в первые секунды часто ещё не раздаёт файл.
const ПОВТОРЫ_МС = [2000, 5000, 10000, 20000];
/* Шлюз IPFS. Общий ipfs.io (и dweb.link) теперь отвечают 429 «только
   через service worker» — картинки в ленте не грузились вовсе. Шлюз
   pump.fun на Pinata отдаёт те же файлы за доли секунды и умеет сразу
   уменьшить картинку. */
const ШЛЮЗ = "https://pump.mypinata.cloud/ipfs/";
const КАРТИНКА_БАЙТ = 1_500_000;
const картинки = new Map();       // mint -> { байты, тип } | Promise
const СДЕЛОК_НА_ТОКЕН = 600;

/* Сделка из потока — точка графика: цена в SOL за токен по виртуальным
   резервам кривой (так её считает сама площадка) и капитализация. */
function записатьСделку(з, j, создание = false) {
  const vSol = Number(j.vSolInBondingCurve), vTok = Number(j.vTokensInBondingCurve);
  const цена = vSol > 0 && vTok > 0 ? vSol / vTok : 0;
  if (!(цена > 0)) return;
  if (!з.сделки) з.сделки = [];
  з.сделки.push([Date.now(), цена, Number(j.solAmount) || 0, создание ? 2 : j.txType === "sell" ? 0 : 1]);
  if (з.сделки.length > СДЕЛОК_НА_ТОКЕН) з.сделки.splice(0, з.сделки.length - СДЕЛОК_НА_ТОКЕН);
}

const лента = [];                 // свежие сверху
const поАдресу = new Map();
let сокет = null;
let пауза = 1000;
let запущен = false;

// Любая ссылка на IPFS (ipfs://…, …/ipfs/<cid>…) — через быстрый шлюз.
function черезШлюз(адрес) {
  const с = String(адрес || "");
  const м = с.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/) || с.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/);
  return м ? ШЛЮЗ + м[1] : с;
}

/* Картинка и описание лежат в метаданных по ссылке из события (IPFS).
   Без картинки токен показываем сразу, она подъедет со следующим
   опросом; сервер тут же забирает и саму картинку — к телефону она
   приходит уже из памяти сервера. */
async function дочитатьМетаданные(з, попытка = 0) {
  if (!з.uri) return;
  try {
    const ответ = await fetch(черезШлюз(з.uri), { signal: AbortSignal.timeout(МЕТАДАННЫЕ_МС) });
    if (!ответ.ok) throw new Error(String(ответ.status));
    const j = await ответ.json();
    if (j && typeof j.image === "string" && /^(https?|ipfs):\/\//.test(j.image)) {
      з.картинка = черезШлюз(j.image);
      з.logo = true;
      забратьКартинку(з).catch(() => {});
    }
    if (j && typeof j.twitter === "string") з.twitter = j.twitter;
    if (j && typeof j.telegram === "string") з.telegram = j.telegram;
    if (j && typeof j.website === "string") з.website = j.website;
    з.изменён = Date.now();
  } catch {
    if (попытка < ПОВТОРЫ_МС.length) setTimeout(() => дочитатьМетаданные(з, попытка + 1), ПОВТОРЫ_МС[попытка]);
  }
}

/* Картинка в памяти сервера: уменьшенная шлюзом до 128 точек — это
   килобайты, а не мегабайты оригинала. Держим не больше, чем запусков. */
async function забратьКартинку(з) {
  const было = картинки.get(з.mint);
  if (было) return было;
  const ждём = (async () => {
    const адрес = з.картинка.startsWith(ШЛЮЗ) ? `${з.картинка}${з.картинка.includes("?") ? "&" : "?"}img-width=128&img-height=128&img-fit=cover` : з.картинка;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(адрес, { signal: AbortSignal.timeout(6000) });
        const тип = String(r.headers.get("content-type") || "");
        if (r.ok && /^image\//.test(тип)) {
          const байты = Buffer.from(await r.arrayBuffer());
          if (байты.length && байты.length <= КАРТИНКА_БАЙТ) {
            const готово = { байты, тип };
            картинки.set(з.mint, готово);
            return готово;
          }
        }
      } catch { /* следующая попытка */ }
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
    картинки.delete(з.mint);
    return null;
  })();
  картинки.set(з.mint, ждём);
  return ждём;
}

export async function картинкаЗапуска(mint) {
  const з = поАдресу.get(mint);
  const было = картинки.get(mint);
  if (было) return было;
  if (!з || !з.картинка) return null;
  return забратьКартинку(з);
}

function послать(тело) {
  try { if (сокет && сокет.readyState === 1) сокет.send(JSON.stringify(тело)); } catch { /* сокет закрывается */ }
}

function принять(событие) {
  let j;
  try { j = JSON.parse(String(событие.data)); } catch { return; }
  if (!j || !j.mint) return;
  if (j.txType === "create") {
    if (поАдресу.has(j.mint)) return;
    const з = {
      mint: j.mint,
      name: String(j.name || "").slice(0, 64),
      symbol: String(j.symbol || "").slice(0, 16),
      uri: typeof j.uri === "string" ? j.uri : null,
      площадка: j.pool === "bonk" ? "letsbonk" : "pump.fun",
      curve: j.bondingCurveKey || null,
      creator: j.traderPublicKey || null,
      mcapSol: Number(j.marketCapSol) || 0,
      at: Date.now(),
      изменён: Date.now(),
      logo: null,
    };
    // Первая покупка автора идёт в том же событии — это первая точка графика.
    записатьСделку(з, j, true);
    лента.unshift(з);
    поАдресу.set(з.mint, з);
    // Старые уходят — и их сделки больше не нужны.
    while (лента.length > ДЕРЖИМ) {
      const старый = лента.pop();
      поАдресу.delete(старый.mint);
      картинки.delete(старый.mint);
    }
    послать({ method: "subscribeTokenTrade", keys: [з.mint] });
    дочитатьМетаданные(з);
    return;
  }
  // Сделка по токену, за которым следим: капитализация после неё.
  const з = поАдресу.get(j.mint);
  if (з && Number(j.marketCapSol) > 0) {
    з.mcapSol = Number(j.marketCapSol);
    з.изменён = Date.now();
    записатьСделку(з, j);
  }
}

// Раз в минуту отпускаем сделки токенов старше десяти минут.
function отпуститьСтарые() {
  const граница = Date.now() - СЛЕДИМ_МС;
  const ключи = лента.filter((з) => з.at < граница && !з.отпущен).map((з) => { з.отпущен = true; return з.mint; });
  if (ключи.length) послать({ method: "unsubscribeTokenTrade", keys: ключи });
}

function подключить() {
  if (typeof WebSocket === "undefined") { console.warn("[запуски] в этом Node нет WebSocket"); return; }
  сокет = new WebSocket(АДРЕС);
  сокет.onopen = () => {
    пауза = 1000;
    послать({ method: "subscribeNewToken" });
    // После переподключения — снова сделки тех, кого ещё сопровождаем.
    const свежие = лента.filter((з) => !з.отпущен).map((з) => з.mint);
    if (свежие.length) послать({ method: "subscribeTokenTrade", keys: свежие });
  };
  сокет.onmessage = принять;
  сокет.onclose = () => {
    сокет = null;
    setTimeout(подключить, пауза);
    пауза = Math.min(30_000, пауза * 2);
  };
  сокет.onerror = () => { try { сокет && сокет.close(); } catch { /* уже закрыт */ } };
}

export function запуститьЛентуЗапусков() {
  if (запущен) return false;
  запущен = true;
  подключить();
  setInterval(отпуститьСтарые, 60_000).unref?.();
  return true;
}

/* Запуски новее отметки — в виде строк ленты приложения. Отметка — время
   прошлого ответа: телефон спрашивает раз в секунду и получает только
   новое и изменившееся. */
export function свежиеЗапуски(после = 0) {
  return лента
    .filter((з) => з.изменён > после)
    .slice(0, 80)
    .map((з) => ({
      mint: з.mint, name: з.name, symbol: з.symbol, platform: з.площадка,
      // Картинка — со своего сервера (см. забратьКартинку).
      logo: з.logo ? `/api/new-launches?logo=${з.mint}` : null,
      curve: з.curve, creator: з.creator, mcapSol: з.mcapSol, createdAt: new Date(з.at).toISOString(),
      twitter: з.twitter || null, telegram: з.telegram || null, website: з.website || null,
    }));
}

/* Сделки токена с момента создания — для графика на его странице.
   [время мс, цена в SOL, сумма в SOL, 1 покупка / 0 продажа / 2 создание]. */
export function сделкиЗапуска(mint) {
  const з = поАдресу.get(mint);
  return з ? { createdAt: з.at, mcapSol: з.mcapSol, trades: з.сделки || [] } : null;
}

export function лентаЖива() { return !!(сокет && сокет.readyState === 1); }
