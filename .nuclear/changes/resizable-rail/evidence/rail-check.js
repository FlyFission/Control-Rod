// Rendered check of the resizable, collapsible rail in Chromium against the dev server (port 5199), API mocked.
// Run: node rail-check.js <outdir>
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const json = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const projects = [
  { id: 'p1', name: 'Hanford Tank Side Cesium Removal Ion Exchange Column Redesign', mode: 'software', repo: 'FlyFission/tank-side-cesium' },
  { id: 'p2', name: 'Control Rod web app', mode: 'software', repo: 'FlyFission/Control-Rod' },
  { id: 'p3', name: 'Caddis Solutions marketing site and lead funnel', mode: 'software' },
];
let fail = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail++; };
async function open(b, w, h, storage, scrams = []) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(storage ? { storageState: storage } : {}) });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem('controlrod.firstRun.done', '1'); });
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url()); const p = u.pathname;
    if (u.port !== '5199') return r.fallback();
    const accept = r.request().headers()['accept'] ?? '';
    if (accept.includes('text/html') || /\.(js|css|svg|png|woff2|webp|jpg|tsx|ts|mjs)$/.test(p) || p.startsWith('/@') || p.startsWith('/node_modules') || p.startsWith('/src')) return r.fallback();
    if (p === '/auth/session') return r.fulfill(json({ registered: true, signed_in: true, user: 'ben' }));
    if (p === '/workspace/projects') return r.fulfill(json(projects));
    if (p === '/scrams') return r.fulfill(json({ scrams }));
    if (p.startsWith('/scrams/')) return r.fulfill(json({ scram: scrams[0]?.scram, restarts: [], packages: [], runs: [] }));
    if (p === '/inbox') return r.fulfill(json({ items: [], waiting_on_others: [], digest: { head: 1, lines: [] } }));
    return r.fulfill(json([]));
  });
  await page.goto('http://127.0.0.1:5199/inbox');
  await page.waitForSelector('#cr-rail', { timeout: 15000 });
  await page.waitForTimeout(500);
  return { ctx, page };
}
const railW = (page) => page.evaluate(() => Math.round(document.querySelector('[data-panel]#rail, #rail')?.getBoundingClientRect().width ?? -1));
const truncated = (page) => page.evaluate(() => [...document.querySelectorAll('.rail-proj-name')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).length);
(async () => {
  const b = await chromium.launch();
  let { ctx, page } = await open(b, 1440, 900);
  check((await railW(page)) === 248, `default width 248 px (got ${await railW(page)})`);
  check(await page.locator('.rail-proj-btn[title^="Hanford"]').count() === 1, 'long project name has a full-name tooltip');
  const before = await truncated(page);
  await page.screenshot({ path: `${out}/rail-default-1440.png` });
  const sep = page.locator('[role="separator"][aria-label="Navigation width"]');
  const box = await sep.boundingBox();
  await page.mouse.move(box.x + box.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, 400, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const wide = await railW(page);
  check(wide >= 440 && wide <= 452, `drag right widens the rail (got ${wide})`);
  const after = await truncated(page);
  check(after === 0, `no project name cut after widening (${before} -> ${after})`);
  await page.screenshot({ path: `${out}/rail-wide-1440.png` });
  const bw = await sep.boundingBox();
  await page.mouse.move(bw.x + bw.width / 2, 400); await page.mouse.down(); await page.mouse.move(bw.x + 300, 400, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
  check((await railW(page)) === 480, `max width 480 px (got ${await railW(page)})`);
  await sep.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  const kb = await railW(page);
  check(kb < 480, `ArrowLeft on the focused handle narrows the rail (got ${kb})`);
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(500);
  check(Math.abs((await railW(page)) - kb) <= 1, `width kept after reload (${kb} -> ${await railW(page)})`);
  await page.setViewportSize({ width: 1100, height: 800 }); await page.waitForTimeout(300);
  check(Math.abs((await railW(page)) - kb) <= 1, `width kept in pixels when the window narrows (got ${await railW(page)})`);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(200);
  // Collapse from the top bar button.
  await page.getByRole('button', { name: 'Hide navigation' }).click(); await page.waitForTimeout(200);
  check((await railW(page)) === 0, `button hides the rail (width ${await railW(page)})`);
  check(await page.evaluate(() => document.getElementById('cr-rail').inert === true), 'hidden rail is inert');
  await page.keyboard.press('Tab');
  const inRail = await page.evaluate(() => document.getElementById('cr-rail').contains(document.activeElement));
  check(!inRail, 'Tab does not land inside the hidden rail');
  await page.screenshot({ path: `${out}/rail-hidden-1440.png` });
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(500);
  check((await railW(page)) === 0, 'stays hidden after reload');
  await page.locator('body').click({ position: { x: 900, y: 600 } });
  await page.keyboard.press('[');
  await page.waitForTimeout(200);
  check(Math.abs((await railW(page)) - kb) <= 1, `[ shows it again at the saved width (got ${await railW(page)})`);
  // Drag past the minimum collapses.
  const b2 = await sep.boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, 400); await page.mouse.down(); await page.mouse.move(20, 400, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(200);
  check((await railW(page)) === 0, `dragging past the minimum tucks it away (width ${await railW(page)})`);
  await page.keyboard.press('[');
  await page.waitForTimeout(200);
  const back = await railW(page);
  check(back >= 200, `shows again at least at the minimum (got ${back})`);
  // Double-click resets.
  const b3 = await sep.boundingBox();
  await page.mouse.dblclick(b3.x + b3.width / 2, 400); await page.waitForTimeout(200);
  check(Math.abs((await railW(page)) - 248) <= 1, `double-click resets to 248 (got ${await railW(page)})`);
  // Clicks in the workspace still reach their targets (the handle's hit area is only at the edge).
  // Clicks just right of the handle's hit area reach the workspace, not the handle.
  const hb = await sep.boundingBox();
  await page.evaluate(() => { window.__hit = null; document.addEventListener('pointerdown', (e) => { window.__hit = e.target.closest('[role="separator"]') ? 'handle' : 'workspace'; }, { capture: true }); });
  await page.mouse.click(hb.x + 24, 600);
  const focusInHandle = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'separator');
  check(!focusInHandle, 'a click 24 px right of the edge does not grab the handle');
  await page.getByRole('button', { name: /Search/ }).click();
  check(await page.locator('.palette').count() >= 1 || (await page.getByText('could not be shown').count()) >= 1, 'workspace buttons still take clicks (the palette opened)');
  // The mocked API is too thin for the palette; start the next checks from a fresh page.
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(500);
  // [ from inside the rail hands focus to the toggle.
  await page.locator('.rail-proj-btn').first().focus();
  await page.keyboard.press('[');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.activeElement?.classList.contains('rail-toggle')), '[ from a rail link moves focus to the toggle');
  await page.keyboard.press('[');
  await page.waitForTimeout(200);
  // Crossing the phone breakpoint keeps the same workspace element (no remount).
  await page.evaluate(() => { window.__main = document.querySelector('.main'); });
  await page.setViewportSize({ width: 700, height: 800 }); await page.waitForTimeout(400);
  const samePhone = await page.evaluate(() => document.querySelector('.main') === window.__main);
  check(await page.locator('#cr-rail').count() === 0 && samePhone, 'narrowing to a phone width drops the rail and keeps the workspace mounted');
  const flow = await page.evaluate(() => { const g = getComputedStyle(document.querySelector('.shell-panes')); return g.overflow + ' ' + g.height + ' ' + document.querySelector('.shell-panes').offsetHeight + ' ' + document.querySelector('.main').offsetHeight; });
  console.log('     phone group:', flow);
  check(flow.startsWith('visible'), 'on a phone the panel group does not clip the page');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(400);
  check(await page.evaluate(() => document.querySelector('.main') === window.__main) && await page.locator('#cr-rail').count() === 1, 'widening again brings the rail back with the same workspace');
  await ctx.close();
  // A narrow window that squeezes the rail does not overwrite the person's chosen width.
  ({ ctx, page } = await open(b, 1440, 900));
  await page.evaluate(() => localStorage.setItem('cr.rail:ben', JSON.stringify({ width: 480, collapsed: false })));
  await page.setViewportSize({ width: 830, height: 800 });
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(600);
  const squeezed = await railW(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(600);
  check((await railW(page)) === 480, `opening at 830 px (rail squeezed to ${squeezed}) keeps the saved 480 (got ${await railW(page)})`);
  await ctx.close();
  // Reopening a hidden rail in a narrow window does not save the squeezed width.
  ({ ctx, page } = await open(b, 1440, 900));
  await page.evaluate(() => localStorage.setItem('cr.rail:ben', JSON.stringify({ width: 480, collapsed: true })));
  await page.setViewportSize({ width: 830, height: 800 });
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Show navigation' }).click(); await page.waitForTimeout(300);
  const reopened = await railW(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(600);
  check((await railW(page)) === 480, `showing it at 830 px (squeezed to ${reopened}) keeps the saved 480 (got ${await railW(page)})`);
  // Enter on the handle hides and shows it; reopening squeezed does not save the squeeze either.
  await page.setViewportSize({ width: 830, height: 800 }); await page.waitForTimeout(300);
  const hsep = page.locator('[role="separator"][aria-label="Navigation width"]');
  await hsep.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const enterHidden = await railW(page);
  await hsep.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const enterShown = await railW(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(600);
  check(enterHidden === 0 && enterShown > 0 && (await railW(page)) === 480, `Enter on the handle hides (${enterHidden}) and shows (${enterShown}) at 830 px and keeps the saved 480 (got ${await railW(page)})`);
  // Hidden at 480, reloaded, then shown with Enter on the handle: comes back at 480.
  await page.getByRole('button', { name: 'Hide navigation' }).click(); await page.waitForTimeout(250);
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(600);
  await hsep.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  check((await railW(page)) === 480, `Enter on the handle after a hidden reload reopens at the saved 480 (got ${await railW(page)})`);
  // Hidden at 450, loaded at 830, widened while hidden, then shown with Enter: comes back at 450.
  await page.evaluate(() => localStorage.setItem('cr.rail:ben', JSON.stringify({ width: 450, collapsed: true })));
  await page.setViewportSize({ width: 830, height: 800 });
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(600);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
  await hsep.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const enterFocus = await page.evaluate(() => document.activeElement?.getAttribute('role'));
  check((await railW(page)) === 450 && enterFocus === 'separator', `hidden at 450, loaded at 830, widened, Enter reopens at 450 with focus on the handle (got ${await railW(page)}, focus ${enterFocus})`);
  // A focused project row shows its repository even on a narrow rail.
  { const bx = await hsep.boundingBox(); await page.mouse.dblclick(bx.x + bx.width / 2, 400); await page.waitForTimeout(300); }
  await page.locator('.rail-proj-btn[title^="Hanford"]').focus(); await page.waitForTimeout(100);
  const repoShown = await page.evaluate(() => { const b = document.querySelector('.rail-proj-btn[title^="Hanford"]'); const c = b.querySelector('.rail-proj-repo'); return { w: Math.round(document.getElementById('rail').getBoundingClientRect().width), vis: !!c && getComputedStyle(c).display !== 'none' }; });
  const repoFull = await page.evaluate(() => { const c = document.querySelector('.rail-proj-btn[title^="Hanford"] .rail-proj-repo'); return c.scrollWidth <= c.clientWidth + 1; });
  check(repoShown.vis && repoFull, `focused project row shows its full repository on a ${repoShown.w} px rail`);
  // Focus on the handle survives the phone breakpoint by moving to the workspace.
  await page.locator('[role="separator"][aria-label="Navigation width"]').focus();
  await page.setViewportSize({ width: 700, height: 800 }); await page.waitForTimeout(400);
  check(await page.evaluate(() => document.activeElement?.id === 'main'), 'focus on the handle moves to the workspace when the handle goes away');
  await ctx.close();
  // With the widest rail at 830 px and both statuses showing, no top-bar control is clipped.
  const org = { scram: { id: 'scr_1', org_id: 'org', scope: 'organization', reason: 'Bad prompt shipped', pulled_by: 'm', drill: false }, run_count: 2, pulled_at: new Date().toISOString() };
  ({ ctx, page } = await open(b, 830, 800, undefined, [org]));
  await page.evaluate(() => localStorage.setItem('cr.rail:ben', JSON.stringify({ width: 480, collapsed: false })));
  await page.reload(); await page.waitForSelector('#cr-rail'); await page.waitForTimeout(800);
  const clip = await page.evaluate(() => {
    const ws = document.querySelector('.main').getBoundingClientRect();
    const items = [...document.querySelectorAll('.topbar .top-left > *, .topbar .top-right > *')].filter((e) => e.offsetParent !== null);
    const out = items.filter((e) => { const r = e.getBoundingClientRect(); return r.right > ws.right + 0.5 || r.left < ws.left - 0.5; }).map((e) => e.className || e.tagName);
    return { out, rail: Math.round(document.getElementById('rail').getBoundingClientRect().width), labels: [...document.querySelectorAll('.shell-notlive, .shell-rods-label')].map((e) => e.textContent) };
  });
  console.log('     830 px top bar:', JSON.stringify(clip));
  check(clip.out.length === 0, `no top-bar control clipped at 830 px with the rail at ${clip.rail} px`);
  await page.screenshot({ path: `${out}/topbar-830.png` });
  await ctx.close();
  // Phone: no handle, no toggle.
  ({ ctx, page } = await (async () => {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await c.newPage();
    await p.addInitScript(() => { localStorage.setItem('controlrod.firstRun.done', '1'); });
    await p.route('**/*', (r) => {
      const u = new URL(r.request().url()); const pa = u.pathname;
      if (u.port !== '5199') return r.fallback();
      const accept = r.request().headers()['accept'] ?? '';
      if (accept.includes('text/html') || /\.(js|css|svg|png|woff2|webp|jpg|tsx|ts|mjs)$/.test(pa) || pa.startsWith('/@') || pa.startsWith('/node_modules') || pa.startsWith('/src')) return r.fallback();
      if (pa === '/auth/session') return r.fulfill(json({ registered: true, signed_in: true, user: 'ben' }));
      if (pa === '/workspace/projects') return r.fulfill(json(projects));
      if (pa === '/scrams') return r.fulfill(json({ scrams: [] }));
      if (pa === '/inbox') return r.fulfill(json({ items: [], waiting_on_others: [], digest: { head: 1, lines: [] } }));
      return r.fulfill(json([]));
    });
    await p.goto('http://127.0.0.1:5199/inbox'); await p.waitForSelector('.bottom-bar'); await p.waitForTimeout(400);
    return { ctx: c, page: p };
  })());
  check(await page.locator('[role="separator"][aria-label="Navigation width"]').count() === 0, 'phone: no drag handle');
  check(await page.locator('.rail-toggle').count() === 0, 'phone: no rail toggle');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: no horizontal scroll');
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.shell-panes')).touchAction === 'auto'), 'phone: the panel group leaves gestures (pinch zoom) to the browser');
  await page.screenshot({ path: `${out}/phone-390.png` });
  await ctx.close();
  await b.close();
  console.log(fail ? `${fail} FAILED` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
