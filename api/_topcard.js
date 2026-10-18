/* Картинка «Мемкоины в тренде» — та, что уходит над списком /top.
 *
 * От остальных баннеров она отличается тем, что не лежит готовой в
 * public: пятёрка в ней живая и меняется вместе с рынком, поэтому
 * картинка собирается на запрос. Шапка при этом остаётся картинкой —
 * знак, заголовок и монеты от запроса к запросу те же, рисовать их
 * вектором заново значило бы держать вторую, заведомо более бедную
 * версию того же самого.
 *
 * Растр делает resvg: браузер ради одной картинки — это секунды на
 * запрос и сотни мегабайт в функции, а здесь нужен только текст,
 * скруглённые плашки и вшитые логотипы.
 *
 * Разметка пишется под resvg, а не под браузер: у него нет CSS, поэтому
 * шрифты передаются буферами, а обрезка логотипа по кругу сделана
 * элементом clipPath, а не свойством clip-path.
 */

import fs from "node:fs";
import path from "node:path";

const Ц = {
  плашка: "#111214",
  обвод: "#202227",
  текст: "#F4F3EF",
  тусклый: "#8D8B86",
  акцент: "#E4E2DC",
  светлый: "#E4E2DC",
  ton: "#0098EA",
  sol1: "#9945FF",
  sol2: "#14F195",
  рост: "#2ED47A",
  падение: "#FF5C6C",
};

const шрифт = "Montserrat, Arial, sans-serif";
const Ш = 1080;
const ШАПКА_Ш = 1190;
const ШАПКА_В = 452;

/* Файлы берём с диска, а если его нет — по http с самого сайта.
 *
 * На своём сервере рядом лежит весь репозиторий, и чтение мгновенно. В
 * функции площадки соседних файлов может не оказаться вовсе, поэтому там
 * работает второй путь: та же шапка и те же шрифты раздаются сайтом.
 * Прочитанное остаётся в памяти — процесс живёт долго, и второй раз это
 * уже бесплатно. */
const склад = new Map();

async function файл(отДиска, отСайта, адресСайта) {
  if (склад.has(отДиска)) return склад.get(отДиска);
  let байты = null;
  try {
    байты = fs.readFileSync(path.join(process.cwd(), отДиска));
  } catch {
    try {
      const ответ = await fetch(`${адресСайта}/${отСайта}`);
      if (ответ.ok) байты = Buffer.from(await ответ.arrayBuffer());
    } catch { /* сайт не ответил — вернём null, картинки не будет */ }
  }
  if (байты) склад.set(отДиска, байты);
  return байты;
}

