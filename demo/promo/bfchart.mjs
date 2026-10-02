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
  // ДЛИНА СВЕЧИ ЗАДАНА ПРЯМО В ПИКСЕЛЯХ (без автомасштаба) — поэтому они
  // действительно длинные; свечей много, тренд уходит по диагонали вверх,
  // крайние слегка выходят за кадр. Только зелёные, тела разной длины.
  const BODYpx = [150, 215, 125, 240, 170, 200, 135, 225, 165, 190, 130, 220, 160, 205];
  const WUPpx = [36, 14, 60, 20, 48, 16, 66, 22, 40, 18, 56, 24, 44, 30];
  const WDNpx = [22, 54, 16, 42, 26, 62, 18, 48, 14, 58, 20, 46, 28, 50];
  const N = BODYpx.length;
  const W = 1920, H = 1080, x0 = 50, step = (W - 100) / N;
  const bw = step * 0.4;
  // накапливаем пиксельную высоту (каждая свеча двигает цену вверх),
  // потом центрируем так, чтобы средние свечи были по центру кадра
  const yClose = []; let acc = 0;
  for (let i = 0; i < N; i++) { acc += BODYpx[i]; yClose.push(acc); }
  const mid = yClose[Math.floor(N / 2)];
  const baseY = H / 2 + mid;                 // перенос: центр графика ~ середина кадра
  let h = "";
  for (let i = 0; i < N; i++) {
    const cx = x0 + i * step + step / 2;
    const closeY = baseY - yClose[i];
    const openY = closeY + BODYpx[i];        // тело: открытие ниже закрытия (зелёная)
    h += `<line x1="${cx}" x2="${cx}" y1="${closeY - WUPpx[i]}" y2="${openY + WDNpx[i]}" stroke="#00E96B" stroke-width="5"/>`;
    h += `<rect x="${cx - bw / 2}" y="${closeY}" width="${bw}" height="${BODYpx[i]}" rx="4" fill="#00E96B"/>`;
  }
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;opacity:.4">${h}</svg>`;
  const bg = document.getElementById("root").firstElementChild;
  bg.insertAdjacentHTML("beforeend", svg);
  window.renderAt(150 / 30);
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await page.screenshot({ path: "renders/bf/bot-chart-1080.png" });
await browser.close();
