#!/usr/bin/env node
/**
 * Contrast over art (control room redesign, section 10): for every visible label on the Plant (room
 * names, nameplates, "+N" stacks, count plates, the reactor plate, and a focused figure's tooltip),
 * sample the pixels actually rendered behind its text and compute the WCAG contrast of the text
 * colour against the worst of them. Fails under 4.5:1.
 *
 * It loads the busy fixture (about 30 agents, one room with nine) at 1440x900 and 390x844, and the
 * same at 1440x900 in a SCRAM. The text is made transparent for the screenshot, so what is sampled
 * is the plate and the painted art under it, nothing else.
 *
 *   node tools/check_plant_contrast.mjs [base-url]     (default http://127.0.0.1:5173; the app
 *   must be served, for example `pnpm --filter web exec vite`)
 *
 * Needs Playwright with Chromium installed already; it never installs anything.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const MIN = 4.5;
const json = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const TITLES = ["Pump skid P-101 datasheet", "Cable tray routing, Area 2", "Heat exchanger rating", "Line sizing, cooling water", "Pipe rack loads", "Valve list, Unit 2", "Schedule update", "Motor list", "Instrument index", "Drawing register"];

function busy() {
  const plan = [
    ["needs", "your-office"], ["needs", "your-office"], ["stuck", "review"], ["working", "review"], ["waiting", "interface"], ["changed", "interface"],
    ["working", "verification"], ["waiting", "verification"], ["working", "process"], ["working", "process"], ["stuck", "process"], ["working", "process"],
    ["waiting", "process"], ["working", "process"], ["working", "process"], ["working", "process"], ["needs", "process"], ["stuck", "mechanical"],
    ["working", "mechanical"], ["working", "electrical"], ["waiting", "electrical"], ["working", "civil"], ["working", "assurance"],
    ["working", "project-controls"], ["stuck", "project-controls"], ["waiting", "bench"], ["working", "document-control"], ["working", "document-control"],
  ];
  const figures = plan.map(([state, place], i) => ({
    id: `R-${i + 1}`, package_id: `WP-${String(i + 1).padStart(4, "0")}`, package_revision: 1, title: TITLES[i % TITLES.length], role: ["author", "pre-check", "intake"][i % 3],
    state, cause: `${state} cause`, since: ago(1 + i / 10), place, marks: { gate: i % 9 === 0, safety: i % 7 === 0, ...(state === "changed" ? { changed_input: "WP-9" } : {}) },
    gate_stage: "in-work", data_lane: "internal", run_status: "running", href: { to: "/packages/$id", id: `WP-${i}`, hash: "runs" }, cause_key: `run:${i}`,
  }));
  return { figures, needs_me: 3, inbox_items: 4, hidden: 0, generated_at: new Date().toISOString() };
}
const scramOn = { scrams: [{ scram: { id: "scr_1", scope: "organization", reason: "Bad prompt shipped", drill: false, pulled_by: "ben", pulled_at: ago(0.3) }, run_count: 2, pulled_at: ago(0.3) }] };

async function open(browser, viewport, scram) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem("cr.lastSeenSeq:ben", "100"); localStorage.setItem("controlrod.firstRun.done", "1"); });
  await page.route("**/*", (r) => {
    const p = new URL(r.request().url()).pathname;
    const accept = r.request().headers()["accept"] ?? "";
    if (accept.includes("text/html") || /\.(js|ts|tsx|css|svg|png|woff2|webp|json|jpg|map)$/.test(p) || p.startsWith("/@") || p.startsWith("/src") || p.startsWith("/node_modules")) return r.fallback();
    if (p === "/auth/session") return r.fulfill(json({ registered: true, signed_in: true, user: "ben" }));
    if (p === "/office/figures") return r.fulfill(json(busy()));
    if (p === "/scrams") return r.fulfill(json(scram ? scramOn : { scrams: [] }));
    if (p === "/inbox") return r.fulfill(json({ items: [], waiting_on_others: [], digest: { head: 1, lines: [] } }));
    return r.fulfill(json([]));
  });
  await page.goto(`${base}/plant`);
  await page.waitForSelector(".plant-scene [data-label], .plant-room-label", { timeout: 20000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** Every visible text run in a label, with its colour and the page rectangle it fills. */
const collect = () => {
  const out = [];
  const roots = document.querySelectorAll(".plant-scene .plant-roster, .plant-scene .plant-count, .plant-scene .plant-reactor-plate, .plant-scene .plant-tip");
  for (const root of roots) {

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      // Text cut by an ellipsis runs past its plate; only the part drawn inside the plate is read.
      const clip = (el.closest(".plant-row-title, .plant-roster-name, .plant-tip") ?? root).getBoundingClientRect();
      for (const r of rects) {
        const x0 = Math.max(r.left, clip.left), x1 = Math.min(r.right, clip.right);
        const y0 = Math.max(r.top, clip.top), y1 = Math.min(r.bottom, clip.bottom);
        if (x1 - x0 < 1 || y1 - y0 < 1) continue;
        out.push({ text: n.textContent.trim().slice(0, 40), color: cs.color, x: x0 + scrollX, y: y0 + scrollY, w: x1 - x0, h: y1 - y0, kind: root.className.split(" ")[0] });
      }
    }
  }
  return out;
};

const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);

async function check(page, label) {
  const runs = await page.evaluate(collect);
  await page.addStyleTag({ content: ".plant-scene *{color:transparent!important;-webkit-text-fill-color:transparent!important}.plant-scene svg{visibility:hidden!important}" });
  const shot = (await page.screenshot({ fullPage: true })).toString("base64");
  const worst = await page.evaluate(async ({ shot, runs }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${shot}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return runs.map((r) => {
      const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
      const w = Math.max(1, Math.min(img.width - x, Math.ceil(r.w))), h = Math.max(1, Math.min(img.height - y, Math.ceil(r.h)));
      const d = g.getImageData(x, y, w, h).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
      return px;
    });
  }, { shot, runs });
  let fails = 0, min = Infinity;
  runs.forEach((r, i) => {
    const fg = parse(r.color);
    let m = Infinity;
    for (const p of worst[i]) m = Math.min(m, ratio(fg, p));
    min = Math.min(min, m);
    if (m < MIN) {
      fails++;
      console.log(`  FAIL ${m.toFixed(2)}:1  ${r.kind} "${r.text}" at ${Math.round(r.x)},${Math.round(r.y)}`);
    }
  });
  console.log(`${label}: ${runs.length} text runs, worst ${min.toFixed(2)}:1, ${fails} under ${MIN}:1`);
  return { runs: runs.length, fails, min };
}

const browser = await chromium.launch();
let bad = 0;
let total = 0;
for (const [label, viewport, scram, focus] of [
  ["busy 1440x900", { width: 1440, height: 900 }, false, false],
  ["busy 1440x900, figure focused (tooltip)", { width: 1440, height: 900 }, false, true],
  ["SCRAM 1440x900", { width: 1440, height: 900 }, true, false],
  ["busy 390x844", { width: 390, height: 844 }, false, false],
]) {
  const { ctx, page } = await open(browser, viewport, scram);
  if (focus) {
    await page.locator(".plant-figure").first().focus();
    await page.waitForTimeout(200);
  }
  const r = await check(page, label);
  bad += r.fails;
  total += r.runs;
  await ctx.close();
}
await browser.close();
console.log(bad === 0 ? `PASS: ${total} text runs, all at least ${MIN}:1` : `FAIL: ${bad} text runs under ${MIN}:1`);
process.exit(bad === 0 ? 0 : 1);
