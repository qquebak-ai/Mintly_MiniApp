import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const плохо = [];
p.on("pageerror", (e) => плохо.push("pageerror: " + e.message));
await p.route("**/*", async (route) => {
  const url = route.request().url();
  try {
    const r = await fetch(url, { method: route.request().method(), headers: route.request().headers(), body: route.request().postData() || undefined });
    const тело = Buffer.from(await r.arrayBuffer());
    return route.fulfill({ status: r.status, headers: { "content-type": r.headers.get("content-type") || "text/html", "access-control-allow-origin": "*" }, body: тело });
  } catch { return route.abort(); }
});
await p.goto("https://mintly.company/?token=cb68ac56-6af0-4810-96e9-276a726f7d00", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3000);
const k = p.locator("text=Продолжить без входа").first();
if (await k.count()) await k.click();
await p.waitForTimeout(14000);
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 500));
console.log("--- ошибки:", плохо.slice(0, 3));
await b.close();
