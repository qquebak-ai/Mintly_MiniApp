import { p, b, плохо } from "./libsol.mjs";
const OUT = "/tmp/claude-0/-home-user-Facet-MiniApp/fac25f77-d2c0-52a4-9022-6fae6c8df13b/scratchpad";
await p.mouse.click(230, 754);
await p.waitForTimeout(2500);
const t0 = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 200);
console.log("0:", t0);
if (!/Solana/.test(t0)) {
  await p.getByText("Gram", { exact: true }).first().click(); await p.waitForTimeout(900);
  await p.getByText("Solana", { exact: true }).last().click(); await p.waitForTimeout(1200);
}
await p.locator('input[type=file]').first().setInputFiles("/home/user/Facet_MiniApp/demo/promo/assets/tok/sol/wif.png");
await p.waitForTimeout(1200);
await p.getByText(/^(Применить|Готово|Apply)$/).first().click();
await p.waitForTimeout(1200);
const name = p.locator('input[type=text]').nth(0), tick = p.locator('input[type=text]').nth(1);
await name.click(); await name.pressSequentially("dogwifhat", { delay: 40 });
await tick.click(); await tick.pressSequentially("WIF", { delay: 40 });
await p.mouse.click(300, 760); await p.waitForTimeout(4500);
await p.screenshot({ path: `${OUT}/createsol.png` });
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 300), плохо.slice(0, 3));
await b.close();
