// Картинка для описания бота (BotFather, строго 640×360): кадр интро ролика
// с растущим графиком на фоне — график кладётся в общий фон, под телефон и виджеты.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:8766/promo/index.html");
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.evaluate(async () => {
  // свечи растут слева направо с откатами, как у свежего токена на подъёме;
  // стоят плотно (узкий зазор) и крупные — тело и тени заметные
  const W = 1920, H = 1080, N = 64, x0 = 20, step = (W - 40) / N;
  const bw = step * 0.78; // тело почти во всю ячейку — свечи близко друг к другу
  let v = 20, s = 7, h = "";
  const pts = [];
  for (let i = 0; i < N; i++) {
    s = (s * 16807) % 2147483647; const r = s / 2147483647;
    const o = v;
    // крупный шаг + заметный размах внутри свечи → длинные тела и тени
    v = v + (r - 0.32) * 30 + Math.pow(i / N, 1.8) * 34;
    const up = v >= o, cx = x0 + i * step + step / 2;
    const y = (val) => 1010 - val * 1.28;
    const top = y(Math.max(o, v)), bot = y(Math.min(o, v));
    const col = up ? "#00E96B" : "#FF3B47";
    h += `<line x1="${cx}" x2="${cx}" y1="${top - 18 - r * 34}" y2="${bot + 16 + r * 28}" stroke="${col}" stroke-width="4"/>`;
    h += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(6, bot - top)}" rx="3" fill="${col}"/>`;
    pts.push(`${cx},${y(v)}`);
  }
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;opacity:.32">
    <polyline points="${pts.join(" ")}" fill="none" stroke="#5A8CFF" stroke-width="4" stroke-linejoin="round"/>${h}</svg>`;
  const bg = document.getElementById("root").firstElementChild;
  bg.insertAdjacentHTML("beforeend", svg);
  window.renderAt(150 / 30);
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
});
await page.screenshot({ path: "renders/bf/bot-chart-1080.png" });
await browser.close();
