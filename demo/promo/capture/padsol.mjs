import { p, b, плохо } from "./libsol.mjs";
const OUT = "/tmp/claude-0/-home-user-Facet-MiniApp/fac25f77-d2c0-52a4-9022-6fae6c8df13b/scratchpad";
await p.mouse.click(164, 754);
await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/padsol.png` });
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 500), плохо.slice(0, 3));
await b.close();
