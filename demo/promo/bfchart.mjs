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
  let s = 1234567;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const W = 1920, H = 1080, N = 26, x0 = 24, step = (W - 48) / N;
  const bw = step * 0.56;
  let price = 60, lo = 1e9, hi = -1e9;
  const cs = [];
  for (let i = 0; i < N; i++) {
    const open = price;
    const drift = 8 + Math.pow(i / N, 1.3) * 10;          // лёгкий уклон вверх
    const body = (rnd() - 0.42) * 60 + drift;              // тело: то больше, то меньше, иногда красное
    const close = open + body;
    const up = close >= open;
    // тени с двух сторон — независимые и разной длины
    const wickUp = rnd() * rnd() * 46 + 2;
    const wickDn = rnd() * rnd() * 46 + 2;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDn;
    cs.push({ open, close, high, low, up });
    price = close;
    lo = Math.min(lo, low); hi = Math.max(hi, high);
  }
  // масштаб по факту — график растянут почти на всю высоту кадра
  const padT = 70, padB = 110, y = (val) => padT + (hi - val) / (hi - lo) * (H - padT - padB);
  let h = ""; const pts = [];
  cs.forEach((c, i) => {
    const cx = x0 + i * step + step / 2;
    const top = y(Math.max(c.open, c.close)), bot = y(Math.min(c.open, c.close));
    const col = c.up ? "#00E96B" : "#FF3B47";
    h += `<line x1="${cx}" x2="${cx}" y1="${y(c.high)}" y2="${y(c.low)}" stroke="${col}" stroke-width="5"/>`;
    h += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(7, bot - top)}" rx="4" fill="${col}"/>`;
    pts.push(`${cx},${y(c.close)}`);
  });
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;opacity:.4">
    <polyline points="${pts.join(" ")}" fill="none" stroke="#5A8CFF" stroke-width="6" stroke-linejoin="round"/>${h}</svg>`;
  const bg = document.getElementById("root").firstElementChild;
  bg.insertAdjacentHTML("beforeend", svg);
  window.renderAt(150 / 30);
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await page.screenshot({ path: "renders/bf/bot-chart-1080.png" });
await browser.close();
