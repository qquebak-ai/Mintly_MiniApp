import { p, b, ПАПКА } from "./lib.mjs";
const navs = await p.evaluate(() => [...document.querySelectorAll("button")].filter((x) => x.getBoundingClientRect().top > 760).map((x) => x.getBoundingClientRect().left));
console.log(navs);
const bs = p.locator("button").filter({ hasNot: p.locator("text=zzz") });
await p.mouse.click(131, 808);
await p.waitForTimeout(2500);
await p.screenshot({ path: `${ПАПКА}/pad.png` });
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 600));
await b.close();
