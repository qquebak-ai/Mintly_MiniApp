// Настоящая страница токена: график по минутам, потом лист покупки.
import { p, b } from "./lib.mjs";
const OUT = "/home/user/Facet_MiniApp/demo/promo/assets/scr";
await p.screenshot({ path: `${OUT}/home.png` });
await p.mouse.click(131, 752);
await p.waitForTimeout(2000);
// в приложении часть подписей ленты ещё не переведена — для ролика на английском правим только снимок
await p.evaluate(() => {
  const map = { "цена": "price", "в токене": "raised", "объём 24ч": "vol 24h", "держателей": "holders" };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const t = n.nodeValue.trim(); if (map[t]) n.nodeValue = map[t]; else if (/ · \d+ мин$/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace("мин", "min"); else if (/^\d+ мин$/.test(t)) n.nodeValue = n.nodeValue.replace("мин", "min"); }
});
await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/pad.png` });
await p.getByText("Moon Cat", { exact: false }).first().click();
await p.waitForTimeout(4000);
await p.getByText("1m", { exact: true }).first().click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/token.png` });
await p.evaluate(() => { const x = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === "Buy"); x.click(); });
await p.waitForTimeout(2000);
await p.screenshot({ path: `${OUT}/buy.png` });
await p.getByText("5 GRAM", { exact: true }).first().click();
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/buy5.png` });
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 500));
await b.close();