const деньги = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const экран = (с) => String(с || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Знак сети рядом с токеном: по нему видно, в какой цепочке он живёт.
   Без него две ленты в одном списке не различить. */
function знакСети(сеть, x, y, r = 16) {
  if (сеть === "solana") {
    return `<g transform="translate(${x}, ${y})">
      <circle r="${r}" fill="#111214" stroke="${Ц.sol1}" stroke-opacity="0.8" stroke-width="1.5"/>
      <g transform="translate(-9.5, -7) scale(0.048)" fill="url(#солГрад)">
        <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
        <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
        <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/>
      </g>
    </g>`;
  }
  return `<g transform="translate(${x}, ${y})">
    <circle r="${r}" fill="${Ц.ton}"/>
    <g transform="translate(-11, -11) scale(0.39)" fill="#ffffff">
      <path d="M37.56 15.63H18.44c-3.52 0-5.74 3.79-3.98 6.86l11.8 20.45c.77 1.34 2.7 1.34 3.47 0l11.8-20.45c1.77-3.06-.45-6.86-3.97-6.86zM26.25 36.81l-2.57-4.98-6.2-11.09c-.41-.71.1-1.62.95-1.62h7.82v17.69zm12.26-16.07l-6.2 11.1-2.57 4.97V19.12h7.82c.85 0 1.36.91.95 1.62z"/>
    </g>
  </g>`;
}

/* Логотип монеты. Картинку вшиваем прямо в разметку: растровщик в сеть
   не ходит, да и ждать чужие домены при отрисовке нельзя. Не отдалась —
   рисуем кружок с двумя буквами тикера, как в приложении. */
async function логотип(url, тикер, r, номер) {
  if (url) {
    try {
      const ответ = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (ответ.ok) {
        const тип = ответ.headers.get("content-type") || "image/png";
        const b64 = Buffer.from(await ответ.arrayBuffer()).toString("base64");
        return `<clipPath id="круг${номер}"><circle r="${r}"/></clipPath>
          <image href="data:${тип};base64,${b64}" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}"
            preserveAspectRatio="xMidYMid slice" clip-path="url(#круг${номер})"/>`;
      }
    } catch { /* чужой сервер молчит — не беда */ }
  }
  return `<circle r="${r}" fill="#1A1B1F"/>
    <text y="${r * 0.34}" text-anchor="middle" fill="${Ц.тусклый}" font-family="${шрифт}"
      font-size="${r * 0.8}" font-weight="700">${экран(String(тикер || "?").slice(0, 2).toUpperCase())}</text>`;
}

async function разметка(строки, адресСайта) {
  const шапкаПng = await файл("public/top-header.png", "top-header.png", адресСайта);
  // Высота шапки — от ширины: картинка ложится во всю ширину без обрезки.
  const шапка = шапкаПng ? Math.round((ШАПКА_В * Ш) / ШАПКА_Ш) : 0;
  const шагСтроки = 128;
  const В = шапка + 22 + строки.length * шагСтроки + 90;

  // Логотипы тянем разом: пять чужих серверов по очереди — это пять
  // ожиданий подряд, а у обработчика вебхука есть свой предел времени.
  const логотипы = await Promise.all(строки.map((т, i) => логотип(т.лого, т.тикер, 38, i)));

  const плашки = [];
  for (let i = 0; i < строки.length; i++) {
    const т = строки[i];
    const y = шапка + 22 + i * шагСтроки;
    const лого = логотипы[i];
    плашки.push(`<g transform="translate(60, ${y})">
      <rect width="960" height="104" rx="52" fill="${Ц.плашка}" stroke="${Ц.обвод}" stroke-width="1.5"/>
      <circle cx="66" cy="52" r="30" fill="#1A1B1F"/>
      <text x="66" y="62" text-anchor="middle" fill="${Ц.светлый}" font-family="${шрифт}" font-size="27" font-weight="800">${i + 1}</text>
      <g transform="translate(158, 52)">${лого}</g>
      ${знакСети(т.сеть, 186, 78, 16)}
      <text x="222" y="46" fill="${Ц.текст}" font-family="${шрифт}" font-size="34" font-weight="800">$${экран(т.тикер)}</text>
      <text x="222" y="78" fill="${Ц.тусклый}" font-family="${шрифт}" font-size="22" font-weight="500">${экран(т.имя)}</text>
      <text x="900" y="46" text-anchor="end" fill="${т.движение >= 0 ? Ц.рост : Ц.падение}" font-family="${шрифт}"
        font-size="28" font-weight="700">${т.движение >= 0 ? "+" : ""}${т.движение.toFixed(1)}%</text>
      <text x="900" y="78" text-anchor="end" fill="${Ц.тусклый}" font-family="${шрифт}" font-size="21" font-weight="500">${деньги(т.объём)} за сутки</text>
    </g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Ш}" height="${В}" viewBox="0 0 ${Ш} ${В}">
  <defs>
    <linearGradient id="фон" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="55%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <linearGradient id="стык" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="1"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="солГрад" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="${Ц.sol1}"/>
      <stop offset="100%" stop-color="${Ц.sol2}"/>
    </linearGradient>
  </defs>

  <rect width="${Ш}" height="${В}" fill="url(#фон)"/>
  ${шапкаПng ? `<image href="data:image/png;base64,${шапкаПng.toString("base64")}" x="0" y="0" width="${Ш}" height="${шапка}"/>` : ""}
  <!-- Свечение шапки продолжается вниз и гаснет: без этого на её нижнем
       крае была видна ступенька — картинка чуть светлее фона. -->
  <rect x="0" y="${шапка - 2}" width="${Ш}" height="96" fill="url(#стык)"/>

  ${плашки.join("\n  ")}

  <text x="${Ш / 2}" y="${В - 36}" text-anchor="middle" fill="${Ц.тусклый}" font-family="${шрифт}"
    font-size="24" font-weight="500" opacity="0.75">mintly.company</text>
</svg>`;
}

/* Пятёрка собирается из обеих сетей, а не просто по обороту подряд:
   Solana торгует на порядок больше, и общий список выходил бы целиком из
   неё — а показать нужно обе. Поэтому берём лучших в каждой и сводим
   вместе.
   Одинаковые тикеры схлопываем: у токена бывает несколько пулов, и
   список превращался в один и тот же STONK дважды. */
async function лучшие(кл, цепь, сколько) {
  const { data } = await кл
    .from("feed_cache")
    .select("chain, name, ticker, logo_url, vol24, change24")
    .eq("chain", цепь)
    .order("vol24", { ascending: false })
    .limit(40);
  const видели = new Set();
  const итог = [];
  for (const r of data || []) {
    if (!r.ticker || !r.name) continue;
    const т = String(r.ticker).toUpperCase().slice(0, 10);
    if (видели.has(т)) continue;
    видели.add(т);
    итог.push({
      сеть: цепь === "solana" ? "solana" : "ton",
      имя: String(r.name).slice(0, 28),
      тикер: т,
      лого: r.logo_url,
      объём: Number(r.vol24) || 0,
      движение: Number(r.change24) || 0,
    });
    if (итог.length >= сколько) break;
  }
  return итог;
}

export async function топСтроки(кл) {
  const [сол, тон] = await Promise.all([лучшие(кл, "solana", 3), лучшие(кл, "ton", 2)]);
  return [...сол, ...тон].sort((a, b) => b.объём - a.объём);
}

/* Готовая картинка.
 *
 * Держим её недолго: список живой, но за минуту рынок не переворачивается,
 * а десять человек подряд, нажавших «Топ», не должны каждый раз тянуть
 * логотипы с чужих серверов и заново растрировать. */
const КЕШ_МС = 60 * 1000;
let кеш = { время: 0, байты: null, строки: null };

export async function картинкаТопа(строки, адресСайта = "https://mintly.company") {
  const ключ = строки.map((т) => `${т.тикер}${т.объём.toFixed(0)}${т.движение.toFixed(1)}`).join("|");
  if (кеш.байты && кеш.ключ === ключ && Date.now() - кеш.время < КЕШ_МС) return кеш.байты;

  let Resvg;
  try {
    ({ Resvg } = await import("@resvg/resvg-js"));
  } catch (err) {
    console.warn("[топ] нет resvg:", err && err.message);
    return null;
  }

  /* Шрифты вшиты в код, а не забираются с сайта.
     По сети до функции на площадке не доехал ни один из шести файлов, и
     картинка пришла людям вообще без единой буквы: resvg молча
     пропускает текст, когда шрифта под него нет. Байты рядом с кодом
     потерять уже нечему. */
  const { ШРИФТЫ } = await import("./_fonts.js");

  try {
    const svg = await разметка(строки, адресСайта);
    const рисунок = new Resvg(svg, {
      font: {
        fontBuffers: ШРИФТЫ,
        defaultFontFamily: "Montserrat",
        // Системных шрифтов на сервере может не быть вовсе, а поиск по
        // ним стоит времени на каждом запуске.
        loadSystemFonts: false,
      },
    });
    const байты = Buffer.from(рисунок.render().asPng());
    кеш = { время: Date.now(), байты, ключ };
    return байты;
  } catch (err) {
    console.warn("[топ] картинка не собралась:", err && err.message);
    return null;
  }
}
