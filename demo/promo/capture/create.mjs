// Кадры настоящего экрана запуска: пустой → логотип → имя и тикер по буквам → сумма.
import { p, b } from "./lib.mjs";
const OUT = "/home/user/Facet_MiniApp/demo/promo/assets/scr";
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
await p.getByText("Create token", { exact: true }).first().click();
await p.waitForTimeout(2500);
await shot("create-00");
await p.locator('input[type=file]').first().setInputFiles("/home/user/Facet_MiniApp/demo/promo/assets/tok/mcat.png");
await p.waitForTimeout(1200);
await p.getByText("Apply", { exact: true }).click();
await p.waitForTimeout(1200);
await shot("create-01");
const name = p.locator('input[placeholder="Prism Cat"]'), tick = p.locator('input[placeholder="PRSM"]');
let i = 2;
for (const ch of "Moon Cat") { await name.press(ch === " " ? "Space" : ch); await p.waitForTimeout(120); await shot("create-" + String(i++).padStart(2, "0")); }
await tick.click();
for (const ch of "MCAT") { await tick.press(ch); await p.waitForTimeout(120); await shot("create-" + String(i++).padStart(2, "0")); }
// прокрутка к кнопке запуска — по ней в ролике «нажимают»
for (let k = 1; k <= 6; k++) { await p.mouse.wheel(0, 40); await p.waitForTimeout(90); await shot("create-" + String(i++).padStart(2, "0")); }
const кн = await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === "Launch token"); const r = x.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
console.log("кнопка", кн);
console.log("кадров", i, (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 300));
await b.close();
