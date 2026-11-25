const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const out = process.argv[2]; const base = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const S = path.join(__dirname, 'samples');
const W = Number(process.argv[4] || 1440);
const long = 'The intake runner now retries a failed intake three times with jittered backoff before it marks the capture as stuck, so a slow network or a busy agent no longer leaves a card waiting for a person who has nothing to decide. ';
const outputs = [{ path: 'out/README.md', digest: { algorithm: 'sha256', value: '0'.repeat(64) } }];
const json = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const item = { kind: 'accept', package_id: 'WP-0001', package_revision: 0, title: 'Add retry to the intake runner so slow networks and busy agents stop leaving cards stuck', detail: 'Waiting for your decision.', since: new Date().toISOString(), risk: { rank: 1, label: 'Standard' }, href: { to: '/packages/$id', id: 'WP-0001' } };
const run = { id: 'R-1', package_id: 'WP-0001', package_revision: 0, role: 'author', agent_baseline: 'site-author', runtime: { kind: 'local', provider: 'claude', model: 'm' }, round: 1, status: 'succeeded', queued_at: '2026-11-25T12:00:00Z', finished_at: '2026-11-25T12:05:00Z', summary: long + long };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => { localStorage.setItem('controlrod.firstRun.done', '1'); });
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url()); const p = u.pathname;
    if (u.port !== '5199') return r.fallback();
    const accept = r.request().headers()['accept'] ?? '';
    const om = p.match(/^\/packages\/[^/]+\/outputs\/out\/(.+)$/);
    if (om) return r.fulfill({ status: 200, contentType: 'text/markdown', body: fs.readFileSync(path.join(S, 'long-README.md')) });
    if (accept.includes('text/html') || /\.(js|css|svg|png|woff2|webp|jpg|tsx|ts|mjs)$/.test(p) || p.startsWith('/@') || p.startsWith('/node_modules') || p.startsWith('/src')) return r.fallback();
    if (p === '/auth/session') return r.fulfill(json({ registered: true, signed_in: true, user: 'ben' }));
    if (p === '/setup') return r.fulfill(json({ confirmed: true }));
    if (p === '/admin') return r.fulfill(json({ bootstrap: false, actions: [] }));
    if (p === '/scrams') return r.fulfill(json({ scrams: [] }));
    if (p === '/runtimes') return r.fulfill(json({ runtimes: [], pins: [] }));
    if (p === '/inbox') return r.fulfill(json({ items: [item], waiting_on_others: [], digest: { head: 1, lines: [] } }));
    if (p === '/packages') return r.fulfill(json([{ ...base.package, title: item.title, status: 'verification' }]));
    if (/\/runs\/R-1\/log$/.test(p)) return r.fulfill(json({ lines: Array.from({length: 80}, (_, i) => `[12:0${i%10}:${String(i).padStart(2,'0')}] step ${i}: ` + (i%7===0 ? long : 'reading files and running tests')) }));
    if (/^\/packages\/WP-000\d$/.test(p)) return r.fulfill(json({ ...base, outputs, runs: [run], package: { ...base.package, title: item.title, objective: long + long + long, acceptance_criteria: [long, long.slice(0,90), long + long], status: 'verification' } }));
    return r.fulfill(json([]));
  });
  const measure = async (name) => {
    const m = await page.evaluate(() => {
      const panel = document.querySelector('.side-panel:not([hidden])');
      if (!panel) return null;
      const pr = panel.getBoundingClientRect();
      const res = { panelW: Math.round(pr.width), blocks: [] };
      for (const el of panel.querySelectorAll('p, li, .log-line, .bd-criteria li, dd')) {
        const r = el.getBoundingClientRect(); if (r.width < 40 || r.height === 0) continue;
        const t = el.textContent || ''; if (t.length < 120) continue;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20; const lines = Math.max(1, Math.round(r.height / lh));
        res.blocks.push({ tag: el.tagName + '.' + (el.className||'').toString().slice(0,30), cpl: Math.round(t.length / lines), left: Math.round(r.left - pr.left), right: Math.round(pr.right - r.right), fs: getComputedStyle(el).fontSize });
        if (res.blocks.length > 5) break;
      }
      const sc = [...panel.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      res.scroller = sc ? sc.className.toString().slice(0,40) : 'none';
      const hdr = panel.querySelector('.bd-calm-head'); res.headH = hdr ? Math.round(hdr.getBoundingClientRect().height) : null; const body = panel.querySelector('.file-screen-body > *, .bd-calm-card'); res.contentTop = body ? Math.round(body.getBoundingClientRect().top - pr.top) : null;
      return res;
    });
    console.log(name, JSON.stringify(m));
    await page.screenshot({ path: `${out}/${name}-${W}.png` });
  };
  await page.goto('http://127.0.0.1:5199/inbox');
  await page.waitForSelector('[data-inspect-for="WP-0001"]', { timeout: 30000 });
  await page.locator('[data-inspect-for="WP-0001"]').click();
  await page.waitForSelector('aside.bd-calm'); await page.waitForTimeout(600);
  for (const s of ['What was asked', 'Agent runs']) { await page.getByText(s, { exact: true }).first().click(); await page.waitForTimeout(300); }
  await measure('card');
  await page.getByText('Outputs', { exact: true }).first().click(); await page.waitForTimeout(500);
  await page.locator('.bd-output-btn').first().click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Expand' }).click(); await page.waitForTimeout(1200);
  await measure('file');
  // Scroll to the bottom: is the close / back still reachable?
  await page.mouse.move(1100, 600); for (let k = 0; k < 15; k++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  console.log('after scroll: back visible', await page.getByRole('button', { name: /Back to the card/ }).isVisible() && await page.evaluate(() => { const r = [...document.querySelectorAll('button')].find(b => /Back to the card/.test(b.textContent)).getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }));
  await page.screenshot({ path: `${out}/file-bottom-${W}.png` });
  await page.getByRole('button', { name: 'Use the full width' }).click(); await page.waitForTimeout(500);
  await page.evaluate(() => { for (const e of document.querySelectorAll('.side-panel *')) if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = 0; });
  await measure('file-full');
  await page.evaluate(() => { for (const e of document.querySelectorAll('.side-panel *')) if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = 1400; });
  await page.screenshot({ path: `${out}/file-full-mid-${W}.png` });
  await page.getByRole('button', { name: 'Show beside the page' }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Back to the card/ }).click(); await page.waitForTimeout(300);
  await page.getByText('Agent runs', { exact: true }).first().click(); await page.waitForTimeout(400);
  const det = page.locator('details.run summary').first(); if (await det.count()) { await det.click(); await page.waitForTimeout(400); }
  console.log('buttons', JSON.stringify(await page.locator('.side-panel:not([hidden]) button, .side-panel:not([hidden]) summary').allInnerTexts()));
  const ol = page.getByRole('button', { name: 'Open full log' }).first();
  if (await ol.count()) { await ol.click(); await page.waitForTimeout(1000); await measure('log'); await page.getByRole('button', { name: 'Use the full width' }).click(); await page.waitForTimeout(500); await measure('log-full'); }
  await b.close();
})();
