// Настоящая страница токена: график по минутам, потом лист покупки.
import { p, b } from "./lib.mjs";
const OUT = "/home/user/Facet_MiniApp/demo/promo/assets/scr";
await p.screenshot({ path: `${OUT}/home.png` });
await p.mouse.click(131, 752);
await p.waitForTimeout(2000);
await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/pad.png` });
await p.getByText("$MINT", { exact: true }).first().click();
await p.waitForTimeout(4000);
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 300));
await p.getByText(/^(1м|1m|1 мин)$/).first().click();
await p.waitForTimeout(2500);
// свечи рисует сам ролик (им нужно расти), поэтому график приложения прячем и запоминаем его место
const чарт = await p.evaluate(() => {
  const cs = [...document.querySelectorAll("canvas")].filter((c) => c.getBoundingClientRect().height > 120);
  const box = cs[0].closest("div[style*='position: relative'], div") ; const r = cs.reduce((a, c) => { const q = c.getBoundingClientRect(); return { l: Math.min(a.l, q.left), t: Math.min(a.t, q.top), r: Math.max(a.r, q.right), b: Math.max(a.b, q.bottom) }; }, { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
  window.__прятать = () => document.querySelectorAll("canvas").forEach((c) => { const q = c.getBoundingClientRect(); if (q.top >= r.t - 1 && q.bottom <= r.b + 1) c.style.visibility = "hidden"; });
  return r;
});
console.log("ГРАФИК", JSON.stringify(чарт));
await p.screenshot({ path: `${OUT}/token-chart.png` });
await p.evaluate(() => window.__прятать());
await p.waitForTimeout(150);
await p.screenshot({ path: `${OUT}/token.png` });
await p.evaluate(() => document.querySelectorAll("canvas").forEach((c) => { c.style.visibility = ""; }));
await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === "Купить"); x.click(); });
await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/buy.png` });
await p.getByText("5 GRAM", { exact: true }).first().click();
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/buy5.png` });
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 500));
await b.close();
