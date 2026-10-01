import { p, b } from "./lib.mjs";
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 400));
await b.close();
