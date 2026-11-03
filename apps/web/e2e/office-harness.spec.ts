import { expect, type Page, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname } from "node:path";

/**
 * The office theme quality harness (plan task 4.3; specification 18). Every theme the repository
 * carries is measured on the draft harness page from what the browser actually draws:
 *  - contrast: each name plate and package code is the opaque plate colour where drawn, its text
 *    reaches 4.5:1 on it in drawn pixels, each state mark reaches 3:1 in drawn pixels, and each edge
 *    (the drawn ring, or the drawn plate) reaches 3:1 against the scene beneath;
 *  - state shapes: each drawn mark is classified from its pixels and must be its state's shape, at
 *    a legible size;
 *  - fixed stacking, occlusion and pointer interception;
 *  - legibility at minimum zoom with 40 agents: nothing touches, leaves its region, clips or is small;
 *  - frame time (a smoke check anywhere; the 60 frames per second check of Q-10 on a named
 *    reference machine) and event to screen time up to the committed update;
 *  - motion stops with reduced motion and in a hidden tab;
 *  - a theme switch keeps selection, scroll position and the open card.
 * A sensitivity case breaks each guarded property and requires its check to fail.
 * Lenses arrive with the renderer (plan task 4.8); this harness then runs each contrast case per lens.
 * Set OFFICE_HARNESS_EVIDENCE to a file path to record the measurements with their provenance, and
 * OFFICE_REFERENCE_MACHINE to the reference machine's name to run the reference frame check.
 */

const THEMES = ["standard-office", "harness-bright"] as const;
const PLATE = { r: 10, g: 10, b: 12 };
const measurements: Record<string, unknown> = {};

test.skip(({ browserName }) => browserName !== "chromium", "pixel measurements run in one engine; the stage is plain HTML and SVG");

async function open(page: Page, query: string) {
  await page.goto(`/office-harness.html?${query}`);
  const status = page.locator('[data-harness="contract"]');
  await expect(status).toHaveAttribute("data-problems", "0", { timeout: 15_000 });
  // Every scene image decoded before anything is measured.
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".office-scene img")].every((i) => i.complete && i.naturalWidth > 0));
}

/** Screenshots the stage with and without its semantic layer and measures it in the page. */
async function drawnOf(page: Page) {
  const stage = page.locator(".office-stage");
  const semantic = page.locator(".office-semantic");
  await semantic.evaluate((e) => ((e as HTMLElement).style.visibility = "hidden"));
  const scene = (await stage.screenshot({ animations: "disabled" })).toString("base64");
  await semantic.evaluate((e) => ((e as HTMLElement).style.visibility = ""));
  const full = (await stage.screenshot({ animations: "disabled" })).toString("base64");
  return page.evaluate(measureDrawn, { scene, full, plate: PLATE });
}

/** Time from the click to the first frame after the committed update, or Infinity if none in 5 s. */
async function eventToScreen(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        const el = document.querySelector<HTMLElement>('[data-figure="f1"]')!;
        const before = el.dataset["state"];
        const t0 = performance.now();
        const watch = new MutationObserver(() => {
          if (el.dataset["state"] === before) return;
          watch.disconnect();
          requestAnimationFrame(() => done(performance.now() - t0));
        });
        watch.observe(el, { attributes: true, attributeFilter: ["data-state"] });
        setTimeout(() => {
          watch.disconnect();
          done(Number.POSITIVE_INFINITY);
        }, 5000);
        document.querySelector<HTMLButtonElement>('[data-harness="shift"]')!.click();
      }),
  );
}

/** Frame intervals over two seconds of a 40 agent floor with motion running. */
async function frameIntervals(page: Page) {
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const out: number[] = [];
        let last = performance.now();
        const start = last;
        const tick = (now: number) => {
          out.push(now - last);
          last = now;
          if (now - start < 2000) requestAnimationFrame(tick);
          else done(out.slice(1));
        };
        requestAnimationFrame(tick);
      }),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  return { frames: frames.length, p95: sorted[Math.floor(sorted.length * 0.95)]! };
}

async function provenance(page: Page) {
  return {
    browser: `${page.context().browser()?.browserType().name()} ${page.context().browser()?.version()}`,
    os: `${platform()} ${release()}`,
    cpu: `${cpus()[0]?.model ?? "unknown"} x${cpus().length}`,
  };
}

