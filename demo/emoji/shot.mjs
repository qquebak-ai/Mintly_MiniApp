// Снимаем референс-стиллы каждого эмодзи на прозрачном фоне (omitBackground).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 560, height: 560 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:8766/emoji/index.html");
await page.waitForFunction(() => window.ready === true, null, { timeout: 90000 });
await page.evaluate(() => window.stopAuto());
const names = await page.evaluate(() => window.__names);
// поза, в которой эмодзи выглядит выгоднее всего для стилла
const POSE = { coin: 0.04, up: 0.25, down: 0.25, plus100: 0.6, plus1: 0.6 };
for (const n of names) {
  await page.evaluate(async ([n, t]) => { window.renderEmoji(n, t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, [n, POSE[n] ?? 0]);
  const el = await page.$("#stage canvas");
  await el.screenshot({ path: `out/${n}.png`, omitBackground: true });
}
await browser.close();
console.log("SHOT", names.join(","));
