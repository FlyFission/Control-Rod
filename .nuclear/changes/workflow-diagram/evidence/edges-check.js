// Rendered check: no edge path runs through a block other than its own ends, and no edge label overlaps a block or another label.
const { chromium } = require('playwright');
const json = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const AT = new Date().toISOString();
const rt = (id, ready, v) => ({ runtime: id, ready, version: v, login_checked: true });
const probe = (id, n, f, v) => ({ id, display_name: n, vendor_family: f, installed: true, path: `/usr/local/bin/${id}`, observed_version: v, auth: 'signed-in', roles: [] });
(async () => {
  const b = await chromium.launch();
  let bad = 0, runs = 0;
  for (const sc of ['two', 'one', 'claude-only'])
  for (const ans of ['start', 'start-and-merge', 'every-step'])
  for (const [w, h] of [[1440, 900], [1024, 800], [390, 844]]) {
    const runtimes = { reported_at: AT, pins: [], runtimes: sc === 'claude-only' ? [rt('claude', true, '2.1.330')] : [rt('claude', true, '2.1.330'), rt('codex', sc === 'two', '0.171.0')] };
    const subs = { reported: true, reported_at: AT, platform: 'darwin', probes: sc === 'claude-only' ? [probe('claude','Claude Code','Anthropic','2.1.330')] : [probe('claude','Claude Code','Anthropic','2.1.330'), probe('codex','Codex','OpenAI','0.171.0')], checkers: [], tiers: [], local_rule: '', pins: [] };
    const setup = { confirmed: true, confirmed_at: AT, seats: [], check_in: ans };
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem('controlrod.firstRun.done', '1'); });
    await page.route('**/*', (r) => {
      const u = new URL(r.request().url()); const p = u.pathname;
      if (u.port !== '5199') return r.fallback();
      const accept = r.request().headers()['accept'] ?? '';
      if (accept.includes('text/html') || /\.(js|css|svg|png|woff2|webp|jpg|tsx|ts|mjs)$/.test(p) || p.startsWith('/@') || p.startsWith('/node_modules') || p.startsWith('/src')) return r.fallback();
      if (p === '/auth/session') return r.fulfill(json({ registered: true, signed_in: true, user: 'u' }));
      if (p === '/runtimes') return r.fulfill(json(runtimes));
      if (p === '/subscriptions') return r.fulfill(json(subs));
      if (p === '/setup') return r.fulfill(json(setup));
      if (p === '/scrams') return r.fulfill(json({ scrams: [] }));
      if (p === '/inbox') return r.fulfill(json({ items: [], waiting_on_others: [], digest: { head: 1, lines: [] } }));
      return r.fulfill(json([]));
    });
    await page.goto('http://127.0.0.1:5199/workflow');
    await page.waitForSelector('.react-flow__edge-path', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(800);
    const res = await page.evaluate(() => {
      const inset = (r, d) => ({ l: r.left + d, t: r.top + d, r: r.right - d, b: r.bottom - d });
      const nodes = [...document.querySelectorAll('.react-flow__node')].map((n) => ({ id: n.dataset.id, box: inset(n.getBoundingClientRect(), 3) }));
      const inside = (p, q) => p.x > q.l && p.x < q.r && p.y > q.t && p.y < q.b;
      const hit = (a, q) => a.l < q.r && q.l < a.r && a.t < q.b && q.t < a.b;
      const out = [];
      const labels = [];
      for (const g of document.querySelectorAll('.react-flow__edge')) {
        const id = g.dataset.id ?? g.getAttribute('data-testid')?.replace('rf__edge-', '');
        const [from, to] = id.split('->');
        const path = g.querySelector('.react-flow__edge-path');
        const m = path.getScreenCTM();
        const len = path.getTotalLength();
        for (let s = 0; s <= len; s += 2) {
          const pt = path.getPointAtLength(s).matrixTransform(m);
          const n = nodes.find((n) => n.id !== from && n.id !== to && inside(pt, n.box));
          if (n) { out.push(`edge ${id} runs through ${n.id}`); break; }
        }
        const lab = g.querySelector('.react-flow__edge-textwrapper');
        if (lab) {
          const box = inset(lab.getBoundingClientRect(), 1);
          const n = nodes.find((n) => hit(box, n.box));
          if (n) out.push(`label of ${id} overlaps ${n.id}`);
          for (const o of labels) if (hit(box, o.box)) out.push(`label of ${id} overlaps label of ${o.id}`);
          labels.push({ id, box });
        }
      }
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (hit(nodes[i].box, nodes[j].box)) out.push(`${nodes[i].id} overlaps ${nodes[j].id}`);
      return { problems: [...new Set(out)], edges: document.querySelectorAll('.react-flow__edge').length, nodes: nodes.length };
    });
    runs++;
    // An empty or half-drawn canvas is a failure, not a pass: every step and every edge of the flow must be drawn.
    const want = ans === 'every-step' ? { nodes: 15, edges: 16 } : { nodes: 13, edges: 14 };
    if (res.nodes !== want.nodes || res.edges !== want.edges) res.problems.push(`drew ${res.nodes} blocks and ${res.edges} edges, expected ${want.nodes} and ${want.edges}`);
    const tag = `${sc} ${ans} ${w}px: ${res.nodes} blocks, ${res.edges} edges`;
    if (res.problems.length) { bad++; console.log(`FAIL ${tag}\n  ${res.problems.join('\n  ')}`); } else console.log(`ok   ${tag}`);
    await ctx.close();
  }
  console.log(`${runs - bad} of ${runs} cases clear`);
  await b.close();
  process.exit(bad ? 1 : 0);
})();