test.describe("office theme quality harness", () => {
  test("offers exactly the themes this harness measures", async ({ page }) => {
    await open(page, "");
    const ids = await page.locator('[data-harness="theme"] option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(ids).toEqual([...THEMES]);
  });

  test("the harness catches a broken semantic layer", async ({ page }) => {
    // Each check must fail when the thing it guards breaks; otherwise a green run proves nothing.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const broken = async (theme: string, css: string, script?: () => void) => {
      await open(page, `theme=${theme}&agents=40&zoom=0.8`);
      if (css) await page.addStyleTag({ content: css });
      if (script) await page.evaluate(script);
      return drawnOf(page);
    };
    const has = (fs: string[], re: RegExp) => fs.some((f) => re.test(f));
    // Plates that let the art show through.
    let r = await broken("harness-bright", ".office-plate, .office-figure-code { background: transparent !important }");
    expect(has(r.failures, /not the opaque plate/)).toBe(true);
    // Text with no ink, and marks with no paint, although their computed colours look right.
    r = await broken("standard-office", ".office-plate-label { color: rgba(197, 208, 220, 0) !important } .office-figure-mark svg { opacity: 0 !important }");
    expect(has(r.failures, /label text is drawn at best/)).toBe(true);
    expect(has(r.failures, /mark of f\d+ .* is drawn at best/)).toBe(true);
    // Rings removed while the ring colour property stays: dark plates vanish into a dark scene.
    r = await broken("standard-office", ".office-plate, .office-figure-code, .office-figure-mark, .office-figure-outline { box-shadow: none !important; animation: none !important }");
    expect(has(r.failures, /edge is [\d.]+:1 against the scene/)).toBe(true);
    // Every state drawn as the same circle, then every mark shrunk.
    r = await broken("harness-bright", "", () => {
      for (const svg of document.querySelectorAll(".office-figure-mark svg")) svg.innerHTML = '<circle cx="7" cy="7" r="7" style="fill: var(--needs)"/>';
    });
    expect(has(r.failures, /is drawn as a circle, not a/)).toBe(true);
    r = await broken("harness-bright", ".office-figure-mark svg { transform: scale(0.45) }");
    expect(has(r.failures, /is too small to read/)).toBe(true);

    // Art stacked over the semantic layer, and art that takes pointers.
    await open(page, "theme=harness-bright&agents=40&zoom=0.8");
    await page.addStyleTag({ content: ".office-scene { z-index: 2 !important } .office-scene img { pointer-events: auto !important }" });
    const hit = await page.evaluate(measureOcclusion);
    expect(has(hit.failures, /^the scene layer/)).toBe(true);
    expect(has(hit.failures, /takes pointers/)).toBe(true);
    expect(has(hit.failures, /is covered at/)).toBe(true);

    // Crowding and small text.
    await open(page, "theme=harness-bright&agents=40&zoom=0.8");
    await page.addStyleTag({ content: ".office-plate-label { font-size: 9px !important } .office-figure-code { font-size: 15px !important }" });
    await page.locator('[data-figure="f2"]').evaluate((e) => ((e as HTMLElement).style.left = (document.querySelector('[data-figure="f10"]') as HTMLElement).style.left));
    const read = await page.evaluate(measureLegibility);
    expect(has(read.failures, /^text is too small/)).toBe(true);
    expect(has(read.failures, /touches/)).toBe(true);

    // An update that commits late is timed to the commit, not to the next frames.
    await open(page, "theme=standard-office&agents=40&delay=700");
    expect(await eventToScreen(page)).toBeGreaterThanOrEqual(700);
  });

  for (const theme of THEMES) {
    test.describe(theme, () => {
      test("contrast and state shapes as drawn, at minimum zoom with 40 agents", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, `theme=${theme}&agents=40&zoom=0.8`);
        const result = await drawnOf(page);
        measurements[`${theme}/drawn`] = result.summary;
        expect(result.failures).toEqual([]);
        // Every element was measured: 13 plates, 40 codes, 40 marks, 40 outlines, all five shapes.
        expect(result.summary.counted).toEqual({ plate: 13, code: 40, mark: 40, outline: 40 });
        expect(Object.keys(result.summary.shapes).sort()).toEqual(["changed", "needs", "stuck", "waiting", "working"]);
      });

      test("occlusion and pointer interception", async ({ page }) => {
        await open(page, `theme=${theme}&agents=40&zoom=0.8`);
        const result = await page.evaluate(measureOcclusion);
        measurements[`${theme}/occlusion`] = { parts: result.parts, openFloorProbes: result.probes };
        expect(result.failures).toEqual([]);
        expect(result.probes).toBeGreaterThan(100);
        // A click on a figure reaches the application, not the art beneath it.
        await page.locator('[data-figure="f3"]').click();
        await expect(page.locator('[data-figure="f3"]')).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator('[data-harness="card"] h2')).toHaveText("P-103");
      });

      test("legibility at minimum zoom with 40 agents", async ({ page }) => {
        await open(page, `theme=${theme}&agents=40&zoom=0.8`);
        const result = await page.evaluate(measureLegibility);
        measurements[`${theme}/legibility`] = { boxes: result.boxes, smallestTextPx: result.smallest };
        expect(result.failures).toEqual([]);
        expect(result.boxes).toBe(53);
      });

      test("frame time smoke check and event to screen time with 40 agents", async ({ page }) => {
        await open(page, `theme=${theme}&agents=40`);
        const { frames, p95 } = await frameIntervals(page);
        const toScreen = await eventToScreen(page);
        measurements[`${theme}/frames`] = { frames, p95Ms: Math.round(p95 * 10) / 10, eventToScreenMs: Math.round(toScreen), machine: await provenance(page) };
        // A smoke check for any machine (30 frames per second); the Q-10 target is the reference check below.
        expect(p95).toBeLessThan(1000 / 30);
        // Event to screen under 500 ms (Q-10), timed to the committed update.
        expect(toScreen).toBeLessThan(500);
        await expect(page.locator('[data-figure="f1"]')).toHaveAttribute("data-state", "needs");
      });

      test("60 frames per second on the reference machine (Q-10)", async ({ page }) => {
        const machine = process.env["OFFICE_REFERENCE_MACHINE"];
        test.skip(!machine, "runs only on the named reference machine (set OFFICE_REFERENCE_MACHINE)");
        await open(page, `theme=${theme}&agents=40`);
        const { frames, p95 } = await frameIntervals(page);
        measurements[`${theme}/reference-frames`] = { machineName: machine, frames, p95Ms: Math.round(p95 * 10) / 10, machine: await provenance(page) };
        // 95 of every 100 frames within 5% of the 60 frames per second period.
        expect(p95).toBeLessThanOrEqual((1000 / 60) * 1.05);
      });

      test("motion stops with reduced motion and in a hidden tab", async ({ page }) => {
        await open(page, `theme=${theme}&agents=40`);
        const moving = await page.evaluate(() => document.getAnimations().length);
        expect(moving).toBeGreaterThan(0);
        const setVisibility = (state: "hidden" | "visible") =>
          page.evaluate((s) => {
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
            document.dispatchEvent(new Event("visibilitychange"));
          }, state);
        await setVisibility("hidden");
        await expect(page.locator(".office-stage")).toHaveAttribute("data-motion", "paused");
        await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
        await setVisibility("visible");
        await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(moving);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
        measurements[`${theme}/motion`] = { animationsInFullMotion: moving, hidden: 0, reduced: 0 };
      });

      test("a theme switch keeps selection, scroll position and the open card", async ({ page }) => {
        await open(page, `theme=${theme}&agents=40&zoom=1.6`);
        const scroller = page.locator('[data-harness="scroll"]');
        await page.locator('[data-figure="f7"]').click();
        await scroller.evaluate((e) => {
          e.scrollLeft = 240;
          (e.querySelector('[data-figure="f7"]') as HTMLElement & { harnessMark?: boolean }).harnessMark = true;
        });
        const other = THEMES.find((t) => t !== theme)!;
        await page.locator('[data-harness="theme"]').selectOption(other);
        await expect(page.locator(".office-stage")).toHaveAttribute("data-theme-id", other);
        await expect(page.locator('[data-harness="contract"]')).toHaveAttribute("data-problems", "0");
        expect(await scroller.evaluate((e) => e.scrollLeft)).toBe(240);
        await expect(page.locator('[data-figure="f7"]')).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator('[data-harness="card"] h2')).toHaveText("P-107");
        // The same element, not a rebuilt one: nothing a reader holds is torn down by the switch.
        expect(await page.locator('[data-figure="f7"]').evaluate((e) => (e as HTMLElement & { harnessMark?: boolean }).harnessMark)).toBe(true);
      });
    });
  }

  // Merged after every test, so a worker restarted by a failure loses nothing already measured.
  test.afterEach(() => {
    const path = process.env["OFFICE_HARNESS_EVIDENCE"];
    if (!path || Object.keys(measurements).length === 0) return;
    mkdirSync(dirname(path), { recursive: true });
    const before = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>) : {};
    const merged = { ...before, ...measurements };
    const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
    writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n");
  });
});

