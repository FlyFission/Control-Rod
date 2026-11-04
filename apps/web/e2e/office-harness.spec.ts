import { expect, type Page, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname } from "node:path";
import { OFFICE_THEMES } from "../src/features/office/registry.js";

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

/** Every theme the repository carries: the default, the structural test theme and the fifteen worlds. */
const THEMES = OFFICE_THEMES.map((t) => t.id);
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

/**
 * Five renders of the stage, each a screenshot: everything; the scene alone; the scene without figure
 * bodies; and the semantic layer alone over two key colours. A pixel the semantic layer paints
 * opaquely is the same over both keys, so ownership of every measured pixel is established, never
 * assumed. Then the page measures them.
 */
async function drawnOf(page: Page) {
  const stage = page.locator(".office-stage");
  const shot = async () => (await stage.screenshot({ animations: "disabled" })).toString("base64");
  const set = (css: string) =>
    page.evaluate((c) => {
      let tag = document.getElementById("harness-render");
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "harness-render";
        document.head.append(tag);
      }
      tag.textContent = c;
    }, css);
  const full = await shot();
  await set(".office-semantic { visibility: hidden !important }");
  const scene = await shot();
  await set(".office-semantic, .office-scene-body { visibility: hidden !important }");
  const bare = await shot();
  await set(".office-scene { visibility: hidden !important } .office-stage { background: rgb(255, 0, 255) !important }");
  const keyA = await shot();
  await set(".office-scene { visibility: hidden !important } .office-stage { background: rgb(0, 255, 0) !important }");
  const keyB = await shot();
  await set("");
  // OFFICE_HARNESS_RENDERS names a folder to keep the five renders in, for looking at a failure.
  const keep = process.env["OFFICE_HARNESS_RENDERS"];
  if (keep) {
    mkdirSync(keep, { recursive: true });
    for (const [name, b64] of Object.entries({ full, scene, bare, keyA, keyB })) writeFileSync(`${keep}/${name}.png`, Buffer.from(b64, "base64"));
  }
  return page.evaluate(measureDrawn, { full, scene, bare, keyA, keyB, plate: PLATE });
}

/**
 * Time from the click to the first frame after the update is on screen: the state committed and the
 * figure's drawn symbol replaced (a symbol that stays frozen never finishes), or Infinity after 5 s.
 */
