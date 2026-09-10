import { chromium } from 'playwright-core';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 420, height: 900 } });
const ошибки = [], сеть = [];
p.on('console', (m) => { if (m.type() === 'error') ошибки.push(m.text().slice(0, 160)); });
p.on('pageerror', (e) => ошибки.push('PAGEERROR ' + String(e).slice(0, 200)));

// Наружу ходит node — у него прокси настроен, у браузера нет.
await p.route('**/*', async (route) => {
  const req = route.request();
  const url = req.url();
  const u = new URL(url);
  if (u.hostname === 'localhost' && !u.pathname.startsWith('/api/')) return route.continue();
  try {
    const цель = u.hostname === 'localhost' ? 'https://mintly.company' + u.pathname + u.search : url;
    const r = await fetch(цель, {
      method: req.method(),
      headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => !/^(host|connection|content-length|accept-encoding|sec-|origin|referer)/i.test(k))),
      body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData(),
    });
    const тело = Buffer.from(await r.arrayBuffer());
    if (/geckoterminal|\/api\/chart|feed_cache|tonapi/.test(url)) сеть.push(r.status + ' ' + url.slice(0, 110));
    await route.fulfill({
      status: r.status,
      headers: { 'access-control-allow-origin': '*', 'content-type': r.headers.get('content-type') || 'application/json' },
      body: тело,
    });
  } catch (e) {
    сеть.push('FAIL ' + url.slice(0, 90) + ' ' + String(e.message).slice(0, 60));
    await route.abort();
  }
});

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(20000);
await p.screenshot({ path: '/tmp/claude-0/shot1.png' });
console.log('ошибки:', ошибки.slice(0, 8));
console.log('сеть:', сеть.slice(0, 20));
console.log('текст:', (await p.textContent('body')).replace(/\s+/g, ' ').slice(0, 300));
await b.close();
