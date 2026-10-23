/* Сервер приложения для своего железа.
 *
 * На Vercel каждый обработчик — отдельная функция, которая рождается на
 * запрос и умирает после ответа. Отсюда всё, что мешало: холодный старт
 * в секунду с лишним, кеш, живущий до конца одного ответа, лимит в
 * двенадцать функций на бесплатном тарифе и расписание раз в сутки.
 *
 * Здесь тот же код работает в постоянном процессе. Обработчики не
 * переписаны: они написаны как (req, res) и вызываются напрямую, а этот
 * файл лишь подаёт им запрос в привычном виде. Отсюда три выигрыша сами
 * собой:
 *
 *   • холодных стартов нет — процесс уже поднят;
 *   • кеш внутри api/chart.js наконец живёт по-настоящему: свечи и
 *     сделки отдаются из памяти за десятки миллисекунд;
 *   • обход ленты идёт своим циклом раз в несколько секунд, а не по
 *     расписанию чужого планировщика.
 *
 * Сайт при этом остаётся на CDN: сюда ходят только за API. Раздавать
 * статику с одного сервера — значит сделать её медленнее для всех, кто
 * далеко от него.
 *
 * Запуск:  node server/index.mjs
 * Порт:    PORT (по умолчанию 8080)
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";

const корень = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Ключ tonapi, которому сервис отказал («origin is banned», 401), не
   должен ронять весь TON: без ключа те же запросы проходят, только с
   меньшим лимитом. Поэтому любой запрос к tonapi, отбитый 401 с ключом,
   тут же повторяется без него — одна страховка на все обработчики,
   вместо правки в каждом. Поток (sse) не трогаем: ему ключ нужен. */
const родной = globalThis.fetch;
globalThis.fetch = async (адрес, настройки = {}) => {
  const ответ = await родной(адрес, настройки);
  const строка = String(адрес && адрес.url ? адрес.url : адрес);
  if (ответ.status !== 401 || !/tonapi\.io\//.test(строка) || /\/sse\//.test(строка)) return ответ;
  const заголовки = new Headers(настройки.headers || {});
  if (!заголовки.has("authorization")) return ответ;
  заголовки.delete("authorization");
  return родной(адрес, { ...настройки, headers: заголовки });
};
const ПОРТ = Number(process.env.PORT) || 8080;
/* Слушаем только себя: снаружи к нам ходят через nginx. Раньше порт
   был открыт на всех адресах, и напрямую, мимо nginx, обходились и его
   ограничитель частоты, и заголовок с адресом клиента — его можно было
   прислать любым. */
const ХОСТ = process.env.HOST || "127.0.0.1";

/* Кому разрешено обращаться. Браузер спросит об этом на каждом запросе с
   чужого домена, а домен у сайта и правда чужой: страницы отдаёт CDN, а
   API живёт здесь. */
const СВОИ = (process.env.ALLOW_ORIGINS || "https://mintly.company,https://www.mintly.company")
  .split(",")
  .map((с) => с.trim())
  .filter(Boolean);

/* Свои имена сайта. Host приходит от клиента как есть: nginx пускает
   сюда и запросы с чужим именем (первый блок server — блок по
   умолчанию). А обработчики строят из него адреса — метаданных токена,
   картинок бота. Чужое имя заменяем своим. */
const СВОИ_ИМЕНА = new Set([
  ...СВОИ.map((о) => { try { return new URL(о).host; } catch { return ""; } }),
  "api.mintly.company",
  ...String(process.env.ALLOW_HOSTS || "").split(",").map((с) => с.trim()),
].filter(Boolean));
const ИМЯ_ПО_УМОЛЧАНИЮ = [...СВОИ_ИМЕНА][0] || "mintly.company";

/* Адрес клиента — один и надёжный. Обработчики считают попытки по
   первому адресу из X-Forwarded-For, а nginx лишь дописывает настоящий
   в конец присланного: «X-Forwarded-For: 1.2.3.4» от клиента делал
   каждый его запрос запросом с нового адреса, и ограничения по адресу
   не держали. Верим только X-Real-IP, который ставит сам nginx, и
   только когда запрос пришёл от него. */
function адресКлиента(req) {
  const сокет = String((req.socket && req.socket.remoteAddress) || "").replace(/^::ffff:/, "");
  const отNginx = сокет === "127.0.0.1" || сокет === "::1";
  const реальный = отNginx ? String(req.headers["x-real-ip"] || "").trim() : "";
  return /^[0-9a-f.:]{3,45}$/i.test(реальный) ? реальный : сокет;
}

/* Обработчики берём с диска: это те же файлы, что уходят на Vercel, и
   никакой отдельной копии для сервера не заводится — разъехаться им
   негде. Файлы с подчёркиванием — общие куски, а не маршруты. */
const каталог = path.join(корень, "api");
const маршруты = new Map();
for (const имя of fs.readdirSync(каталог)) {
  if (!имя.endsWith(".js") || имя.startsWith("_")) continue;
  маршруты.set(`/api/${имя.slice(0, -3)}`, path.join(каталог, имя));
}

const загружено = new Map();
async function обработчик(путь) {
  if (загружено.has(путь)) return загружено.get(путь);
  const файл = маршруты.get(путь);
  if (!файл) return null;
  const модуль = await import(pathToFileURL(файл).href);
  const ф = модуль.default;
  загружено.set(путь, ф);
  return ф;
}

/* Ответ в том виде, в каком его ждут обработчики: status().json(),
   setHeader(), send(). Разница с Vercel только в этих нескольких
   методах — сам Node их не даёт. */
function дополнить(res) {
  res.status = (код) => { res.statusCode = код; return res; };
  res.json = (тело) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(тело));
    return res;
  };
  res.send = (тело) => {
    if (тело == null) { res.end(); return res; }
    if (Buffer.isBuffer(тело) || typeof тело === "string") { res.end(тело); return res; }
    return res.json(тело);
  };
  return res;
}

