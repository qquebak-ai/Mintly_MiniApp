// Рендер: кадр за кадром через Chromium → ffmpeg.
// node render.mjs frames 0,120 — кадры 0…119 в frames/
// node render.mjs 1.5,6,10   — только снимки этих секунд в snap/
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
const FPS = 30, DUR = 24, N = FPS * DUR, URL = "http://127.0.0.1:8765/index.html";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await page.goto(URL);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
const only = process.argv[2] && process.argv[2] !== "frames" ? process.argv[2] : null;
if (only) {
  mkdirSync("snap", { recursive: true });
  for (const t of only.split(",").map(Number)) { await page.evaluate((t) => window.renderAt(t), t); await page.screenshot({ path: `snap/at-${t}.png` }); }
  await browser.close(); process.exit(0);
}
// Кадры кладём на диск кусками: браузер на каждый кусок новый — один
// длинный сеанс съедал память и контейнер падал. Склейка — encode.sh.
const [from, to] = (process.argv[3] || "0,720").split(",").map(Number);
mkdirSync("frames", { recursive: true });
for (let f = from; f < Math.min(to, N); f++) {
  await page.evaluate((t) => window.renderAt(t), f / FPS);
  await page.screenshot({ type: "jpeg", quality: 96, path: `frames/f${String(f).padStart(4, "0")}.jpg` });
}
await browser.close();
console.log(`frames ${from}-${to} done`);
