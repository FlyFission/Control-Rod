const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const out = process.argv[2]; const base = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
const S = require('path').join(__dirname, 'samples');
const files = ['README.md','pump-replacement-scope.pdf','install-guide.docx','intake.py','results.csv','change.diff','shot.jpg'].filter((f) => require('fs').existsSync(require('path').join(S, f)));
const outputs = files.map((f,i)=>({ path: `out/${f}`, digest: { algorithm: 'sha256', value: String(i).repeat(64) } }));
const json = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const item = { kind: 'accept', package_id: 'WP-0001', package_revision: 0, title: 'Add retry to the intake runner', detail: 'Waiting for your decision.', since: new Date().toISOString(), risk: { rank: 1, label: 'Standard' }, href: { to: '/packages/$id', id: 'WP-0001' } };
const run = { id: 'R-1', package_id: 'WP-0001', package_revision: 0, role: 'author', agent_baseline: 'site-author', runtime: { kind: 'local', provider: 'claude', model: 'm' }, round: 1, status: 'succeeded', queued_at: '2026-11-25T12:00:00Z', finished_at: '2026-11-25T12:05:00Z' };
const types = { md:'text/markdown', pdf:'application/pdf', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', py:'text/plain', csv:'text/csv', diff:'text/plain', jpg:'image/jpeg' };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type()==='error'||m.type()==='warning') console.log('CONSOLE', m.text().slice(0,300)); }); page.on('framenavigated', f => console.log('NAV', f.url()));
  await page.addInitScript(() => { localStorage.setItem('controlrod.firstRun.done', '1'); });
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url()); const p = u.pathname;
    if (u.port !== '5199') return r.fallback();
    const accept = r.request().headers()['accept'] ?? '';
    const om = p.match(/^\/packages\/[^/]+\/outputs\/out\/(.+)$/);
    if (om) { const f = decodeURIComponent(om[1]); return r.fulfill({ status: 200, contentType: types[f.split('.').pop()], body: fs.readFileSync(path.join(S, f)) }); }
    if (accept.includes('text/html') || /\.(js|css|svg|png|woff2|webp|jpg|tsx|ts|mjs)$/.test(p) || p.startsWith('/@') || p.startsWith('/node_modules') || p.startsWith('/src')) return r.fallback();
    if (p === '/auth/session') return r.fulfill(json({ registered: true, signed_in: true, user: 'ben' }));
    if (p === '/setup') return r.fulfill(json({ confirmed: true }));
    if (p === '/admin') return r.fulfill(json({ bootstrap: false, actions: [] }));
    if (p === '/scrams') return r.fulfill(json({ scrams: [] }));
    if (p === '/runtimes') return r.fulfill(json({ runtimes: [], pins: [] }));
    if (p === '/inbox') return r.fulfill(json({ items: [item], waiting_on_others: [], digest: { head: 1, lines: [] } }));
    if (p === '/packages') return r.fulfill(json([{ ...base.package, title: item.title, status: 'verification' }, { ...base.package, id: 'WP-0002', title: 'Write the install guide for Windows', status: 'draft' }]));
    if (/\/runs\/R-1\/log$/.test(p)) return r.fulfill(json({ lines: Array.from({length: 60}, (_, i) => i === 41 ? 'error: intake timed out after 30s, retrying' : `[${String(i).padStart(2,'0')}] step ${i}: reading files and running tests`) }));
    if (/^\/packages\/WP-000\d$/.test(p)) return r.fulfill(json({ ...base, outputs, runs: [run], package: { ...base.package, id: p.slice(10), title: p.endsWith('1') ? item.title : 'Write the install guide for Windows', status: 'verification' } }));
    return r.fulfill(json([]));
  });
  await page.goto('http://127.0.0.1:5199/inbox');
  await page.waitForSelector('[data-inspect-for="WP-0001"]', { timeout: 20000 });
  await page.locator('[data-inspect-for="WP-0001"]').click();
  await page.waitForSelector('aside.bd-calm');
  await page.getByText('Outputs', { exact: true }).first().click();
  await page.waitForTimeout(800);
  for (const f of files) {
    console.log('before', f, await page.locator('aside.bd-calm').count(), await page.locator('.bd-output-btn').count());
    await page.locator('.bd-output-btn', { hasText: f }).click();
    await page.waitForTimeout(f.endsWith('pdf') || f.endsWith('docx') ? 2500 : 1200);
    await page.screenshot({ path: `${out}/inline-${f}.png` });
    const exp = page.getByRole('button', { name: 'Expand' });
    if (await exp.count()) {
      await exp.click(); await page.waitForTimeout(f.endsWith('pdf') || f.endsWith('docx') ? 2500 : 1200);
      await page.screenshot({ path: `${out}/full-${f}.png` });
      await page.getByRole('button', { name: /Back to the card/ }).click(); await page.waitForTimeout(300); await page.screenshot({ path: `${out}/back-${f}.png` }); console.log('after back', await page.locator('aside.bd-calm').count());
    }
  }
  await page.goto('http://127.0.0.1:5199/packages');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/packages-before.png` });
  await page.locator('a.package-row').first().click();
  await page.waitForSelector('aside.bd-calm'); await page.waitForTimeout(800);
  console.log('url after row click', page.url());
  await page.screenshot({ path: `${out}/packages-card.png` });
  await page.getByText('Agent runs', { exact: true }).first().click(); await page.waitForTimeout(800);
  const det = page.locator('details.run summary').first(); if (await det.count()) { await det.click(); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: 'Open full log' }).first().click(); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/log-in-panel.png` });
  await b.close();
})();