/* Тело запроса. Обработчики ждут его уже разобранным — так делает
   Vercel, — и json приходит объектом, а не строкой. */
function тело(req) {
  return new Promise((готово) => {
    if (req.method === "GET" || req.method === "HEAD") { готово(undefined); return; }
    const куски = [];
    let размер = 0;
    req.on("data", (к) => {
      размер += к.length;
      // Тело больше мегабайта к нам не приходит, а вот забить память
      // чужим потоком — вполне: обрываем.
      if (размер > 1024 * 1024) { req.destroy(); return; }
      куски.push(к);
    });
    req.on("end", () => {
      const сырое = Buffer.concat(куски).toString("utf8");
      if (!сырое) { готово(undefined); return; }
      const тип = String(req.headers["content-type"] || "");
      if (тип.includes("application/json")) {
        try { готово(JSON.parse(сырое)); } catch { готово(сырое); }
        return;
      }
      if (тип.includes("application/x-www-form-urlencoded")) {
        готово(Object.fromEntries(new URLSearchParams(сырое)));
        return;
      }
      готово(сырое);
    });
    req.on("error", () => готово(undefined));
  });
}

/* Раздача самого сайта.
 *
 * Пока сайт жил на чужой площадке, серверу хватало API. Теперь он отдаёт
 * и собранные страницы: одно место, куда идёт выкладка, и никакого
 * ожидания чужой очереди сборки.
 *
 * Откуда — из www: туда выкладка (server/deploy.sh) кладёт сайт целиком
 * и проверенным, одним переименованием. Пока www нет (выкладка новой
 * схемой ещё не проходила), отдаём dist, как раньше.
 *
 * Всё, что не файл, отдаётся как index.html: адреса вроде /pro и /app
 * разбирает само приложение в браузере, и без этого обновление страницы
 * на них давало бы 404. */
function каталогСайта() {
  const www = path.join(корень, "www");
  return fs.existsSync(path.join(www, "index.html")) ? www : path.join(корень, "dist");
}

const ТИПЫ = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};
// То, что выкладка сжимает заранее (server/compress.mjs).
const СЖИМАЕМЫЕ = /\.(js|mjs|css|html|svg|json|txt|webmanifest|xml|ico|map)$/i;

/* Файлы в памяти. Раньше каждый запрос читал файл с диска заново — на
   главный файл кода это почти два мегабайта на каждое открытие. Запись
   сверяется с размером и временем файла, так что после выкладки в
   ответ идёт уже новый. */
