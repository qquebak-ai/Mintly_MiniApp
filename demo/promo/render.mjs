// Кадры промо через Chromium. node render.mjs snap 1,2,3 — проверочные снимки;
// node render.mjs frames 0,90 — кадры 0…89 в 2× для суперсэмплинга.
import { chromium } from "playwright-core";
import { mkdirSync, existsSync } from "fs";
const FPS = 30, DUR = 55, N = FPS * DUR;
const mode = process.argv[2], arg = process.argv[3] || "";
const PR = mode === "frames" ? 1.5 : 1;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: PR });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("http://127.0.0.1:8766/promo/index.html");
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
if (mode === "snap") {
  mkdirSync("snap", { recursive: true });
  for (const t of arg.split(",").map(Number)) { await page.evaluate(async (t) => { window.renderAt(t); await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t); await page.screenshot({ path: `snap/at-${String(t).padStart(5, "0")}.jpg`, type: "jpeg", quality: 85 }); }
} else {
  const [from, to] = arg.split(",").map(Number);
  mkdirSync("frames", { recursive: true });
  for (let f = from; f < Math.min(to, N); f++) {
    // уже снятые кадры не трогаем — после сбоя кусок дорендеривается с места остановки
    if (existsSync(`frames/f${String(f).padStart(4, "0")}.jpg`)) continue;
    // ждём шрифты и картинки после каждого кадра: новый браузер на кусок иначе снимал пустые карточки
    await page.evaluate(async (t) => { window.renderAt(t); await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
      // два кадра браузера: иначе снимок иногда успевал до перерисовки текста с градиентной заливкой, и буква мигала
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, f / FPS);
    await page.screenshot({ timeout: 180000, type: "jpeg", quality: 94, path: `frames/f${String(f).padStart(4, "0")}.jpg` });
  }
}
await browser.close();
