// Картинка для описания бота (BotFather, строго 640×360): кадр интро ролика
// с растущим графиком на фоне — график кладётся в общий фон, под телефон и виджеты.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:8766/promo/index.html");
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.evaluate(async () => {
  // настоящие OHLC-свечи: у каждой свои open/high/low/close, поэтому тела
  // разной длины, а тени торчат с обеих сторон на разную величину — как
  // в реальном терминале. Общий тренд вверх, но с естественными откатами.
  let s = 20260102;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // тела заданы вручную — явно разной длины, ни одно не короткое, без повторов;
  // тени тоже разные сверху и снизу
  const BODIES = [260, 420, 200, 480, 320, 380, 240];
  const WUP = [40, 16, 70, 22, 52, 18, 60];
  const WDN = [24, 60, 18, 46, 28, 70, 20];
  const N = BODIES.length;
  const W = 1920, H = 1080, x0 = 60, step = (W - 120) / N;
  const bw = step * 0.44;
  let price = 0, lo = 1e9, hi = -1e9;
  const cs = [];
  for (let i = 0; i < N; i++) {
    const open = price;
    const close = open + BODIES[i];      // только зелёные, длина берётся из набора
    const high = close + WUP[i];
    const low = open - WDN[i];
    cs.push({ open, close, high, low, up: true });
    price = close;
    lo = Math.min(lo, low); hi = Math.max(hi, high);
  }
  // масштаб по факту — график растянут почти на всю высоту кадра
  const padT = 60, padB = 90, y = (val) => padT + (hi - val) / (hi - lo) * (H - padT - padB);
  let h = "";
  cs.forEach((c, i) => {
    const cx = x0 + i * step + step / 2;
    const top = y(Math.max(c.open, c.close)), bot = y(Math.min(c.open, c.close));
    const col = c.up ? "#00E96B" : "#FF3B47";
    h += `<line x1="${cx}" x2="${cx}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${col}" stroke-width="5"/>`;
    h += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(7, bot - top)}" rx="4" fill="${col}"/>`;

  });
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;opacity:.4">${h}</svg>`;
  const bg = document.getElementById("root").firstElementChild;
  bg.insertAdjacentHTML("beforeend", svg);
  window.renderAt(150 / 30);
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await page.screenshot({ path: "renders/bf/bot-chart-1080.png" });
await browser.close();