const ПАМЯТЬ = new Map();
function прочитать(файл) {
  let ст;
  try { ст = fs.statSync(файл); } catch { return null; }
  if (!ст.isFile()) return null;
  const метка = `${ст.size.toString(36)}-${Math.floor(ст.mtimeMs).toString(36)}`;
  const было = ПАМЯТЬ.get(файл);
  if (было && было.метка === метка) return было;
  let байты;
  try { байты = fs.readFileSync(файл); } catch { return null; }
  const запись = { метка, байты };
  if (ПАМЯТЬ.size > 3000) ПАМЯТЬ.clear();
  if (ст.size < 8 * 1024 * 1024) ПАМЯТЬ.set(файл, запись);
  return запись;
}

function отдатьФайл(req, res, файл, кеш) {
  const исходный = прочитать(файл);
  if (!исходный) return false;
  const тип = ТИПЫ[path.extname(файл).toLowerCase()] || "application/octet-stream";
  /* Готовая сжатая копия, если браузер её понимает: brotli на треть
     меньше gzip, а считать ничего не нужно. Nginx уже сжатый ответ не
     трогает — второй раз его не сожмёт. */
  let запись = исходный, сжатие = null;
  if (СЖИМАЕМЫЕ.test(файл)) {
    const умеет = String(req.headers["accept-encoding"] || "");
    const br = /\bbr\b/.test(умеет) ? прочитать(файл + ".br") : null;
    const gz = !br && /\bgzip\b/.test(умеет) ? прочитать(файл + ".gz") : null;
    if (br) { запись = br; сжатие = "br"; } else if (gz) { запись = gz; сжатие = "gzip"; }
    const vary = res.getHeader("Vary");
    res.setHeader("Vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
  }
  // Метка версии: повторное открытие получает «не изменилось» без тела.
  const etag = `"${исходный.метка}${сжатие ? `-${сжатие}` : ""}"`;
  res.setHeader("Content-Type", тип);
  res.setHeader("Cache-Control", кеш);
  res.setHeader("ETag", etag);
  if (сжатие) res.setHeader("Content-Encoding", сжатие);
  if (req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  res.setHeader("Content-Length", запись.байты.length);
  res.statusCode = 200;
  res.end(req.method === "HEAD" ? undefined : запись.байты);
  return true;
}

function отдатьСайт(req, res, путь) {
  const САЙТ = каталогСайта();
  if (!fs.existsSync(САЙТ)) return false;
  // Страница всегда перепроверяется: по ней браузер узнаёт, что вышла
  // новая сборка. «no-cache» — не «не хранить», а «спроси, не
  // изменилась ли»: неизменившаяся приходит ответом без тела.
  const СТРАНИЦА = "no-cache";
  /* Путь из запроса нормализуем и держим внутри каталога сайта: «..» в
     адресе не должно выводить за его пределы.

     Сравниваем не по началу строки, а по границе каталога: «начинается
     с /srv/app/dist» верно и для соседней папки /srv/app/dist-old, и
     через неё читались бы чужие файлы. Разбор адреса тоже в try: на
     «%ZZ» decodeURIComponent бросает, и запрос ронял обработчик вместо
     честного отказа. */
  let внутри;
  try {
    внутри = path.normalize(path.join(САЙТ, decodeURIComponent(путь)));
  } catch {
    return отдатьФайл(req, res, path.join(САЙТ, "index.html"), СТРАНИЦА);
  }
  const своё = внутри === САЙТ || внутри.startsWith(САЙТ + path.sep);
  if (своё && fs.existsSync(внутри) && fs.statSync(внутри).isFile()) {
    // Файлы с отпечатком в имени (assets/index-XXXX.js) не меняются
    // никогда — их можно держать в кеше браузера год. Картинки и шрифты
    // без отпечатка — неделю: их иногда перерисовывают под тем же
    // именем. Всё остальное перепроверяем.
    const кеш = /\/assets\//.test(путь) ? "public, max-age=31536000, immutable"
      : /\.(woff2|png|jpg|jpeg|webp|svg|ico)$/.test(путь) ? "public, max-age=604800, stale-while-revalidate=86400"
      : внутри.endsWith("index.html") ? СТРАНИЦА : "no-cache";
    return отдатьФайл(req, res, внутри, кеш);
  }
  /* Файла нет. Если просили ресурс сборки — отвечаем «нет», а не
     страницей приложения: браузер, получив HTML вместо кода, ругается
     «text/html не годится в JavaScript» и встаёт намертво. Честный 404
     страница ловит сама и перечитывает себя заново (см. index.html).

     Всё остальное — адрес внутри приложения, его разбирает сам сайт. */
  if (/\.(js|mjs|css|json|map|woff2?|png|jpe?g|webp|svg|ico|br|gz)$/i.test(путь)) {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).end("not found");
    return true;
  }
  return отдатьФайл(req, res, path.join(САЙТ, "index.html"), СТРАНИЦА);
}

const сервер = http.createServer(async (req, res) => {
  const адрес = new URL(req.url, "http://x");
  дополнить(res);

  const ip = адресКлиента(req);
  req.headers["x-forwarded-for"] = ip;
  req.headers["x-real-ip"] = ip;
  // X-Forwarded-Host nginx не ставит — значит, его прислал клиент.
  delete req.headers["x-forwarded-host"];
  const имя = String(req.headers.host || "").toLowerCase();
  if (!СВОИ_ИМЕНА.has(имя) && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(имя)) req.headers.host = ИМЯ_ПО_УМОЛЧАНИЮ;

  const откуда = req.headers.origin;
  if (откуда && СВОИ.includes(откуда)) {
    res.setHeader("Access-Control-Allow-Origin", откуда);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    // X-Second-Key — билет подтверждения почтой для вывода (api/_second.js):
    // без него в списке браузер не пустил бы запрос на другой домен API.
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Second-Key");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
    return;
  }

  // Проверка живости для nginx и мониторинга: отвечает без обращений к
  // базе и к чужим сервисам, чтобы не врать «жив» по чужой вине.
  if (адрес.pathname === "/health") {
    res.status(200).json({ ok: true, uptime: Math.round(process.uptime()) });
    return;
  }

  /* Возврат из Phantom.
     Кошелёк уходит на /phantom/<ключ> — на площадке это правило
     переписывания, а здесь его надо задать руками. Без него ответ
     кошелька попадал на страницу приложения, никуда не сохранялся, и
     окно, которое ждёт этот ответ, висело в загрузке до самого таймаута. */
  const фантом = адрес.pathname.match(/^\/phantom\/([A-Za-z0-9_-]{8,64})$/);
  if (фантом) {
    адрес.pathname = "/api/phantom";
    адрес.searchParams.set("action", "callback");
    адрес.searchParams.set("id", фантом[1]);
  }

  /* Загрузка обработчика — под присмотром.
     Раньше сорвавшийся импорт (недоустановленные зависимости после
     обрыва npm ci) вылетал наружу необработанным: сервер рвал
     соединение, и nginx отдавал 502 без единой строчки о причине.
     Теперь причина уходит в журнал, а клиент получает честный отказ. */
  let ф;
  try {
    ф = await обработчик(адрес.pathname);
  } catch (err) {
    console.error("[сервер] обработчик не загрузился", адрес.pathname, err && err.message);
    res.status(500).json({ error: "handler_load_failed" });
    return;
  }
  if (!ф) {
    // Не наш обработчик — пробуем отдать сайт. API живёт под /api, всё
    // остальное принадлежит страницам.
    if (req.method === "GET" || req.method === "HEAD") {
      if (!адрес.pathname.startsWith("/api/") && отдатьСайт(req, res, адрес.pathname)) return;
    }
    res.status(404).json({ error: "not_found" });
    return;
  }

  req.query = Object.fromEntries(адрес.searchParams);
  req.body = await тело(req);

  try {
    await ф(req, res);
  } catch (err) {
    console.error("[сервер]", адрес.pathname, err && err.message);
    if (!res.headersSent) res.status(500).json({ error: "internal" });
    else res.end();
  }
});

/* Соединение держим дольше, чем nginx.
 *
 * Nginx переиспользует открытые соединения к нам, а node по умолчанию
 * закрывает их через пять секунд. Кто успел первым — тот и прав: nginx
 * отправлял запрос в соединение, которое мы в этот момент закрывали, и
 * отвечал 502, хотя приложение было живо и здорово. Поэтому наш срок
 * заведомо больше nginx-овского (у него по умолчанию 60 с), а заголовки
 * ждём ещё чуть дольше — иначе тот же обрыв случится этажом выше. */
сервер.keepAliveTimeout = 65000;
сервер.headersTimeout = 66000;

сервер.listen(ПОРТ, ХОСТ, () => console.log(`[сервер] ${ХОСТ}:${ПОРТ}, маршрутов ${маршруты.size}`));

/* Обход ленты — своим циклом.
 *
 * Раньше его звал чужой планировщик по расписанию, и однажды он молчал
 * сутки, никем не замеченный. Здесь обход просто идёт по кругу: сети по
 * очереди, чтобы не выбирать лимит источника залпом, и с паузой, которую
 * можно задать одной переменной. */
/* Шаг обхода.
 *
 * У источника около тридцати запросов в минуту на адрес, а один обход
 * сети стоит примерно шести: две страницы свежих пулов и четыре
 * популярных. Каждые десять секунд — это тридцать шесть в минуту, весь
 * лимит целиком, и на свечи отдельного токена уже ничего не остаётся:
 * источник отвечал 429 всем подряд. Тридцать секунд дают двенадцать
 * запросов в минуту на ленту и оставляют запас на всё остальное. */
// Раз в три минуты. Источник ограничивает нас по адресу, и обход —
// самый жадный его потребитель: витрина от трёхминутной задержки не
// портится, а живым запросам с телефонов остаётся запас.
const ШАГ_ОБХОДА_МС = Number(process.env.FEED_INTERVAL_MS) || 180000;
const ШАГ_ПРЕДЕЛ_МС = 4 * 60 * 1000;

if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.FEED_LOOP !== "0") {
  const сети = ["ton", "solana"];
  let i = 0;
  // Пауза растёт, пока источник отказывает, и возвращается к обычной,
  // как только он отвечает: молотить в закрытую дверь с прежней частотой
  // — это ещё и мешать самому себе, отказы считаются в тот же лимит.
  let пауза = ШАГ_ОБХОДА_МС;
  const шаг = async () => {
    const сеть = сети[i++ % сети.length];
    let собрано = null;
    try {
      const ф = await обработчик("/api/refresh-feed");
      // Свой вызов идёт с секретом: обход по кругу не должен упираться
      // в защиту от частых просьб снаружи.
      const запрос = {
        method: "GET",
        url: `/api/refresh-feed?chain=${сеть}`,
        query: { chain: сеть },
        headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
      };
      const ответ = дополнить({
        statusCode: 200,
        headersSent: false,
        setHeader() {},
        end() { this.headersSent = true; },
      });
      // Перехватываем тело ответа: по числу собранных строк видно, отдал
      // источник данные или отбился.
      const прежний = ответ.json.bind(ответ);
      ответ.json = (тело) => { собрано = тело; return прежний(тело); };
      await ф(запрос, ответ);
    } catch (err) {
      console.warn("[обход]", сеть, err && err.message);
    } finally {
      const пусто = !собрано || (!собрано[сеть] && !собрано[`${сеть}_new`] && !собрано["пропущено"]);
      пауза = пусто ? Math.min(ШАГ_ПРЕДЕЛ_МС, Math.round(пауза * 1.6)) : ШАГ_ОБХОДА_МС;
      if (пусто) console.warn(`[обход] ${сеть} без данных, следующий заход через ${Math.round(пауза / 1000)} с`);
      setTimeout(шаг, пауза);
    }
  };
  setTimeout(шаг, 2000);
  console.log(`[обход] цикл раз в ${Math.round(ШАГ_ОБХОДА_МС / 1000)} с, сети по очереди`);
}

