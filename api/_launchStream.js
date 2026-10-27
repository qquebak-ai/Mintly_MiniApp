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
const МЕТАДАННЫЕ_МС = 2500;

const лента = [];                 // свежие сверху
const поАдресу = new Map();
let сокет = null;
let пауза = 1000;
let запущен = false;

/* Картинка и описание лежат в метаданных по ссылке из события (IPFS).
   Ждём их недолго: без картинки токен всё равно показываем сразу, а она
   подъедет со следующим опросом. */
async function дочитатьМетаданные(з) {
  if (!з.uri) return;
  try {
    const ответ = await fetch(з.uri, { signal: AbortSignal.timeout(МЕТАДАННЫЕ_МС) });
    const j = await ответ.json();
    if (j && typeof j.image === "string") з.logo = j.image.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/");
    if (j && typeof j.twitter === "string") з.twitter = j.twitter;
    if (j && typeof j.telegram === "string") з.telegram = j.telegram;
    if (j && typeof j.website === "string") з.website = j.website;
    з.изменён = Date.now();
  } catch {
    // IPFS в первые секунды часто ещё не раздаёт файл — вторая попытка
    // через пять секунд, третьей нет.
    if (!з.повтор) { з.повтор = true; setTimeout(() => дочитатьМетаданные(з), 5000); }
  }
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
    лента.unshift(з);
    поАдресу.set(з.mint, з);
    // Старые уходят — и их сделки больше не нужны.
    while (лента.length > ДЕРЖИМ) {
      const старый = лента.pop();
      поАдресу.delete(старый.mint);
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
      mint: з.mint, name: з.name, symbol: з.symbol, logo: з.logo, platform: з.площадка,
      curve: з.curve, creator: з.creator, mcapSol: з.mcapSol, createdAt: new Date(з.at).toISOString(),
      twitter: з.twitter || null, telegram: з.telegram || null, website: з.website || null,
    }));
}

export function лентаЖива() { return !!(сокет && сокет.readyState === 1); }
