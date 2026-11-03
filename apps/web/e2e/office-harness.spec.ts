import { expect, type Page, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The office theme quality harness (plan task 4.3; specification 18). Every theme the repository
 * carries is measured on the draft harness page, never by inspecting its files alone:
 *  - contrast: every name plate, package code and state mark against the pixels actually drawn
 *    (text 4.5:1 on its plate, marks 3:1 on theirs, and each plate's edge 3:1 against the scene);
 *  - occlusion: every semantic element is the topmost thing at its own points;
 *  - pointer interception: nothing in the scene layer can take a pointer;
 *  - legibility at minimum zoom with 40 agents: nothing overlaps, nothing is clipped, nothing is small;
 *  - frame budget with 40 agents, and event to screen time;
 *  - reduced motion: no animation at all;
 *  - a theme switch keeps selection, scroll position and the open card.
 * Lenses arrive with the renderer (plan task 4.8); this harness then runs each contrast case per lens.
 * Set OFFICE_HARNESS_EVIDENCE to a file path to record the measurements.
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

test.describe("office theme quality harness", () => {
  test("offers exactly the themes this harness measures", async ({ page }) => {
    await open(page, "");
    const ids = await page.locator('[data-harness="theme"] option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(ids).toEqual([...THEMES]);
  });

  test("the harness catches a broken semantic layer", async ({ page }) => {
    // Each check must fail when the thing it guards breaks; otherwise a green run proves nothing.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "theme=harness-bright&agents=40&zoom=0.8");
    await page.addStyleTag({ content: ".office-plate, .office-figure-code { background: transparent !important }" });
    const see = await contrastOf(page);
    expect(see.failures.some((f) => f.includes("not the opaque plate"))).toBe(true);
    expect(see.failures.some((f) => /text is [\d.]+:1 on its plate/.test(f))).toBe(true);

    await open(page, "theme=harness-bright&agents=40&zoom=0.8");
    await page.addStyleTag({ content: ".office-scene { z-index: 2 !important } .office-scene img { pointer-events: auto !important }" });
    const hit = await page.evaluate(measureOcclusion);
    expect(hit.failures.some((f) => f.startsWith("the scene layer"))).toBe(true);
    expect(hit.failures.some((f) => f.includes("takes pointers"))).toBe(true);
    expect(hit.failures.some((f) => f.includes("is covered at"))).toBe(true);

    await open(page, "theme=harness-bright&agents=40&zoom=0.8");
    await page.addStyleTag({ content: ".office-plate-label { font-size: 9px !important } .office-figure-code { font-size: 15px !important }" });
    await page.locator('[data-figure="f2"]').evaluate((e) => ((e as HTMLElement).style.left = (document.querySelector('[data-figure="f10"]') as HTMLElement).style.left));
    const read = await page.evaluate(measureLegibility);
    expect(read.failures.some((f) => f.startsWith("text is too small"))).toBe(true);
    expect(read.failures.some((f) => f.includes("touches"))).toBe(true);
  });

  for (const theme of THEMES) {
    test.describe(theme, () => {
      test("contrast of every label and mark over the scene, at minimum zoom with 40 agents", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, `theme=${theme}&agents=40&zoom=0.8`);
        const result = await contrastOf(page);
        measurements[`${theme}/contrast`] = result.summary;
        expect(result.failures).toEqual([]);
        // Every kind of element was measured: 13 plates, 40 codes, 40 marks, 40 outlines.
        expect(result.summary.counted).toEqual({ plate: 13, code: 40, mark: 40, outline: 40 });
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

      test("frame budget and event to screen time with 40 agents", async ({ page }) => {
        await open(page, `theme=${theme}&agents=40`);
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
        const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
        const toScreen = await page.evaluate(
          () =>
            new Promise<number>((done) => {
              const t0 = performance.now();
              (document.querySelector('[data-harness="shift"]') as HTMLButtonElement).click();
              requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - t0)));
            }),
        );
        measurements[`${theme}/frames`] = { frames: frames.length, p95Ms: Math.round(p95 * 10) / 10, eventToScreenMs: Math.round(toScreen) };
        // CI machines are not the reference machine: 30 frames per second here, 60 there (Q-10).
        expect(p95).toBeLessThan(1000 / 30);
        // Event to screen under 500 ms (Q-10).
        expect(toScreen).toBeLessThan(500);
        await expect(page.locator('[data-figure="f1"]')).toHaveAttribute("data-state", "needs");
      });

      test("reduced motion stops every animation", async ({ page }) => {
        await open(page, `theme=${theme}&agents=40`);
        const moving = await page.evaluate(() => document.getAnimations().length);
        expect(moving).toBeGreaterThan(0);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
        measurements[`${theme}/motion`] = { animationsInFullMotion: moving, animationsReduced: 0 };
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

/** Screenshots the stage with and without its semantic layer and measures contrast in the page. */
async function contrastOf(page: Page) {
  const stage = page.locator(".office-stage");
  const semantic = page.locator(".office-semantic");
  await semantic.evaluate((e) => ((e as HTMLElement).style.visibility = "hidden"));
  const scene = (await stage.screenshot()).toString("base64");
  await semantic.evaluate((e) => ((e as HTMLElement).style.visibility = ""));
  const full = (await stage.screenshot()).toString("base64");
  return page.evaluate(measureContrast, { scene, full, plate: PLATE });
}

/**
 * Runs in the page. Decodes two screenshots of the stage (scene only, and everything) and measures
 * each semantic element: its plate's drawn colour (which must be the opaque plate colour, so no art
 * shows through), its text or mark colour against that plate, and the scene just outside its edge
 * against both the dark plate and the light ring drawn around it; the better of the two must reach 3:1.
 */
async function measureContrast({ scene, full, plate }: { scene: string; full: string; plate: { r: number; g: number; b: number } }) {
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
    const px = Math.round(x - stage.left), py = Math.round(y - stage.top);
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
  const parse = (css: string): RGB => {
    const m = css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (!m) throw new Error(`cannot read the colour ${css}`);
    return { r: +m[1]!, g: +m[2]!, b: +m[3]! };
  };
  const mode = (cs: (RGB | null)[]) => {
    const n = new Map<string, number>();
    for (const c of cs) if (c) n.set(`${c.r},${c.g},${c.b}`, (n.get(`${c.r},${c.g},${c.b}`) ?? 0) + 1);
    const [k] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["0,0,0"];
    const [r, g, b] = k.split(",").map(Number) as [number, number, number];
    return { r, g, b };
  };
  const near = (a: RGB, b: RGB) => Math.abs(a.r - b.r) <= 3 && Math.abs(a.g - b.g) <= 3 && Math.abs(a.b - b.b) <= 3;
  const ringColour = parse(getComputedStyle(document.querySelector(".office-stage")!).getPropertyValue("--office-ring").trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`));
  /** Scene pixels on a loop `out` px outside a box or circle; the worst edge contrast found. */
  const edge = (r: DOMRect, round: boolean, out = 3) => {
    let worst = Infinity;
    const take = (x: number, y: number) => {
      const c = at(sceneImg, x, y);
      if (!c) return;
      worst = Math.min(worst, Math.max(ratio(plate, c), ratio(ringColour, c)));
    };
    if (round) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2 + out;
      for (let a = 0; a < 360; a += 6) take(cx + rad * Math.cos((a * Math.PI) / 180), cy + rad * Math.sin((a * Math.PI) / 180));
    } else {
      for (let x = r.left - out; x <= r.right + out; x += 2) {
        take(x, r.top - out);
        take(x, r.bottom + out);
      }
      for (let y = r.top - out; y <= r.bottom + out; y += 2) {
        take(r.left - out, y);
        take(r.right + out, y);
      }
    }
    return worst;
  };
  const failures: string[] = [];
  const worst = { text: Infinity, mark: Infinity, edge: Infinity };
  const counted = { plate: 0, code: 0, mark: 0, outline: 0 };
  const drawnPlate = (where: string, samples: (RGB | null)[]) => {
    const bg = mode(samples);
    if (!near(bg, plate)) failures.push(`${where} is drawn as rgb(${bg.r},${bg.g},${bg.b}), not the opaque plate`);
    return bg;
  };
  const textCheck = (where: string, el: Element, bg: RGB) => {
    const c = ratio(parse(getComputedStyle(el).color), bg);
    worst.text = Math.min(worst.text, c);
    if (c < 4.5) failures.push(`${where} text is ${c.toFixed(2)}:1 on its plate`);
  };
  const edgeCheck = (where: string, r: DOMRect, round: boolean) => {
    const c = edge(r, round);
    worst.edge = Math.min(worst.edge, c);
    if (c < 3) failures.push(`${where} edge is ${c.toFixed(2)}:1 against the scene`);
  };
  const inner = (r: DOMRect, inset: number) => {
    const out: (RGB | null)[] = [];
    for (let x = r.left + inset; x <= r.right - inset; x += 1) for (let y = r.top + inset; y <= r.bottom - inset; y += 1) out.push(at(fullImg, x, y));
    return out;
  };
  for (const p of document.querySelectorAll(".office-plate")) {
    const r = p.getBoundingClientRect();
    const where = `plate "${p.querySelector(".office-plate-name")!.textContent}"`;
    const bg = drawnPlate(where, inner(r, 2));
    for (const s of p.querySelectorAll("span")) textCheck(where, s, bg);
    edgeCheck(where, r, false);
    counted.plate++;
  }
  for (const f of document.querySelectorAll(".office-figure")) {
    const id = f.getAttribute("data-figure");
    const code = f.querySelector(".office-figure-code")!;
    const cr = code.getBoundingClientRect();
    const codeBg = drawnPlate(`code of ${id}`, inner(cr, 1));
    textCheck(`code of ${id}`, code, codeBg);
    edgeCheck(`code of ${id}`, cr, false);
    counted.code++;
    const mark = f.querySelector(".office-figure-mark")!;
    const mr = mark.getBoundingClientRect();
    const cx = mr.left + mr.width / 2, cy = mr.top + mr.height / 2;
    // The plate shows between the state shape and the chip's rim.
    const ringSamples: (RGB | null)[] = [];
    for (let k = 0; k < 8; k++) {
      const a = ((22.5 + k * 45) * Math.PI) / 180;
      ringSamples.push(at(fullImg, cx + 7.6 * Math.cos(a), cy + 7.6 * Math.sin(a)));
    }
    const markBg = drawnPlate(`mark of ${id}`, ringSamples);
    const shape = mark.querySelector("circle, rect, path")!;
    const style = getComputedStyle(shape);
    const paint = style.fill && style.fill !== "none" ? style.fill : style.stroke;
    const mc = ratio(parse(paint), markBg);
    worst.mark = Math.min(worst.mark, mc);
    if (mc < 3) failures.push(`mark of ${id} (${f.getAttribute("data-state")}) is ${mc.toFixed(2)}:1 on its plate`);
    edgeCheck(`mark of ${id}`, mr, true);
    counted.mark++;
    edgeCheck(`outline of ${id}`, f.querySelector(".office-figure-outline")!.getBoundingClientRect(), true);
    counted.outline++;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { failures, summary: { counted, worstTextRatio: round(worst.text), worstMarkRatio: round(worst.mark), worstEdgeRatio: round(worst.edge) } };
}

/** Runs in the page: every semantic element topmost at its own points, and the scene never taking a pointer. */
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
  if (layer(".office-scene").position !== "absolute" || !(sceneZ < semanticZ)) failures.push(`the scene layer (z ${layer(".office-scene").zIndex}) is not below the semantic layer (z ${layer(".office-semantic").zIndex})`);
  // Every semantic element is topmost at its centre and four inset corners.
  const owns = (target: Element, x: number, y: number) => {
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === target || target.contains(hit));
  };
  const parts = document.querySelectorAll('.office-plate, .office-figure-outline, .office-figure-mark, .office-figure-code');
  for (const p of parts) {
    const r = p.getBoundingClientRect();
    const owner = p.closest(".office-figure") ?? p;
    const inset = Math.min(4, r.width / 3, r.height / 3);
    const points: [number, number][] = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + inset, r.top + inset], [r.right - inset, r.top + inset],
      [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset],
    ];
    // Round parts: test the centre and the four points on the diagonals inside the circle.
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
  for (const f of document.querySelectorAll(".office-figure")) {
    boxes.push(union(`figure ${f.getAttribute("data-figure")}`, [...f.querySelectorAll(".office-figure-outline, .office-figure-mark, .office-figure-code")]));
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
  // The ring drawn outside each box (1.5px) must not touch another element's ring either.
  const gap = 3;
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