/* Обход кривых — тем же способом.
 *
 * Ленту с биржи обходит цикл выше, а цену токена, который торгуется на
 * своей кривой, считает api/refresh-curves: без него в curve_cache
 * пусто, и на витрине у собственного токена ноль вместо цены, пустой
 * график и «сделок 0». На Vercel его звало расписание, при переезде
 * звать стало некому — и кеш встал.
 *
 * Свой круг быстрее чужого расписания: у токена на кривой цена меняется
 * каждой сделкой, а не раз в сутки. */
const ШАГ_КРИВЫХ_МС = Number(process.env.CURVES_INTERVAL_MS) || 20000;

if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.CURVES_LOOP !== "0") {
  const круг = async () => {
    try {
      const ф = await обработчик("/api/refresh-curves");
      const ответ = дополнить({
        statusCode: 200,
        headersSent: false,
        setHeader() {},
        end() { this.headersSent = true; },
      });
      await ф(
        { method: "GET", url: "/api/refresh-curves", query: {}, headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` } },
        ответ
      );
    } catch (err) {
      console.warn("[кривые]", err && err.message);
    } finally {
      setTimeout(круг, ШАГ_КРИВЫХ_МС);
    }
  };
  setTimeout(круг, 3000);
  console.log(`[кривые] цикл раз в ${Math.round(ШАГ_КРИВЫХ_МС / 1000)} с`);
}

/* Выход на биржу — тем же способом.
 *
 * Кривая Solana, набравшая порог, сама не закрывается: закрыть её зовёт
 * api/wallet-solana (action=graduate), и на Vercel это делало
 * расписание — при переезде звать стало некому. Здесь же сразу после
 * закрытия сервер заводит пул на Raydium и сжигает LP-токены
 * (api/solana-migrate.js), как pump.fun. */
const ШАГ_ВЫХОДА_МС = Number(process.env.GRADUATE_INTERVAL_MS) || 30000;

if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.GRADUATE_LOOP !== "0") {
  const круг = async () => {
    try {
      const ф = await обработчик("/api/wallet-solana");
      const ответ = дополнить({ statusCode: 200, headersSent: false, setHeader() {}, end() { this.headersSent = true; } });
      await ф(
        { method: "GET", url: "/api/wallet-solana?action=graduate", query: { action: "graduate" }, headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` } },
        ответ
      );
      const { вывестиНаБиржу } = await import("../api/solana-migrate.js");
      await вывестиНаБиржу();
    } catch (err) {
      console.warn("[выход на DEX]", err && err.message);
    }
    // TON — отдельной попыткой: сбой Solana не должен держать выход TON.
    try {
      const { вывестиTonНаБиржу, записатьЦеныПулов, отказыСтарыхТокенов } = await import("../api/ton-migrate.js");
      await вывестиTonНаБиржу();
      await записатьЦеныПулов();
      await отказыСтарыхТокенов();
    } catch (err) {
      console.warn("[выход TON]", err && err.message);
    } finally {
      setTimeout(круг, ШАГ_ВЫХОДА_МС);
    }
  };
  setTimeout(круг, 8000);
  console.log(`[выход на DEX] цикл раз в ${Math.round(ШАГ_ВЫХОДА_МС / 1000)} с`);
}