async function eventToScreen(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        const el = document.querySelector<HTMLElement>('[data-figure="f1"]')!;
        const symbol = () => el.querySelector(".office-figure-mark svg")?.innerHTML ?? "";
        const before = { state: el.dataset["state"], symbol: symbol() };
        const t0 = performance.now();
        const watch = new MutationObserver(() => {
          if (el.dataset["state"] === before.state || symbol() === before.symbol) return;
          watch.disconnect();
          requestAnimationFrame(() => done(performance.now() - t0));
        });
        watch.observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
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
    const broken = async (theme: string, css: string, script?: () => unknown) => {
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
    // Package codes with no ink (their plates' rings stay), and labels clipped to a few glyphs.
    r = await broken("standard-office", ".office-figure-code { color: transparent !important } .office-plate-label { clip-path: inset(0 75% 0 0) }");
    expect(has(r.failures, /code of f\d+ text is drawn at best/)).toBe(true);
    expect(has(r.failures, /label text has [\d.]+ inked pixels per character/)).toBe(true);
    // Half of every room's canonical name clipped away, its box unchanged: the missing glyphs are found.
    r = await broken("standard-office", ".office-plate-name { clip-path: inset(0 50% 0 0) }");
    expect(has(r.failures, /name text has glyphs with no ink/)).toBe(true);
    // Rings removed while the ring colour property stays: dark plates vanish into a dark scene.
    r = await broken("standard-office", ".office-plate, .office-figure-code, .office-figure-mark, .office-figure-outline { box-shadow: none !important; animation: none !important }");
    expect(has(r.failures, /edge is [\d.]+:1 against the scene/)).toBe(true);
    // Invisible neighbours never excuse an edge: hidden codes leave the outlines' feet measured.
    r = await broken("harness-bright", ".office-figure-code { visibility: hidden !important }");
    expect(r.summary.counted.outline).toBe(40);
    expect(r.failures.filter((f) => f.startsWith("outline"))).toEqual([]);
    // Outlines removed entirely over the busy bright scene: no owned edge, so scenery earns no credit.
    r = await broken("harness-bright", ".office-figure-outline { border-color: transparent !important; box-shadow: none !important; animation: none !important }");
    expect(has(r.failures, /outline of f\d+ edge is 1\.00:1/)).toBe(true);
    // Every state drawn as the same circle, then every mark shrunk.
    r = await broken("harness-bright", "", () => {
      for (const svg of document.querySelectorAll(".office-figure-mark svg")) svg.innerHTML = '<circle cx="7" cy="7" r="7" style="fill: var(--needs)"/>';
    });
    expect(has(r.failures, /is drawn as a circle, not a/)).toBe(true);
    r = await broken("harness-bright", ".office-figure-mark svg { transform: scale(0.45) }");
    expect(has(r.failures, /is too small to read/)).toBe(true);
    // Fragments in place of the waiting ring: four corner blocks, and a hollow square.
    r = await broken("harness-bright", "", () => {
      for (const f of document.querySelectorAll('[data-state="waiting"] .office-figure-mark svg'))
        f.innerHTML = ["0,0", "9,0", "0,9", "9,9"].map((p) => `<rect x="${p.split(",")[0]}" y="${p.split(",")[1]}" width="4" height="4" style="fill: var(--waiting)"/>`).join("");
    });
    expect(has(r.failures, /mark of f\d+ \(waiting\) (is drawn as a|does not match)/)).toBe(true);
    r = await broken("harness-bright", "", () => {
      for (const f of document.querySelectorAll('[data-state="waiting"] .office-figure-mark svg'))
        f.innerHTML = '<rect x="1.5" y="1.5" width="10" height="10" fill="none" stroke-width="2" style="stroke: var(--waiting)"/>';
    });
    expect(has(r.failures, /mark of f\d+ \(waiting\) (is drawn as a|does not match)/)).toBe(true);
    // A figure body as a full square: clipped to the silhouette it passes; unclipped it fails.
    const squareBody = () => {
      const art = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ff00aa"/></svg>');
      return Promise.all([...document.querySelectorAll<HTMLImageElement>(".office-scene-body")].map((i) => ((i.src = art), i.decode())));
    };
    r = await broken("standard-office", "", squareBody);
    expect(r.failures.filter((f) => f.startsWith("body"))).toEqual([]);
    r = await broken("standard-office", ".office-scene-body { clip-path: none !important }", squareBody);
    expect(has(r.failures, /body of f\d+ paints \d+ pixels outside its silhouette/)).toBe(true);

    // A marks pill that lets the art through, and marks with no paint.
    r = await broken("harness-bright", ".office-figure-flags { background: transparent !important }");
    expect(has(r.failures, /marks pill of f\d+ is drawn as/)).toBe(true);
    r = await broken("standard-office", ".office-flag { opacity: 0 !important } .office-loop { color: transparent !important }");
    expect(has(r.failures, /(gate|changed) mark of f\d+ is drawn at best/)).toBe(true);
    expect(has(r.failures, /loop count of f\d+ text is drawn at best/)).toBe(true);

    // A mark chip that lets the art through.
    r = await broken("harness-bright", ".office-figure-mark { background: transparent !important }");
    expect(has(r.failures, /mark of f\d+ is drawn on rgb/)).toBe(true);
    // A substituted symbol: a block in place of the gate flag.
    r = await broken("standard-office", "", () => {
      for (const svg of document.querySelectorAll('.office-flag[data-mark="gate"]')) svg.innerHTML = '<rect x="3" y="3" width="4" height="4" style="fill: #e8f0f8"/>';
    });
    expect(has(r.failures, /gate mark of f\d+ (is drawn as a|has too little ink)/)).toBe(true);
    // A Safety ring hidden: the figure's outer edge is then not drawn.
    r = await broken("standard-office", ".office-figure-safety { visibility: hidden !important }");
    expect(has(r.failures, /(Safety ring of f\d+ edge is|figure f\d+ meets the scene along only)/)).toBe(true);
    // A lens that asked for a grey but drew the state colour.
    r = await broken("standard-office&lens=gate", "", () => {
      for (const shape of document.querySelectorAll<SVGElement>(".office-figure-mark svg > *")) shape.style.setProperty("fill", "var(--accent)");
    });
    expect(has(r.failures, /lens colour of f\d+ is drawn as/)).toBe(true);

    // A lens colour too dark to read against the mark chip's plate.
    r = await broken("standard-office&lens=gate", "", () => {
      for (const shape of document.querySelectorAll<SVGElement>(".office-figure-mark svg > *")) shape.style.setProperty("fill", "#1c1d22");
    });
    expect(has(r.failures, /mark of f\d+ .* is drawn at best [\d.]+:1 on its plate, under 3:1/)).toBe(true);

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
    // A symbol frozen at its old shape while the state moves on: the timer never sees it drawn, and
    // the drawn check finds the wrong shape.
    await open(page, "theme=standard-office&agents=40");
    await page.evaluate(() => {
      const svg = document.querySelector('[data-figure="f1"] .office-figure-mark svg')!;
      const old = svg.innerHTML;
      new MutationObserver(() => {
        if (svg.innerHTML !== old) svg.innerHTML = old;
      }).observe(svg, { childList: true, subtree: true });
    });
    expect(await eventToScreen(page)).toBe(Number.POSITIVE_INFINITY);
    await page.emulateMedia({ reducedMotion: "reduce" });
    r = await drawnOf(page);
    expect(has(r.failures, /mark of f1 \(needs\) is drawn as a circle/)).toBe(true);
  });

  for (const theme of THEMES) {
    test.describe(theme, () => {
      test("contrast and state shapes as drawn, at minimum zoom with 40 agents", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, `theme=${theme}&agents=40&zoom=0.8`);
        const result = await drawnOf(page);
        measurements[`${theme}/drawn`] = result.summary;
        expect(result.failures).toEqual([]);
        // Every element was measured: 13 plates, 40 codes, marks, outlines and bodies, all five shapes.
        const withMarks = await page.evaluate(() => ({ safety: document.querySelectorAll(".office-figure-safety").length, flags: document.querySelectorAll(".office-figure-flags").length }));
        expect(withMarks.safety).toBeGreaterThan(0);
        expect(withMarks.flags).toBeGreaterThan(0);
        expect(result.summary.counted).toEqual({ plate: 13, code: 40, mark: 40, outline: 40, body: 40, tint: 0, ...withMarks });
        expect(Object.keys(result.summary.shapes).sort()).toEqual(["changed", "needs", "stuck", "waiting", "working"]);
      });

      test("every lens recolours the state shapes legibly, and every other check holds under each lens (OV-07)", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        const byLens: Record<string, unknown> = {};
        for (const lens of ["status", "gate", "change", "spend"]) {
          await open(page, `theme=${theme}&agents=40&zoom=0.8&lens=${lens}`);
          const result = await drawnOf(page);
          byLens[lens] = { worstTintRatio: result.summary.worstTintRatio, worstEdgeRatio: result.summary.worstEdgeRatio };
          expect(result.failures, lens).toEqual([]);
          expect(result.summary.counted.tint, lens).toBe(40);
        }
        measurements[`${theme}/lenses`] = byLens;
      });

      test("the worst case: every place filled and every figure carrying every mark, at minimum zoom (OV-08)", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, `theme=${theme}&agents=all&zoom=0.8&marks=all`);
        const places = await page.evaluate(() => document.querySelectorAll(".office-figure").length);
        expect(places).toBeGreaterThan(40);
        const drawn = await drawnOf(page);
        expect(drawn.failures).toEqual([]);
        expect(drawn.summary.counted).toMatchObject({ safety: places, flags: places });
        // The stage stays at its minimum width; only the count of figures differs from the other cases.
        const legible = await page.evaluate(measureLegibility);
        expect(legible.failures).toEqual([]);
        // The painted extents, rings and bands included, never meet between neighbours.
        const painted = await page.evaluate(measurePaintedOverlap);
        expect(painted).toEqual([]);
        measurements[`${theme}/all-marks`] = { ...drawn.summary, boxes: legible.boxes };
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
        await expect(page.locator('[data-harness="card"] h2')).toHaveText("WP-103");
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
        // What is on screen after the update is the new state's shape for every figure.
        await page.emulateMedia({ reducedMotion: "reduce" });
        const after = await drawnOf(page);
        expect(after.failures.filter((f) => f.startsWith("mark of"))).toEqual([]);
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
        await expect(page.locator('[data-harness="card"] h2')).toHaveText("WP-107");
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
 * Runs in the page. Decodes the five renders from drawnOf and measures each semantic element from
 * pixels the semantic layer demonstrably paints (the same colour over both key backgrounds):
 *  - its plate is drawn in the opaque plate colour, so no art shows through;
 *  - its text reaches 4.5:1 on that plate in drawn pixels, with enough ink for every character;
 *  - at every point of its edge that meets the scene, its own painted ring or plate reaches 3:1
 *    against the scene just past it, and at least a quarter of its edge meets the scene;
 *  - its state mark reaches 3:1, and matches its state's shape against raster templates drawn from
 *    the application's own geometry better than any other shape, within tolerance;
 * and each figure body paints nothing outside the outlined silhouette.
 */