/**
 * Runs in the page. Decodes two screenshots of the stage (scene only, and everything) and measures
 * each semantic element from its drawn pixels:
 *  - its plate is drawn in the opaque plate colour, so no art shows through;
 *  - its text reaches 4.5:1 on that plate, and its state mark 3:1, in the strongest drawn pixels;
 *  - at every point of its edge, the drawn ring or the drawn plate reaches 3:1 against the scene;
 *  - its state mark, classified from its pixels, is its state's shape at a legible size.
 */
async function measureDrawn({ scene, full, plate }: { scene: string; full: string; plate: { r: number; g: number; b: number } }) {
  const decode = async (b64: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  };
  const [sceneImg, fullImg] = await Promise.all([decode(scene), decode(full)]);
  const stage = document.querySelector(".office-stage")!.getBoundingClientRect();
  type RGB = { r: number; g: number; b: number };
  const at = (img: ImageData, x: number, y: number): RGB | null => {
    const px = Math.floor(x - stage.left), py = Math.floor(y - stage.top);
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return null;
    const i = (py * img.width + px) * 4;
    return { r: img.data[i]!, g: img.data[i + 1]!, b: img.data[i + 2]! };
  };
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (c: RGB) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a: RGB, b: RGB) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };
  const mode = (cs: (RGB | null)[]) => {
    const n = new Map<string, number>();
    for (const c of cs) if (c) n.set(`${c.r},${c.g},${c.b}`, (n.get(`${c.r},${c.g},${c.b}`) ?? 0) + 1);
    const [k] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["0,0,0"];
    const [r, g, b] = k.split(",").map(Number) as [number, number, number];
    return { r, g, b };
  };
  const near = (a: RGB, b: RGB) => Math.abs(a.r - b.r) <= 3 && Math.abs(a.g - b.g) <= 3 && Math.abs(a.b - b.b) <= 3;
  const failures: string[] = [];
  const worst = { text: Infinity, mark: Infinity, edge: Infinity };
  const counted = { plate: 0, code: 0, mark: 0, outline: 0 };
  const shapes: Record<string, string> = {};

  // Every semantic part as drawn, with its 2px ring: an edge that meets another part is not an edge
  // against the scene (the legibility check keeps separate elements apart).
  type Zone = { el: Element; round: boolean; r: DOMRect };
  const zones: Zone[] = [...document.querySelectorAll(".office-plate, .office-figure-code, .office-figure-mark, .office-figure-outline")].map((el) => ({
    el,
    round: el.classList.contains("office-figure-mark") || el.classList.contains("office-figure-outline"),
    r: el.getBoundingClientRect(),
  }));
  const inZone = (z: Zone, x: number, y: number, grow: number) => {
    if (z.round) return Math.hypot(x - (z.r.left + z.r.width / 2), y - (z.r.top + z.r.height / 2)) <= z.r.width / 2 + grow;
    return x >= z.r.left - grow && x <= z.r.right + grow && y >= z.r.top - grow && y <= z.r.bottom + grow;
  };
  const pixelsIn = (img: ImageData, l: number, t: number, r: number, b: number) => {
    const out: { x: number; y: number; c: RGB }[] = [];
    for (let y = Math.ceil(t); y < b; y++)
      for (let x = Math.ceil(l); x < r; x++) {
        const c = at(img, x + 0.5, y + 0.5);
        if (c) out.push({ x: x + 0.5, y: y + 0.5, c });
      }
    return out;
  };
  const drawnPlate = (where: string, rect: DOMRect, inset: number) => {
    const bg = mode(pixelsIn(fullImg, rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset).map((p) => p.c));
    if (!near(bg, plate)) failures.push(`${where} is drawn as rgb(${bg.r},${bg.g},${bg.b}), not the opaque plate`);
    return bg;
  };
  const inkCheck = (where: string, rect: DOMRect, bg: RGB, min: number, kind: "text" | "mark", keep: (x: number, y: number) => boolean = () => true) => {
    // The fourth strongest drawn pixel: a glyph or a shape has several at full strength; a stray pixel does not.
    const rs = pixelsIn(fullImg, rect.left, rect.top, rect.right, rect.bottom).filter((p) => keep(p.x, p.y)).map((p) => ratio(p.c, bg)).sort((a, b) => b - a);
    const c = rs[Math.min(4, rs.length) - 1] ?? 1;
    worst[kind] = Math.min(worst[kind], c);
    if (c < min) failures.push(`${where} is drawn at best ${c.toFixed(2)}:1 on its plate, under ${min}:1`);
  };
  /**
   * One edge point: the scene just past the ring, against the best drawn pixel across the element's
   * own boundary, sampled every quarter pixel through its 2px ring and into its own border or plate
   * (`depth`: no deeper than the element's own opaque band, so nothing beneath it is credited).
   */
  let lastWorst = { v: Infinity, info: "" };
  const edgePoint = (self: Element, depth: number, ox: number, oy: number, nx: number, ny: number) => {
    const sx = ox + nx * 4.5, sy = oy + ny * 4.5;
    // Where another part covers this edge or sits just past it, the edge does not meet the scene.
    if (zones.some((z) => z.el !== self && (inZone(z, ox, oy, 2.5) || inZone(z, sx, sy, 2.5)))) return Infinity;
    const sceneC = at(sceneImg, sx, sy);
    if (!sceneC) return Infinity;
    let best = 1;
    const seen: string[] = [];
    for (let d = -depth; d <= 1.75; d += 0.25) {
      const c = at(fullImg, ox + nx * d, oy + ny * d);
      if (!c) continue;
      best = Math.max(best, ratio(c, sceneC));
      seen.push(`${c.r},${c.g},${c.b}`);
    }
    if (best < lastWorst.v) lastWorst = { v: best, info: `at ${Math.round(ox)},${Math.round(oy)}, scene ${sceneC.r},${sceneC.g},${sceneC.b}, boundary ${seen.join(" ")}` };
    return best;
  };
  const edgeCheck = (where: string, self: Element, round: boolean, depth: number, radius = 0) => {
    const r = self.getBoundingClientRect();
    let c = Infinity;
    let points = 0;
    lastWorst = { v: Infinity, info: "" };
    const edgePointCounted = (ox: number, oy: number, nx: number, ny: number) => {
      const v = edgePoint(self, depth, ox, oy, nx, ny);
      if (v !== Infinity) points++;
      return v;
    };
    if (round) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
      for (let a = 0; a < 360; a += 6) {
        const nx = Math.cos((a * Math.PI) / 180), ny = Math.sin((a * Math.PI) / 180);
        c = Math.min(c, edgePointCounted(cx + rad * nx, cy + rad * ny, nx, ny));
      }
    } else {
      // Straight runs only; corners are rounded.
      for (let x = r.left + radius + 1; x <= r.right - radius - 1; x += 2) c = Math.min(c, edgePointCounted(x, r.top, 0, -1), edgePointCounted(x, r.bottom, 0, 1));
      for (let y = r.top + radius + 1; y <= r.bottom - radius - 1; y += 2) c = Math.min(c, edgePointCounted(r.left, y, -1, 0), edgePointCounted(r.right, y, 1, 0));
    }
    // Every element keeps part of its edge against the scene, so something is always measured.
    if (points === 0) failures.push(`${where} has no edge against the scene to measure`);
    worst.edge = Math.min(worst.edge, c);
    if (c < 3) failures.push(`${where} edge is ${c.toFixed(2)}:1 against the scene (${lastWorst.info})`);
  };
  /**
   * Classifies a drawn mark from its pixels: coverage is each pixel's luminance share between the
   * plate and the brightest drawn pixel, so anti-aliasing counts in proportion.
   */
  const classify = (rect: DOMRect, bg: RGB, keep: (x: number, y: number) => boolean) => {
    const px = pixelsIn(fullImg, rect.left - 1, rect.top - 1, rect.right + 1, rect.bottom + 1).filter((p) => keep(p.x, p.y));
    const lp = lum(bg);
    const lm = Math.max(...px.map((p) => lum(p.c)));
    if (lm - lp < 0.05) return { shape: "nothing", size: 0 };
    const cov = px.map((p) => ({ ...p, v: Math.min(1, Math.max(0, (lum(p.c) - lp) / (lm - lp))) }));
    const solid = cov.filter((p) => p.v > 0.5);
    const l = Math.min(...solid.map((p) => p.x)), r = Math.max(...solid.map((p) => p.x));
    const t = Math.min(...solid.map((p) => p.y)), b = Math.max(...solid.map((p) => p.y));
    const w = r - l + 1, h = b - t + 1;
    const area = cov.reduce((n, p) => n + p.v, 0);
    const fill = area / (w * h);
    const cx = (l + r) / 2, cy = (t + b) / 2;
    const centre = cov.filter((p) => Math.abs(p.x - cx) <= 1.5 && Math.abs(p.y - cy) <= 1.5);
    const hole = centre.reduce((n, p) => n + p.v, 0) / Math.max(1, centre.length);
    const top = cov.filter((p) => p.y < cy).reduce((n, p) => n + p.v, 0);
    const bottom = cov.filter((p) => p.y > cy).reduce((n, p) => n + p.v, 0);
    const lean = top / Math.max(0.01, bottom);
    // Thresholds sit midway between the shapes' measured signatures (recorded in the evidence):
    // ring hole 0 against 1, triangle lean 0.29 against 1, fill 0.54 diamond, 0.72 circle, 1.09 square.
    const shape = hole < 0.5 ? "ring" : lean < 0.65 ? "triangle" : fill > 0.9 ? "square" : fill > 0.63 ? "circle" : "diamond";
    const two = (n: number) => Math.round(n * 100) / 100;
    return { shape, size: Math.min(w, h), fill: two(fill), hole: two(hole), lean: two(lean) };
  };
  const EXPECTED: Record<string, string> = { working: "circle", needs: "diamond", waiting: "ring", stuck: "square", changed: "triangle" };

  for (const p of document.querySelectorAll(".office-plate")) {
    const r = p.getBoundingClientRect();
    const where = `plate "${p.querySelector(".office-plate-name")!.textContent}"`;
    const bg = drawnPlate(where, r, 2);
    inkCheck(`${where} name text`, p.querySelector(".office-plate-name")!.getBoundingClientRect(), bg, 4.5, "text");
    inkCheck(`${where} label text`, p.querySelector(".office-plate-label")!.getBoundingClientRect(), bg, 4.5, "text");
    edgeCheck(where, p, false, 3, 6);
    counted.plate++;
  }
  for (const f of document.querySelectorAll(".office-figure")) {
    const id = f.getAttribute("data-figure");
    const state = f.getAttribute("data-state")!;
    const code = f.querySelector(".office-figure-code")!;
    const cr = code.getBoundingClientRect();
    const codeBg = drawnPlate(`code of ${id}`, cr, 1);
    inkCheck(`code of ${id} text`, cr, codeBg, 4.5, "text");
    edgeCheck(`code of ${id}`, code, false, 1.75, 4);
    counted.code++;
    const mark = f.querySelector(".office-figure-mark")!;
    const mr = mark.getBoundingClientRect();
    const cx = mr.left + mr.width / 2, cy = mr.top + mr.height / 2;
    // The plate shows between the state shape and the chip's rim.
    const rim: (RGB | null)[] = [];
    for (let k = 0; k < 8; k++) {
      const a = ((22.5 + k * 45) * Math.PI) / 180;
      rim.push(at(fullImg, cx + 9.6 * Math.cos(a), cy + 9.6 * Math.sin(a)));
    }
    const markBg = mode(rim);
    if (!near(markBg, plate)) failures.push(`mark of ${id} is drawn on rgb(${markBg.r},${markBg.g},${markBg.b}), not the opaque plate`);
    const svg = mark.querySelector("svg")!.getBoundingClientRect();
    // Only the chip's own disc: past it lie the chip's rim and the outline's ring, which are not the mark.
    const onChip = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= mr.width / 2 - 1.5;
    inkCheck(`mark of ${id} (${state})`, svg, markBg, 3, "mark", onChip);
    const seen = classify(svg, markBg, onChip);
    // Real marks measure 11 to 13px across; a mark shrunk by half measures about 5.
    if (seen.size < 8) failures.push(`mark of ${id} (${state}) is too small to read: ${seen.size}px`);
    else if (seen.shape !== EXPECTED[state]) failures.push(`mark of ${id} (${state}) is drawn as a ${seen.shape}, not a ${EXPECTED[state]} ${JSON.stringify(seen)}`);
    shapes[state] ??= JSON.stringify(seen);
    // The chip is plate from its rim to the shape's farthest corner, 2.5px in.
    edgeCheck(`mark of ${id}`, mark, true, 2);
    counted.mark++;
    // The outline is a 2px dark border with the body art inside it.
    edgeCheck(`outline of ${id}`, f.querySelector(".office-figure-outline")!, true, 1.75);
    counted.outline++;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { failures, summary: { counted, shapes, worstTextRatio: round(worst.text), worstMarkRatio: round(worst.mark), worstEdgeRatio: round(worst.edge) } };
}

