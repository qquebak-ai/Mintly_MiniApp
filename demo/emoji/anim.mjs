// Рендер анимированных кадров каждого эмодзи на прозрачном фоне (alpha).
// Для каждого — свой короткий бесшовный цикл (t: 0..1). Потом ffmpeg соберёт
// VP9 webm с альфой 100×100 под кастом-эмодзи Telegram.
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 560, height: 560 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:8766/emoji/index.html");
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.evaluate(() => window.stopAuto());
// число кадров цикла (30 fps): монета дольше, поп-ины короче
const FR = { coin: 72, up: 48, down: 48, plus100: 54, plus1: 42 };
const el = await page.$("#stage canvas");
for (const [name, n] of Object.entries(FR)) {
  mkdirSync(`frames/${name}`, { recursive: true });
  for (let f = 0; f < n; f++) {
    await page.evaluate(async ([name, t]) => { window.renderEmoji(name, t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, [name, f / n]);
    await el.screenshot({ path: `frames/${name}/f${String(f).padStart(3, "0")}.png`, omitBackground: true });
  }
  console.log("done", name, n);
}
await browser.close();
console.log("ANIM_DONE");