async function measureDrawn(input: { full: string; scene: string; bare: string; keyA: string; keyB: string; plate: { r: number; g: number; b: number } }) {
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
  const [fullImg, sceneImg, bareImg, keyAImg, keyBImg] = await Promise.all([input.full, input.scene, input.bare, input.keyA, input.keyB].map(decode)) as [ImageData, ImageData, ImageData, ImageData, ImageData];
  const plate = input.plate;
  const stage = document.querySelector(".office-stage")!.getBoundingClientRect();
  type RGB = { r: number; g: number; b: number };
  const at = (img: ImageData, x: number, y: number): RGB | null => {
    const px = Math.floor(x - stage.left), py = Math.floor(y - stage.top);
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return null;
    const i = (py * img.width + px) * 4;
    return { r: img.data[i]!, g: img.data[i + 1]!, b: img.data[i + 2]! };
  };
  const close = (a: RGB, b: RGB, tol: number) => Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;
  /**
   * Painted by the semantic layer: the share of a pixel the semantic layer covers is one minus how far
   * its colour moves between the magenta and the green key (anti-aliased edges cover part of a pixel).
   * A pixel is owned at 75% coverage or more.
   */
  const owned = (x: number, y: number) => {
    const a = at(keyAImg, x, y), b = at(keyBImg, x, y);
    if (!a || !b) return false;
    const moved = Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) / 255;
    return 1 - moved >= 0.75;
  };
  /** Untouched by the semantic layer: exactly the key colour in both key renders. */
  const unpainted = (x: number, y: number) => {
    const a = at(keyAImg, x, y), b = at(keyBImg, x, y);
    return !!a && !!b && close(a, { r: 255, g: 0, b: 255 }, 2) && close(b, { r: 0, g: 255, b: 0 }, 2);
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
  const failures: string[] = [];
  const worst = { iconMismatch: 0, tint: Infinity, glyphInk: Infinity, text: Infinity, mark: Infinity, edge: Infinity, inkPerChar: Infinity, edgeCoverage: Infinity, templateMatch: 0, templateMargin: Infinity };
  const counted = { plate: 0, code: 0, mark: 0, outline: 0, body: 0, tint: 0, safety: 0, flags: 0 };
  const shapes: Record<string, string> = {};

  const pixelsIn = (img: ImageData, l: number, t: number, r: number, b: number) => {
    const out: { x: number; y: number; c: RGB }[] = [];
    for (let y = Math.floor(t); y < b; y++)
      for (let x = Math.floor(l); x < r; x++) {
        const c = at(img, x + 0.5, y + 0.5);
        if (c) out.push({ x: x + 0.5, y: y + 0.5, c });
      }
    return out;
  };
  const drawnPlate = (where: string, rect: DOMRect, inset: number) => {
    const bg = mode(pixelsIn(fullImg, rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset).map((p) => p.c));
    if (!close(bg, plate, 3)) failures.push(`${where} is drawn as rgb(${bg.r},${bg.g},${bg.b}), not the opaque plate`);
    return bg;
  };
  /** The box of an element's own text, from a range over its text, not the element's padding or ring. */
  const textBox = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  };
  /**
   * Text as drawn: the fourth strongest owned pixel reaches 4.5:1 on the plate (a stray pixel is not a
   * glyph), and the ink (owned pixels at 3:1 or more) is at least INK_PER_CHAR per visible character,
   * so text with no ink, or clipped to a few glyphs, fails.
   */
  const INK_PER_CHAR = 6;
  /** Each glyph's own inked pixels; the thinnest real glyph (a hyphen) measures several. */
  const GLYPH_INK = 2;
  const textCheck = (where: string, el: Element, bg: RGB) => {
    const box = textBox(el);
    const rs = pixelsIn(fullImg, box.left, box.top, box.right, box.bottom).filter((p) => owned(p.x, p.y)).map((p) => ratio(p.c, bg));
    const strongest = [...rs].sort((a, b) => b - a)[3] ?? 1;
    const chars = (el.textContent ?? "").replace(/\s/g, "").length;
    const ink = rs.filter((r) => r >= 3).length / Math.max(1, chars);
    worst.text = Math.min(worst.text, strongest);
    worst.inkPerChar = Math.min(worst.inkPerChar, ink);
    if (strongest < 4.5) failures.push(`${where} text is drawn at best ${strongest.toFixed(2)}:1 on its plate, under 4.5:1`);
    if (ink < INK_PER_CHAR) failures.push(`${where} text has ${ink.toFixed(1)} inked pixels per character, under ${INK_PER_CHAR}`);
    // Every glyph carries its own ink, inside its own box: visible letters cannot stand in for missing ones.
    const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    if (node) {
      const text = node.textContent ?? "";
      const missing: string[] = [];
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i]!)) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const g = range.getBoundingClientRect();
        const inked = pixelsIn(fullImg, g.left, g.top, g.right, g.bottom).filter((q) => owned(q.x, q.y) && ratio(q.c, bg) >= 3).length;
        worst.glyphInk = Math.min(worst.glyphInk, inked);
        if (inked < GLYPH_INK) missing.push(`${text[i]}@${i}`);
      }
      if (missing.length) failures.push(`${where} text has glyphs with no ink: ${missing.join(" ")}`);
    }
  };

  /**
   * One edge point. Excluded only where semantic paint demonstrably touches the scene just past it
   * (another element, or its anti-aliased rim, meets this one there); the scene is only ever measured
   * where the key renders show the semantic layer painted nothing. Otherwise: the scene just past the ring, against the best
   * owned pixel across the element's boundary, sampled every quarter pixel through its 2px ring and
   * into its own border or plate (`depth`: never deeper than its own opaque band). No owned pixel
   * there means no edge was drawn: 1:1.
   */
  let lastWorst = { v: Infinity, info: "" };
  // Parts that are actually shown, in paint order: a later part paints over an earlier one.
  const parts = [...document.querySelectorAll(".office-plate, .office-figure-outline, .office-figure-safety, .office-figure-flags, .office-figure-mark, .office-figure-code")];
  const shown = new Set(parts.filter((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true })));
  // Paint order: a part with a higher z-index paints over one with a lower, and within the same
  // z-index the later in the document paints over the earlier.
  const paintOrder = new Map(parts.map((e, i) => [e, (Number.parseInt(getComputedStyle(e).zIndex) || 0) * 100000 + i]));
  const coveredBy = (self: Element, x: number, y: number) =>
    parts.some((e) => {
      // Each figure is its own stacking context (it is transformed), so only parts of the same figure
      // (or plates among plates) can cover one another; separate elements are kept apart by the
      // legibility check. A covering part's own opacity is held by its own plate check.
      if (e === self || self.closest(".office-figure") !== e.closest(".office-figure")) return false;
      if (!shown.has(e) || (paintOrder.get(e) ?? 0) < (paintOrder.get(self) ?? 0)) return false;
      const r = e.getBoundingClientRect();
      const round = e.classList.contains("office-figure-mark") || e.classList.contains("office-figure-outline") || e.classList.contains("office-figure-safety");
      // The covering part's own 2px ring and its anti-aliased fringe (about a pixel more) count: where
      // they lie, the edge seen is that part's, and its own check measures it.
      const g = 3.25;
      const dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      // The Safety ring is a ring: it covers only its own bands (4px inside its edge, 2px outside),
      // never the disc it encloses.
      const inside = e.classList.contains("office-figure-safety")
        ? dist >= r.width / 2 - 4 - 1 && dist <= r.width / 2 + 2 + g
        : round ? dist <= r.width / 2 + g : x >= r.left - g && x <= r.right + g && y >= r.top - g && y <= r.bottom + g;
      return inside && !unpainted(x, y);
    });
  const edgePoint = (self: Element, depth: number, ox: number, oy: number, nx: number, ny: number) => {
    // A shown part painted over this edge hides it there; that span is not measured.
    if (coveredBy(self, ox, oy)) return null;
    const sx = ox + nx * 4.5, sy = oy + ny * 4.5;
    const sceneC = at(sceneImg, sx, sy);
    if (!sceneC || !unpainted(sx, sy)) return null;
    let best = 1;
    for (let d = -depth; d <= 1.75; d += 0.25) {
      const x = ox + nx * d, y = oy + ny * d;
      const c = at(fullImg, x, y);
      if (c && owned(x, y)) best = Math.max(best, ratio(c, sceneC));
    }
    if (best < lastWorst.v) lastWorst = { v: best, info: `at ${Math.round(ox)},${Math.round(oy)}, scene ${sceneC.r},${sceneC.g},${sceneC.b}` };
    return best;
  };
  // A figure's parts overlap one another, so its coverage is pooled over all its parts: the figure's
  // silhouette must meet the scene, not every part of it. A plate stands alone and is judged alone.
  let pool: { measured: number; total: number } | null = null;
  const edgeCheck = (where: string, self: Element, round: boolean, depth: number, radius = 0) => {
    const r = self.getBoundingClientRect();
    let c = Infinity, total = 0, measured = 0;
    lastWorst = { v: Infinity, info: "" };
    const take = (ox: number, oy: number, nx: number, ny: number) => {
      total++;
      const v = edgePoint(self, depth, ox, oy, nx, ny);
      if (v === null) return;
      measured++;
      c = Math.min(c, v);
    };
    if (round) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
      for (let a = 0; a < 360; a += 6) {
        const nx = Math.cos((a * Math.PI) / 180), ny = Math.sin((a * Math.PI) / 180);
        take(cx + rad * nx, cy + rad * ny, nx, ny);
      }
    } else {
      // Straight runs only; corners are rounded.
      for (let x = r.left + radius + 1; x <= r.right - radius - 1; x += 2) {
        take(x, r.top, 0, -1);
        take(x, r.bottom, 0, 1);
      }
      for (let y = r.top + radius + 1; y <= r.bottom - radius - 1; y += 2) {
        take(r.left, y, -1, 0);
        take(r.right, y, 1, 0);
      }
    }
    if (pool) {
      pool.measured += measured;
      pool.total += total;
    } else {
      const coverage = total ? measured / total : 0;
      worst.edgeCoverage = Math.min(worst.edgeCoverage, coverage);
      if (coverage < 0.25) failures.push(`${where} meets the scene along only ${Math.round(coverage * 100)}% of its edge`);
    }
    worst.edge = Math.min(worst.edge, c);
    if (c < 3) failures.push(`${where} edge is ${c.toFixed(2)}:1 against the scene (${lastWorst.info})`);
  };

  /**
   * Raster templates of the five state shapes, drawn from StateMark's own geometry at a 13px mark and
   * at the measured mark's sub-pixel offset, as coverage between 0 and 1 per pixel.
   */
  const S = 13;
  const TEMPLATES: Record<string, (g: CanvasRenderingContext2D) => void> = {
    circle: (g) => {
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      g.fill();
    },
    diamond: (g) => {
      g.translate(S / 2, S / 2);
      g.rotate(Math.PI / 4);
      g.fillRect(-S * 0.35, -S * 0.35, S * 0.7, S * 0.7);
    },
    ring: (g) => {
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
      g.lineWidth = 2;
      g.stroke();
    },
    square: (g) => {
      g.beginPath();
      g.roundRect(0.5, 0.5, S - 1, S - 1, 1);
      g.fill();
    },
    triangle: (g) => g.fill(new Path2D(`M${S / 2} 0.5L${S - 0.5} ${S - 0.5}H0.5z`)),
  };
  const template = (name: string, gx: number, gy: number, w: number, h: number, ox: number, oy: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.strokeStyle = "#fff";
    g.translate(ox - gx, oy - gy);
    TEMPLATES[name]!(g);
    const d = g.getImageData(0, 0, w, h).data;
    return Array.from({ length: w * h }, (_, i) => d[i * 4 + 3]! / 255);
  };
  const EXPECTED: Record<string, string> = { working: "circle", needs: "diamond", waiting: "ring", stuck: "square", changed: "triangle" };
  /** The marks pill's two symbols, drawn from OfficeStage's own path data at 10px. */
  const ICONS: Record<string, (g: CanvasRenderingContext2D) => void> = {
    gate: (g) => {
      g.lineWidth = 1.5;
      g.stroke(new Path2D("M2 1v8.5"));
      g.fill(new Path2D("M2.5 1.2h6l-1.6 2.2 1.6 2.2h-6z"));
    },
    changed: (g) => {
      g.lineWidth = 1.6;
      g.lineJoin = "round";
      g.stroke(new Path2D("M5 1.2 9 8.6H1z"));
    },
  };
  /** Midway between measurements: real symbols match within 0.21 with ink 27 to 31; a substituted block matches at 0.65 or worse with ink 14. */
  const ICON_TOLERANCE = 0.43;
  const ICON_MIN_INK = 20;
  const classifyIcon = (ir: DOMRect, bg: RGB) => {
    // Only the icon's own box: one pixel more reaches the next symbol in the pill.
    const gx = Math.floor(ir.left), gy = Math.floor(ir.top);
    const w = Math.ceil(ir.right) - gx, h = Math.ceil(ir.bottom) - gy;
    const lp = lum(bg);
    const px: { v: number; l: number }[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const cx = gx + x + 0.5, cy = gy + y + 0.5;
        // A pixel counts only when its centre lies inside the icon; the next symbol starts a pixel away.
        const within = cx >= ir.left && cx <= ir.right && cy >= ir.top && cy <= ir.bottom;
        const c = within ? at(fullImg, cx, cy) : null;
        px.push({ v: 0, l: c && owned(cx, cy) ? lum(c) : lp });
      }
    const lm = Math.max(...px.map((p) => p.l));
    for (const p of px) p.v = lm - lp < 0.05 ? 0 : Math.min(1, Math.max(0, (p.l - lp) / (lm - lp)));
    const ink = px.reduce((n, p) => n + p.v, 0);
    const scores = Object.keys(ICONS).map((name) => {
      let mismatch = Infinity;
      for (const dx of [-0.5, -0.25, 0, 0.25, 0.5])
        for (const dy of [-0.5, -0.25, 0, 0.25, 0.5]) {
          const cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          const g = cv.getContext("2d")!;
          g.fillStyle = "#fff";
          g.strokeStyle = "#fff";
          g.translate(ir.left + dx - gx, ir.top + dy - gy);
          ICONS[name]!(g);
          const d = g.getImageData(0, 0, w, h).data;
          let diff = 0, union = 0;
          px.forEach((p, i) => {
            const t = d[i * 4 + 3]! / 255;
            diff += Math.abs(p.v - t);
            union += Math.max(p.v, t);
          });
          mismatch = Math.min(mismatch, diff / Math.max(1, union));
        }
      return { name, mismatch };
    }).sort((a, b) => a.mismatch - b.mismatch);
    const two = (n: number) => Math.round(n * 100) / 100;
    return { shape: scores[0]!.name, mismatch: two(scores[0]!.mismatch), ink: two(ink) };
  };
  /**
   * Below this mismatch a drawn mark is its template. Measured: real marks at most 0.21 (the thin
   * ring; filled shapes 0.10 or less); a hollow square in place of the ring 0.44; fragments 0.70 or more.
   */
  const MATCH_TOLERANCE = 0.32;
  const classify = (svg: DOMRect, bg: RGB, keep: (x: number, y: number) => boolean) => {
    const gx = Math.floor(svg.left) - 1, gy = Math.floor(svg.top) - 1;
    const w = Math.ceil(svg.right) + 1 - gx, h = Math.ceil(svg.bottom) + 1 - gy;
    const lp = lum(bg);
    const px: { v: number; keep: boolean; x: number; y: number; l: number }[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = at(fullImg, gx + x + 0.5, gy + y + 0.5);
        const k = keep(gx + x + 0.5, gy + y + 0.5);
        px.push({ v: 0, keep: k, x, y, l: c ? lum(c) : lp });
      }
    const lm = Math.max(...px.filter((p) => p.keep).map((p) => p.l));
    if (lm - lp < 0.05) return { shape: "nothing", size: 0, mismatch: 1, margin: 0 };
    for (const p of px) p.v = p.keep ? Math.min(1, Math.max(0, (p.l - lp) / (lm - lp))) : 0;
    const solid = px.filter((p) => p.v > 0.5);
    const size = solid.length ? Math.min(Math.max(...solid.map((p) => p.x)) - Math.min(...solid.map((p) => p.x)), Math.max(...solid.map((p) => p.y)) - Math.min(...solid.map((p) => p.y))) + 1 : 0;
    // Each template at its best fit within half a pixel, so rasterizer registration is not mistaken for shape.
    const OFFSETS = [-0.5, -0.25, 0, 0.25, 0.5];
    const scores = Object.keys(TEMPLATES).map((name) => {
      let mismatch = Infinity;
      for (const dx of OFFSETS)
        for (const dy of OFFSETS) {
          const t = template(name, gx, gy, w, h, svg.left + dx, svg.top + dy);
          let diff = 0, union = 0;
          px.forEach((p, i) => {
            const tv = p.keep ? t[i]! : 0;
            diff += Math.abs(p.v - tv);
            union += Math.max(p.v, tv);
          });
          mismatch = Math.min(mismatch, diff / Math.max(1, union));
        }
      return { name, mismatch };
    }).sort((a, b) => a.mismatch - b.mismatch);
    const two = (n: number) => Math.round(n * 100) / 100;
    return { shape: scores[0]!.name, size, mismatch: two(scores[0]!.mismatch), margin: two(scores[1]!.mismatch - scores[0]!.mismatch) };
  };

  for (const p of document.querySelectorAll(".office-plate")) {
    const r = p.getBoundingClientRect();
    const where = `plate "${p.querySelector(".office-plate-name")!.textContent}"`;
    const bg = drawnPlate(where, r, 2);
    textCheck(`${where} name`, p.querySelector(".office-plate-name")!, bg);
    textCheck(`${where} label`, p.querySelector(".office-plate-label")!, bg);
    edgeCheck(where, p, false, 3, 6);
    counted.plate++;
  }
  for (const f of document.querySelectorAll(".office-figure")) {
    const id = f.getAttribute("data-figure");
    const state = f.getAttribute("data-state")!;
    pool = { measured: 0, total: 0 };
    const code = f.querySelector(".office-figure-code")!;
    const codeBg = drawnPlate(`code of ${id}`, code.getBoundingClientRect(), 1);
    textCheck(`code of ${id}`, code, codeBg);
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
    if (!close(markBg, plate, 3)) failures.push(`mark of ${id} is drawn on rgb(${markBg.r},${markBg.g},${markBg.b}), not the opaque plate`);
    const svg = mark.querySelector("svg")!.getBoundingClientRect();
    // Only the chip's own disc: past it lie the chip's rim and the outline's ring, which are not the mark.
    const onChip = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= mr.width / 2 - 1.5 && owned(x, y);
    const strongest = pixelsIn(fullImg, svg.left, svg.top, svg.right, svg.bottom).filter((q) => onChip(q.x, q.y)).map((q) => ratio(q.c, markBg)).sort((a, b) => b - a)[3] ?? 1;
    worst.mark = Math.min(worst.mark, strongest);
    if (strongest < 3) failures.push(`mark of ${id} (${state}) is drawn at best ${strongest.toFixed(2)}:1 on its plate, under 3:1`);
    const seen = classify(svg, markBg, onChip);
    // Real marks measure 11 to 13px across; a mark shrunk by half measures about 5.
    if (seen.size < 8) failures.push(`mark of ${id} (${state}) is too small to read: ${seen.size}px`);
    else if (seen.shape !== EXPECTED[state]) failures.push(`mark of ${id} (${state}) is drawn as a ${seen.shape}, not a ${EXPECTED[state]} ${JSON.stringify(seen)}`);
    else if (seen.mismatch > MATCH_TOLERANCE) failures.push(`mark of ${id} (${state}) does not match the ${EXPECTED[state]} closely enough ${JSON.stringify(seen)}`);
    else {
      worst.templateMatch = Math.max(worst.templateMatch, seen.mismatch);
      worst.templateMargin = Math.min(worst.templateMargin, seen.margin);
    }
    shapes[state] ??= JSON.stringify(seen);
    // The chip is plate from its rim to the shape's farthest corner, 2.5px in.
    edgeCheck(`mark of ${id}`, mark, true, 2);
    counted.mark++;
    // The outline is a 2px dark border with the body art inside it. A Safety ring encloses it, so
    // then the figure's edge against the scene is the Safety ring's: dark, light and dark again.
    const outline = f.querySelector(".office-figure-outline")!;
    const safety = f.querySelector(".office-figure-safety");
    if (safety) {
      edgeCheck(`Safety ring of ${id}`, safety, true, 3.75);
      counted.safety++;
    } else edgeCheck(`outline of ${id}`, outline, true, 1.75);
    counted.outline++;
    // The marks pill: an opaque plate whose flag and triangle reach 3:1 and whose loop count reads 4.5:1.
    const flags = f.querySelector(".office-figure-flags");
    if (flags) {
      const fr = flags.getBoundingClientRect();
      const pillBg = drawnPlate(`marks pill of ${id}`, fr, 1);
      for (const icon of flags.querySelectorAll("svg")) {
        const kind = icon.getAttribute("data-mark")!;
        const ir = icon.getBoundingClientRect();
        const rs = pixelsIn(fullImg, ir.left, ir.top, ir.right, ir.bottom).filter((q) => owned(q.x, q.y)).map((q) => ratio(q.c, pillBg)).sort((a, b) => b - a);
        const c = rs[3] ?? 1;
        worst.mark = Math.min(worst.mark, c);
        if (c < 3) failures.push(`${kind} mark of ${id} is drawn at best ${c.toFixed(2)}:1 on its plate, under 3:1`);
        else {
          // Its geometry, matched against the flag and the triangle drawn from the same path data.
          const seen = classifyIcon(ir, pillBg);
          if (seen.ink < ICON_MIN_INK) failures.push(`${kind} mark of ${id} has too little ink to read: ${seen.ink.toFixed(1)}`);
          else if (seen.shape !== kind || seen.mismatch > ICON_TOLERANCE) failures.push(`${kind} mark of ${id} is drawn as a ${seen.shape} ${JSON.stringify(seen)}`);
          else worst.iconMismatch = Math.max(worst.iconMismatch, seen.mismatch);
        }
      }
      const loop = flags.querySelector(".office-loop");
      if (loop) textCheck(`loop count of ${id}`, loop, pillBg);
      edgeCheck(`marks pill of ${id}`, flags, false, 1.75, 5);
      counted.flags++;
    }
    // A lens recolours the state shape (OV-07): the drawn shape must be the lens colour, which its
    // ink check above already holds to 3:1 against the chip's plate.
    const requested = f.getAttribute("data-tint");
    if (requested) {
      // The colour the lens asked for, resolved on its own (never read back from the shape it is
      // meant to have recoloured).
      const expected = (() => {
        const probe = document.createElement("span");
        probe.style.color = requested;
        document.body.append(probe);
        const v = getComputedStyle(probe).color;
        probe.remove();
        const m = v.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
        return m ? { r: +m[1]!, g: +m[2]!, b: +m[3]! } : null;
      })();
      const strong = pixelsIn(fullImg, svg.left, svg.top, svg.right, svg.bottom).filter((q) => onChip(q.x, q.y) && ratio(q.c, markBg) >= 3).map((q) => q.c);
      const drawn = strong.length ? mode(strong) : null;
      if (!expected || !drawn || !close(drawn, expected, 12)) failures.push(`lens colour of ${id} is drawn as ${drawn ? `rgb(${drawn.r},${drawn.g},${drawn.b})` : "nothing"}, not rgb(${expected?.r},${expected?.g},${expected?.b})`);
      else worst.tint = Math.min(worst.tint, ratio(drawn, markBg));
      counted.tint++;
    }
    {
      // Measured, the most covered figures keep about a fifth of their edges against the scene; a
      // figure with none measured at all is never passed.
      const coverage = pool.total ? pool.measured / pool.total : 0;
      worst.edgeCoverage = Math.min(worst.edgeCoverage, coverage);
      if (pool.measured === 0 || coverage < 0.15) failures.push(`figure ${id} meets the scene along only ${Math.round(coverage * 100)}% of its edges`);
      pool = null;
    }
    // The body paints nothing outside the silhouette the outline encloses (its inner radius): within
    // the body image's own box, outside that circle, the scene with bodies matches the scene without.
    // Re-rasterized scene art differs by up to about 8 per channel between renders; body paint far more.
    const o = outline.getBoundingClientRect();
    const ox = o.left + o.width / 2, oy = o.top + o.height / 2, inner = o.width / 2 - 2;
    const body = document.querySelectorAll(".office-scene-body")[counted.body]?.getBoundingClientRect();
    let spill = 0;
    if (body)
      for (const q of pixelsIn(sceneImg, body.left, body.top, body.right, body.bottom)) {
        if (Math.hypot(q.x - ox, q.y - oy) <= inner + 0.75) continue;
        const without = at(bareImg, q.x, q.y);
        if (without && !close(q.c, without, 24)) spill++;
      }
    if (spill > 0) failures.push(`body of ${id} paints ${spill} pixels outside its silhouette`);
    counted.body++;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    failures,
    summary: {
      counted,
      shapes,
      worstTextRatio: round(worst.text),
      worstTintRatio: worst.tint === Infinity ? null : round(worst.tint),
      worstInkPerChar: round(worst.inkPerChar),
      fewestGlyphInk: worst.glyphInk,
      worstMarkRatio: round(worst.mark),
      worstEdgeRatio: round(worst.edge),
      worstEdgeCoverage: round(worst.edgeCoverage),
      worstTemplateMismatch: round(worst.templateMatch),
      worstIconMismatch: round(worst.iconMismatch),
      smallestTemplateMargin: round(worst.templateMargin),
    },
  };
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
  const parts = document.querySelectorAll(".office-plate, .office-figure-outline, .office-figure-flags, .office-figure-mark, .office-figure-code");
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
    const box = union(`figure ${f.getAttribute("data-figure")}`, [...f.querySelectorAll(".office-figure-outline, .office-figure-safety, .office-figure-flags, .office-figure-mark, .office-figure-code")]);
    // At most five marks on a figure (OV-08): the state shape, and the gate flag, changed input
    // triangle, loop count and Safety ring.
    const marks = 1 + f.querySelectorAll(".office-figure-flags [data-mark]").length + f.querySelectorAll(".office-figure-safety").length;
    if (marks > 5) failures.push(`figure ${f.getAttribute("data-figure")} carries ${marks} marks, more than five`);
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

/** Runs in the page: no two figures' painted extents (rings and bands included) meet. */
function measurePaintedOverlap() {
  const failures: string[] = [];
  // Every part paints 2px outside its box: a light ring, or for the Safety ring (whose light band is
  // a border inside its box) its outer dark band.
  const outer = (_e: Element) => 2;
  const boxes = [...document.querySelectorAll(".office-figure")].map((f) => {
    const rs = [...f.querySelectorAll(".office-figure-outline, .office-figure-safety, .office-figure-flags, .office-figure-mark, .office-figure-code")].map((e) => {
      const r = e.getBoundingClientRect();
      const o = outer(e);
      return { l: r.left - o, t: r.top - o, r: r.right + o, b: r.bottom + o };
    });
    return { name: f.getAttribute("data-figure"), l: Math.min(...rs.map((r) => r.l)), t: Math.min(...rs.map((r) => r.t)), r: Math.max(...rs.map((r) => r.r)), b: Math.max(...rs.map((r) => r.b)) };
  });
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, c = boxes[j]!;
      if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) failures.push(`figure ${a.name} paints into figure ${c.name}`);
    }
  return failures;
}
