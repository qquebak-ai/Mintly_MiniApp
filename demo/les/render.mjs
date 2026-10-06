// Кадры ролика через Chromium. node render.mjs snap 3,12.5,16.3 — проверочные снимки;
// node render.mjs frames 0,120 — кадры 0…119 (снятые не трогаем, можно дорендерить).
import { chromium } from "playwright-core";
import { mkdirSync, existsSync } from "fs";
const FPS = 30, DUR = 64, N = FPS * DUR;
const mode = process.argv[2], arg = process.argv[3] || "";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text()); });
await page.goto("http://127.0.0.1:8767/les/index.html");
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
const shot = async (t, path, q) => {
  // два кадра браузера, чтобы стили применились до снимка
  await page.evaluate(async (t) => { window.renderAt(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
  await page.screenshot({ path, type: "jpeg", quality: q, timeout: 180000 });
};
if (mode === "snap") {
  mkdirSync("snap", { recursive: true });
  for (const t of arg.split(",").map(Number)) await shot(t, `snap/at-${t.toFixed(2).padStart(6, "0")}.jpg`, 85);
} else {
  const [from, to] = arg.split(",").map(Number);
  mkdirSync("frames", { recursive: true });
  for (let f = from; f < Math.min(to, N); f++) {
    const p = `frames/f${String(f).padStart(4, "0")}.jpg`;
    if (!existsSync(p)) await shot(f / FPS, p, 94);
  }
}
await browser.close();
