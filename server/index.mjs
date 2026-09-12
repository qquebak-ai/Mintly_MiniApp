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
const ПОРТ = Number(process.env.PORT) || 8080;

/* Кому разрешено обращаться. Браузер спросит об этом на каждом запросе с
   чужого домена, а домен у сайта и правда чужой: страницы отдаёт CDN, а
   API живёт здесь. */
const СВОИ = (process.env.ALLOW_ORIGINS || "https://mintly.company,https://www.mintly.company")
  .split(",")
  .map((с) => с.trim())
  .filter(Boolean);

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
 * и собранные страницы из dist: одно место, куда идёт выкладка, и
 * никакого ожидания чужой очереди сборки.
 *
 * Всё, что не файл, отдаётся как index.html: адреса вроде /pro и /app
 * разбирает само приложение в браузере, и без этого обновление страницы
 * на них давало бы 404. */
const САЙТ = path.join(корень, "dist");

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

function отдатьФайл(res, файл, кеш) {
  const тип = ТИПЫ[path.extname(файл).toLowerCase()] || "application/octet-stream";
  let байты;
  try { байты = fs.readFileSync(файл); } catch { return false; }
  res.setHeader("Content-Type", тип);
  res.setHeader("Cache-Control", кеш);
  res.status(200).end(байты);
  return true;
}

function отдатьСайт(res, путь) {
  if (!fs.existsSync(САЙТ)) return false;
  /* Путь из запроса нормализуем и держим внутри dist: «..» в адресе не
     должно выводить за пределы каталога сайта.

     Сравниваем не по началу строки, а по границе каталога: «начинается
     с /srv/app/dist» верно и для соседней папки /srv/app/dist-old, и
     через неё читались бы чужие файлы. Разбор адреса тоже в try: на
     «%ZZ» decodeURIComponent бросает, и запрос ронял обработчик вместо
     честного отказа. */
  let внутри;
  try {
    внутри = path.normalize(path.join(САЙТ, decodeURIComponent(путь)));
  } catch {
    return отдатьФайл(res, path.join(САЙТ, "index.html"), "no-cache, no-store, must-revalidate");
  }
  const своё = внутри === САЙТ || внутри.startsWith(САЙТ + path.sep);
  if (своё && fs.existsSync(внутри) && fs.statSync(внутри).isFile()) {
    // Файлы с отпечатком в имени (assets/index-XXXX.js) не меняются
    // никогда — их можно держать в кеше браузера год. Всё остальное
    // перепроверяем.
    const навсегда = /\/assets\//.test(путь) || /\.(woff2|png|jpg|jpeg|webp|svg|ico)$/.test(путь);
    return отдатьФайл(res, внутри, навсегда ? "public, max-age=31536000, immutable" : "no-cache");
  }
  /* Файла нет. Если просили ресурс сборки — отвечаем «нет», а не
     страницей приложения: браузер, получив HTML вместо кода, ругается
     «text/html не годится в JavaScript» и встаёт намертво. Честный 404
     страница ловит сама и перечитывает себя заново (см. index.html).

     Всё остальное — адрес внутри приложения, его разбирает сам сайт. */
  if (/\.(js|mjs|css|json|map|woff2?|png|jpe?g|webp|svg|ico)$/i.test(путь)) {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).end("not found");
    return true;
  }
  return отдатьФайл(res, path.join(САЙТ, "index.html"), "no-cache, no-store, must-revalidate");
}

const сервер = http.createServer(async (req, res) => {
  const адрес = new URL(req.url, "http://x");
  дополнить(res);

  const откуда = req.headers.origin;
  if (откуда && СВОИ.includes(откуда)) {
    res.setHeader("Access-Control-Allow-Origin", откуда);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
      if (!адрес.pathname.startsWith("/api/") && отдатьСайт(res, адрес.pathname)) return;
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

сервер.listen(ПОРТ, () => console.log(`[сервер] порт ${ПОРТ}, маршрутов ${маршруты.size}`));

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

/* Уведомления о покупках — тем же способом.
 *
 * Их тоже звал чужой планировщик, и там же ломался: секрет в настройках
 * репозитория и секрет на площадке разъезжались, а видно это было только
 * в списке запусков красными крестиками. Здесь звать некому — обработчик
 * вызывается изнутри, и секрет заведомо тот же самый. */
const ШАГ_ВЕСТЕЙ_МС = Number(process.env.NOTIFY_INTERVAL_MS) || 10 * 60 * 1000;

if (process.env.TELEGRAM_BOT_TOKEN && process.env.NOTIFY_LOOP !== "0") {
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