/** Runs in the page: fixed stacking, every semantic element topmost at its own points, and the scene never taking a pointer. */
function measureOcclusion() {
  const failures: string[] = [];
  // Nothing in the scene layer takes a pointer.
  for (const e of document.querySelectorAll(".office-scene, .office-scene *"))
    if (getComputedStyle(e).pointerEvents !== "none") failures.push(`scene element ${e.tagName} takes pointers`);
  // Fixed stacking: the stage isolates its layers and the scene layer sits below the semantic layer.
  // (elementFromPoint skips elements without pointers, so it cannot see art drawn over the semantic layer.)
  const layer = (sel: string) => getComputedStyle(document.querySelector(sel)!);
  if (layer(".office-stage").isolation !== "isolate") failures.push("the stage does not isolate its layers");
  const sceneZ = Number(layer(".office-scene").zIndex), semanticZ = Number(layer(".office-semantic").zIndex);
  if (layer(".office-scene").position !== "absolute" || !(sceneZ < semanticZ))
    failures.push(`the scene layer (z ${layer(".office-scene").zIndex}) is not below the semantic layer (z ${layer(".office-semantic").zIndex})`);
  // Every semantic element is topmost at its centre and four inset corners.
  const owns = (target: Element, x: number, y: number) => {
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === target || target.contains(hit));
  };
  const parts = document.querySelectorAll(".office-plate, .office-figure-outline, .office-figure-mark, .office-figure-code");
  for (const p of parts) {
    const r = p.getBoundingClientRect();
    const owner = p.closest(".office-figure") ?? p;
    const inset = Math.min(4, r.width / 3, r.height / 3);
    const points: [number, number][] = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + inset, r.top + inset], [r.right - inset, r.top + inset],
      [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset],
    ];
    // Round parts: the centre and four points on the diagonals inside the circle.
    if (p.classList.contains("office-figure-outline") || p.classList.contains("office-figure-mark")) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = (r.width / 2) * 0.6;
      points.splice(1, 4, [cx - d, cy - d], [cx + d, cy - d], [cx - d, cy + d], [cx + d, cy + d]);
    }
    for (const [x, y] of points) if (!owns(owner, x, y)) failures.push(`${p.className} of ${owner.getAttribute("data-figure") ?? owner.textContent} is covered at ${Math.round(x)},${Math.round(y)}`);
  }
  // Open floor (inside a region, away from every semantic element) never hits the scene.
  let probes = 0;
  const semanticBoxes = [...parts].map((p) => p.getBoundingClientRect());
  for (const region of document.querySelectorAll(".office-region")) {
    const r = region.getBoundingClientRect();
    for (let gx = 0.1; gx < 1; gx += 0.2)
      for (let gy = 0.15; gy < 1; gy += 0.15) {
        const x = r.left + r.width * gx, y = r.top + r.height * gy;
        if (semanticBoxes.some((b) => x >= b.left - 2 && x <= b.right + 2 && y >= b.top - 2 && y <= b.bottom + 2)) continue;
        probes++;
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit.closest(".office-scene")) failures.push(`the scene took a pointer at ${Math.round(x)},${Math.round(y)}`);
      }
  }
  return { failures, probes, parts: parts.length };
}

