import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
p.on('console', (m) => { const t = m.text(); if (/ошибк|error|chart|свеч/i.test(t)) console.log('LOG', t.slice(0, 160)); });
const сеть = [];
await p.route('**/*', async (route) => {
  const req = route.request(); const url = req.url(); const u = new URL(url);
  if (u.hostname === 'localhost' && !u.pathname.startsWith('/api/')) return route.continue();
  try {
    const цель = u.hostname === 'localhost' ? 'https://mintly.company' + u.pathname + u.search : url;
    const r = await fetch(цель, { method: req.method(), headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => !/^(host|connection|content-length|accept-encoding|sec-|origin|referer)/i.test(k))), body: ['GET','HEAD'].includes(req.method()) ? undefined : req.postData() });
    const тело = Buffer.from(await r.arrayBuffer());
    if (/ohlcv|api\/chart/.test(url)) сеть.push(r.status + ' ' + url.replace('https://mintly.company','').slice(0, 100));
    await route.fulfill({ status: r.status, headers: { 'access-control-allow-origin': '*', 'content-type': r.headers.get('content-type') || 'application/json' }, body: тело });
  } catch (e) { сеть.push('FAIL ' + url.slice(0, 80)); await route.abort(); }
});
await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
for (const текст of ['Продолжить без входа', 'Далее', 'Далее', 'Далее', 'Далее']) {
  const кн = p.locator(`text=${текст}`).first();
  if (await кн.count() && await кн.isVisible()) { await кн.click().catch(() => {}); await p.waitForTimeout(500); }
}
await p.waitForTimeout(4000);
await p.mouse.click(227, 825); await p.waitForTimeout(3500);   // мемпад
await p.locator('text=SOL').first().click().catch(() => {}); await p.waitForTimeout(4000);
await p.locator('text=Трендовые').first().click().catch(() => {}); await p.waitForTimeout(5000);
await p.screenshot({ path: '/tmp/claude-0/sol_list.png' });
await p.mouse.click(200, 430); await p.waitForTimeout(14000);
await p.screenshot({ path: '/tmp/claude-0/sol_token.png' });
await p.locator('text=СЕЙЧАС').first().click().catch((e) => console.log('клик СЕЙЧАС', e.message));
await p.waitForTimeout(12000);
await p.screenshot({ path: '/tmp/claude-0/sol_now.png' });
console.log('запросы графика:', сеть.slice(0, 14));
await b.close();
