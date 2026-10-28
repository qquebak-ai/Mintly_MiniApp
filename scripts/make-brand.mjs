/* Картинки бота, превью ссылки, шапка топа и значок — в нынешнем виде
 * приложения: чёрный фон, звезда и слово MINTLY тем же шрифтом, что на
 * заставке. Старые фиолетовые картинки с прежним лого жили отдельно от
 * приложения, и человек видел в боте один бренд, а внутри — другой.
 *
 * Запуск: node scripts/make-brand.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const корень = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ЗВЕЗДА = fs.readFileSync(path.join(корень, "scripts/star-path.txt"), "utf8").trim();
const шрифт = (ф) => `data:font/woff2;base64,${fs.readFileSync(path.join(корень, "public/fonts", ф)).toString("base64")}`;

const стили = `
@font-face { font-family: Jost; font-weight: 100 900; src: url(${шрифт("jost-latin.woff2")}) format("woff2"); }
@font-face { font-family: Onest; font-weight: 100 900; src: url(${шрифт("onest-cyrillic.woff2")}) format("woff2"); unicode-range: U+0400-04FF; }
@font-face { font-family: Onest; font-weight: 100 900; src: url(${шрифт("onest-latin.woff2")}) format("woff2"); }
* { margin: 0; box-sizing: border-box; }
html, body { background: #000; color: #E4E2DC; overflow: hidden; }
.поле { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.слово { font-family: Jost, sans-serif; font-weight: 500; text-transform: uppercase; color: #E4E2DC; }
.текст { font-family: Onest, sans-serif; color: #8D8B86; font-weight: 500; text-align: center; }
.чип { font-family: Onest, sans-serif; font-weight: 600; color: #E4E2DC; background: #141519; border: 1px solid #23252B; border-radius: 999px; }
/* Едва заметное свечение под знаком: без него звезда на чистом чёрном
   смотрится вырезанной, с ним — стоит в пространстве. */
.свет { position: absolute; border-radius: 50%; background: radial-gradient(circle, rgba(228,226,220,0.09) 0%, rgba(228,226,220,0) 65%); pointer-events: none; }
`;
const знак = (р) => `<svg width="${р}" height="${р}" viewBox="25 25 150 150"><path d="${ЗВЕЗДА}" fill="#E4E2DC"/></svg>`;
const слово = (кегль) => `<div class="слово" style="font-size:${кегль}px;letter-spacing:0.36em;padding-left:0.36em">Mintly</div>`;

const кадры = [
  { имя: "start", ш: 1200, в: 760, тело: `
    <div class="поле" style="width:1200px;height:760px;gap:0">
      <div class="свет" style="width:640px;height:640px;top:20px"></div>
      ${знак(210)}
      <div style="height:34px"></div>${слово(64)}
      <div style="height:30px"></div>
      <div class="текст" style="font-size:27px">Запуск мемкоинов в TON, Solana и сетях EVM — прямо в Telegram</div>
      <div style="height:42px"></div>
      <div style="display:flex;gap:14px">
        <span class="чип" style="font-size:21px;padding:13px 26px">Свой токен за пару секунд</span>
        <span class="чип" style="font-size:21px;padding:13px 26px">Торговля с нулевой комиссией</span>
      </div>
    </div>` },
  { имя: "start-og", ш: 1200, в: 630, тело: `
    <div class="поле" style="width:1200px;height:630px">
      <div class="свет" style="width:600px;height:600px;top:-10px"></div>
      ${знак(190)}
      <div style="height:30px"></div>${слово(60)}
      <div style="height:26px"></div>
      <div class="текст" style="font-size:26px">Запуск мемкоинов в TON, Solana и сетях EVM — прямо в Telegram</div>
      <div style="height:22px"></div>
      <div class="текст" style="font-size:19px;color:#5E5D59;letter-spacing:0.08em">mintly.company</div>
    </div>` },
  { имя: "wallet", ш: 788, в: 499, тело: `
    <div class="поле" style="width:788px;height:499px">
      <div class="свет" style="width:440px;height:440px;top:-20px"></div>
      ${знак(120)}
      <div style="height:20px"></div>${слово(34)}
      <div style="height:26px"></div>
      <div style="font-family:Onest,sans-serif;font-weight:700;font-size:34px;color:#F4F3EF;letter-spacing:-0.01em">Твой крипто-кошелёк</div>
      <div style="height:10px"></div>
      <div class="текст" style="font-size:19px">TON, Solana и EVM — всё в одном месте</div>
    </div>` },
  { имя: "top-header", ш: 595, в: 226, тело: `
    <div style="position:relative;width:595px;height:226px;display:flex;align-items:center;gap:26px;padding:0 34px">
      <div class="свет" style="width:300px;height:300px;left:-40px;top:-37px"></div>
      <div style="position:relative;flex-shrink:0">${знак(118)}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${слово(20).replace("padding-left:0.36em", "padding-left:0")}
        <div style="font-family:Onest,sans-serif;font-weight:700;font-size:38px;line-height:1.05;color:#F4F3EF;letter-spacing:-0.02em">Мемкоины в тренде</div>
        <div class="текст" style="font-size:15px;text-align:left;line-height:1.35">Кто забирает внимание рынка прямо сейчас —<br/>по обороту за сутки, TON и Solana вместе</div>
      </div>
    </div>` },
  // Значок бота и кошельков TON Connect: только звезда, крупно, без слова —
  // в кружке на 40 точек слово всё равно не прочесть.
  { имя: "icon", ш: 512, в: 512, мн: 1, тело: `
    <div class="поле" style="width:512px;height:512px">${знак(340)}</div>` },
];

const б = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
// Можно перерисовать только нужные: node scripts/make-brand.mjs start
const только = process.argv.slice(2);
for (const к of кадры.filter((к) => !только.length || только.includes(к.имя))) {
  const стр = await б.newPage({ viewport: { width: к.ш, height: к.в }, deviceScaleFactor: к.мн || 2 });
  await стр.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${стили}</style></head><body>${к.тело}</body></html>`);
  await стр.evaluate(() => document.fonts.ready);
  await стр.screenshot({ path: path.join(корень, "public", `${к.имя}.png`) });
  console.log(`public/${к.имя}.png`);
  await стр.close();
}
await б.close();