/* Уведомления о покупках — тем же способом.
 *
 * Их тоже звал чужой планировщик, и там же ломался: секрет в настройках
 * репозитория и секрет на площадке разъезжались, а видно это было только
 * в списке запусков красными крестиками. Здесь звать некому — обработчик
 * вызывается изнутри, и секрет заведомо тот же самый. */
const ШАГ_ВЕСТЕЙ_МС = Number(process.env.NOTIFY_INTERVAL_MS) || 10 * 60 * 1000;

// Рассылку шлёт бот MintlyTrading — его и проверяем. Раньше условие
// смотрело на токен основного бота: тот на сервере есть всегда, и цикл
// заводился исправно, но каждый раз падал внутри — /api/notify без
// TRADING_BOT_TOKEN отвечает 500, и об этом никто не узнавал.
if (process.env.TRADING_BOT_TOKEN && process.env.NOTIFY_LOOP !== "0") {
  const весть = async () => {
    try {
      const ф = await обработчик("/api/notify");
      const ответ = дополнить({
        statusCode: 200,
        headersSent: false,
        setHeader() {},
        end() { this.headersSent = true; },
      });
      await ф(
        { method: "POST", url: "/api/notify", query: {}, body: {}, headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` } },
        ответ
      );
    } catch (err) {
      console.warn("[вести]", err && err.message);
    } finally {
      setTimeout(весть, ШАГ_ВЕСТЕЙ_МС);
    }
  };
  setTimeout(весть, 30000);
  console.log(`[вести] цикл раз в ${Math.round(ШАГ_ВЕСТЕЙ_МС / 60000)} мин`);
}

for (const сигнал of ["SIGINT", "SIGTERM"]) {
  process.on(сигнал, () => {
    console.log(`[сервер] ${сигнал}, закрываемся`);
    сервер.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