/** Runs in the page: nothing overlaps, leaves its region or the stage, is clipped, or is too small to read. */
function measureLegibility() {
  const failures: string[] = [];
  const stage = document.querySelector(".office-stage")!.getBoundingClientRect();
  if (Math.abs(stage.width - 960) > 1) failures.push(`the stage is ${stage.width}px wide, not the 960px minimum`);
  type Box = { name: string; l: number; t: number; r: number; b: number };
  const union = (name: string, els: Element[]): Box => {
    const rs = els.map((e) => e.getBoundingClientRect());
    return { name, l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
  };
  const boxes: Box[] = [];
  // The corridor: between the bottom of the top row of regions and the top of the bottom row.
  const regionBoxes = [...document.querySelectorAll(".office-region")].map((r) => r.getBoundingClientRect());
  const corridorTop = Math.max(...regionBoxes.filter((r) => r.top < stage.top + stage.height / 2).map((r) => r.bottom));
  const corridorBottom = Math.min(...regionBoxes.filter((r) => r.top >= stage.top + stage.height / 2).map((r) => r.top));
  for (const f of document.querySelectorAll(".office-figure")) {
    const box = union(`figure ${f.getAttribute("data-figure")}`, [...f.querySelectorAll(".office-figure-outline, .office-figure-mark, .office-figure-code")]);
    boxes.push(box);
    // Seated: inside its own region, clear of the name plate band. Queued: inside the corridor.
    const region = document.querySelector(`.office-region[data-region="${f.getAttribute("data-region")}"]`)!.getBoundingClientRect();
    const plate = document.querySelector(`.office-region[data-region="${f.getAttribute("data-region")}"] .office-plate`)!.getBoundingClientRect();
    const cy = (box.t + box.b) / 2;
    const seated = cy >= region.top && cy <= region.bottom;
    if (seated && (box.l < region.left || box.r > region.right || box.t < plate.bottom || box.b > region.bottom)) failures.push(`${box.name} leaves its seat in ${f.getAttribute("data-region")}`);
    if (!seated && (box.t < corridorTop || box.b > corridorBottom)) failures.push(`${box.name} queues outside the corridor`);
    const outline = f.querySelector(".office-figure-outline")!.getBoundingClientRect();
    if (outline.width < 24 || outline.height < 24) failures.push(`figure ${f.getAttribute("data-figure")} is smaller than a 24px target`);
  }
  for (const p of document.querySelectorAll(".office-plate")) {
    const box = union(`plate ${p.textContent}`, [p]);
    boxes.push(box);
    const region = p.closest(".office-region")!.getBoundingClientRect();
    if (box.l < region.left || box.r > region.right || box.t < region.top) failures.push(`${box.name} leaves its region`);
    for (const s of p.querySelectorAll("span"))
      if ((s as HTMLElement).scrollWidth > (s as HTMLElement).clientWidth + 0.5 || s.getBoundingClientRect().right > box.r + 0.5) failures.push(`${box.name} clips "${s.textContent}"`);
  }
  for (const b of boxes) if (b.l < stage.left || b.r > stage.right || b.t < stage.top || b.b > stage.bottom) failures.push(`${b.name} leaves the stage`);
  // Each element's 2px ring is drawn outside its box, so boxes keep 5px apart and rings never touch.
  const gap = 5;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, c = boxes[j]!;
      if (a.l < c.r + gap && c.l < a.r + gap && a.t < c.b + gap && c.t < a.b + gap) failures.push(`${a.name} touches ${c.name}`);
    }
  const sizes = (sel: string) => [...document.querySelectorAll(sel)].map((e) => parseFloat(getComputedStyle(e).fontSize));
  const smallest = { name: Math.min(...sizes(".office-plate-name")), label: Math.min(...sizes(".office-plate-label")), code: Math.min(...sizes(".office-figure-code")) };
  if (smallest.name < 12 || smallest.label < 11 || smallest.code < 10) failures.push(`text is too small: ${JSON.stringify(smallest)}`);
  return { failures, boxes: boxes.length, smallest };
}
