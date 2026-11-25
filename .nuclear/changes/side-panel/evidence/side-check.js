// Rendered check of the side panel in Chromium against the dev server (port 5199), API mocked.
// Run: node side-check.js <outdir> <view.json>
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '.';
const base = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const json = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const item = (id, title) => ({ kind: 'accept', package_id: id, package_revision: 0, title, detail: 'Waiting for your decision.', since: new Date().toISOString(), risk: { rank: 1, label: 'Standard' }, href: { to: '/packages/$id', id } });
const items = [item('WP-0001', 'Add retry to the intake runner'), item('WP-0002', 'Write the install guide for Windows')];
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail++; };
async function open(b, w, h, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dpr ?? 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem('controlrod.firstRun.done', '1'); });
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url()); const p = u.pathname;
    if (u.port !== '5199') return r.fallback();
    const accept = r.request().headers()['accept'] ?? '';
    if (accept.includes('text/html') || /\.(js|css|svg|png|woff2|webp|jpg|tsx|ts|mjs)$/.test(p) || p.startsWith('/@') || p.startsWith('/node_modules') || p.startsWith('/src')) return r.fallback();
    if (p === '/auth/session') return r.fulfill(json({ registered: true, signed_in: true, user: 'ben' }));
    if (p === '/setup') return r.fulfill(json({ confirmed: true }));
    if (p === '/admin') return r.fulfill(json({ bootstrap: false, actions: [] }));
    if (p === '/scrams') return r.fulfill(json({ scrams: [] }));
    if (p === '/runtimes') return r.fulfill(json({ runtimes: [], pins: [] }));
    if (p === '/inbox') return r.fulfill(json({ items, waiting_on_others: [], digest: { head: 1, lines: [] } }));
    const m = p.match(/^\/packages\/([^/]+)$/);
    if (m) { const it = items.find((i) => i.package_id === m[1]); return r.fulfill(json({ ...base, package: { ...base.package, id: m[1], title: it?.title ?? m[1], status: 'verification' } })); }
    return r.fulfill(json([]));
  });
  await page.goto('http://127.0.0.1:5199/inbox');
  await page.waitForSelector('text=Add retry to the intake runner', { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), top: Math.round(r.top) }; }, sel);
const ids = { 'Add retry to the intake runner': 'WP-0001', 'Write the install guide for Windows': 'WP-0002' };
const openItem = async (page, title) => { await page.locator(`[data-inspect-for="${ids[title]}"]`).click(); await page.waitForSelector('aside.bd-calm', { timeout: 10000 }); await page.waitForTimeout(400); };
(async () => {
  const b = await chromium.launch();
  let { ctx, page } = await open(b, 1440, 900, { dpr: 2 });
  await page.screenshot({ path: `${out}/01-closed-1440.png` });
  const mainBefore = await rect(page, '#main');
  await openItem(page, 'Add retry to the intake runner');
  const pane = await rect(page, '#side');
  const main = await rect(page, '#main');
  check(pane && pane.w === 520, `panel opens docked at 520 px (got ${pane?.w})`);
  check(main && main.w < mainBefore.w && main.x + main.w <= pane.x + 1, 'page narrows beside the panel, not under it');
  check(await page.locator('.side-panel-overlay').count() === 0, 'no overlay on a wide screen');
  check(await page.locator('.topbar').isVisible(), 'top bar stays visible');
  await page.screenshot({ path: `${out}/02-open-1440.png` });
  // Clicking the page keeps the panel; clicking another item swaps its content.
  await page.locator('#main').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(200);
  check(await page.locator('aside.bd-calm').count() === 1, 'click on the page keeps the panel open');
  await openItem(page, 'Write the install guide for Windows');
  check(await page.locator('.bd-calm-title').innerText() === 'Write the install guide for Windows', 'another item swaps the panel content');
  // Drag the edge wider; it is remembered on reopen.
  const sep = page.locator('[role="separator"][aria-label="Side panel width"]');
  const sb = await sep.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, 400); await page.mouse.down();
  await page.mouse.move(sb.x - 160, 400, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const wide = (await rect(page, '#side')).w;
  check(wide > 640, `dragging the edge widens it (got ${wide})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(await page.locator('#side').count() === 0 && (await rect(page, '#main')).w === mainBefore.w, 'Esc hides it and the page takes the full width again');
  await openItem(page, 'Add retry to the intake runner');
  const again = (await rect(page, '#side')).w;
  check(Math.abs(again - wide) <= 2, `reopens at the dragged width (${again} vs ${wide})`);
  await page.locator('.close-x').first().click();
  await page.waitForTimeout(300);
  check(await page.locator('#side').count() === 0, 'X hides it');
  await ctx.close();
  // Narrow laptop: slides over the page, outside click closes.
  ({ ctx, page } = await open(b, 1024, 768, { dpr: 2 }));
  await openItem(page, 'Add retry to the intake runner');
  const ov = await rect(page, '.side-panel-overlay');
  check(ov && ov.w === 560 && ov.x + ov.w === 1024, `slides over from the right at 1024 px (got ${JSON.stringify(ov)})`);
  check(ov.top >= 50, 'starts below the top bar');
  await page.screenshot({ path: `${out}/03-overlay-1024.png` });
  await page.locator('#main').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(300);
  check(await page.locator('aside.bd-calm').count() === 0, 'click outside closes the overlay');
  await ctx.close();
  // Phone.
  ({ ctx, page } = await open(b, 390, 844, { dpr: 3 }));
  await openItem(page, 'Add retry to the intake runner');
  const ph = await rect(page, '.side-panel-overlay');
  check(ph && ph.w === 390, `full width on a phone (got ${ph?.w})`);
  await page.screenshot({ path: `${out}/04-phone-390.png` });
  await ctx.close();
  // Resize across the breakpoint keeps the panel content (a typed note).
  ({ ctx, page } = await open(b, 1440, 900));
  await openItem(page, 'Add retry to the intake runner');
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(400);
  check(await page.locator('.side-panel-overlay aside.bd-calm').count() === 1, 'crossing to a narrow window moves the open panel over the page');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);
  check(await page.locator('#side aside.bd-calm').count() === 1, 'and back beside it');
  await ctx.close();
  await b.close();
  console.log(fail ? `${fail} failed` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
