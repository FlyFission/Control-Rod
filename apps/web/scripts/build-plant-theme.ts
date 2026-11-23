/**
 * Builds the Plant theme (docs/superpowers/specs/2026-11-23-plant-view-design.md, section 7) as inert
 * scene data: one site drawing exactly the plant canvas, one SVG per place sized exactly to its region
 * in the plant layout, and the operator bodies. All geometry is authored here, procedurally, as one
 * plan view of a site at night: lit floors, equipment with its screens and lamps, roads, the fence and
 * piping, with light drawn as gradients (themes may not use filters). No text, no reference images,
 * no real plant's layout; the only striping is the hold yard's barrier. The live instruments (the
 * containment, the core, its rods, the annunciator) are application code, never theme art.
 *
 * Called by scripts/build-office-themes.ts, whose renderAll() includes it, so the same drift test
 * covers the committed files. Run that script to rebuild.
 */
import { createHash } from "node:crypto";
import { NAME_BAND, type Region, type RegionId } from "../src/features/office/layout.ts";
import { PLANT_LABELS, PLANT_LAYOUT } from "../src/features/office/plant-layout.ts";

export type Rendered = Map<string, string>;

const ID = "plant";
const CREATOR = "Original procedural vector illustration (Claude Code)";

/**
 * The plant's palette: a site at night under work lights. Steel and concrete in cool, low tones, so
 * the plates and figures read first; light comes only from the things that are on (screens, lamps,
 * the control room) and is drawn with gradients, never with filters, which themes may not use.
 */
export const PLANT_PALETTE = {
  backdrop: "#04070c",
  floor: "#0c141f",
  wall: "#34485f",
  decoration: "#3d5671",
  decorationAlt: "#5a7896",
} as const;
const P = PLANT_PALETTE;
const GRID_MINOR = "#0b1520";
const GRID_MAJOR = "#122236";
const ASPHALT = "#080c12";
const PAINT_WHITE = "#5d6f82";
const PAINT_AMBER = "#8a6a2a";
const FENCE = "#5b7894";
const STEEL = "#2a3b4f";
const STEEL_HI = "#6f8ba8";
const SCREEN = "#46d3ff";
const SCREEN_DIM = "#1f6f96";
const LED_GREEN = "#43e08a";
const LED_AMBER = "#ffb347";
const LED_RED = "#ff5d5d";

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

interface Asset {
  path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  creator: string;
  rightsBasis: "original";
  licenseNoticeId: string;
}

function write(out: Rendered, name: string, text: string, w: number, h: number): Asset {
  const bytes = Buffer.from(text, "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = `${name}.${sha256.slice(0, 12)}.svg`;
  out.set(`public/office-themes/${ID}/${file}`, text);
  return { path: `/office-themes/${ID}/${file}`, sha256, bytes: bytes.byteLength, width: w, height: h, creator: CREATOR, rightsBasis: "original", licenseNoticeId: "Apache-2.0" };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A small deterministic generator, so the art is the same on every build. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One path of evenly spaced lines across a box: the drawing grid, or floor tile joints. */
function lines(x: number, y: number, w: number, h: number, step: number, dir: "both" | "v" | "h" = "both"): string {
  const d: string[] = [];
  if (dir !== "h") for (let gx = x + step; gx < x + w; gx += step) d.push(`M${r1(gx)} ${y}V${y + h}`);
  if (dir !== "v") for (let gy = y + step; gy < y + h; gy += step) d.push(`M${x} ${r1(gy)}H${x + w}`);
  return d.join("");
}

/** Diagonal hatching across a box (clip it to the shape it fills). */
function hatch(x: number, y: number, w: number, h: number, step: number): string {
  const d: string[] = [];
  for (let k = -h; k < w; k += step) d.push(`M${r1(x + k)} ${y + h}L${r1(x + k + h)} ${y}`);
  return d.join("");
}

/** A rectangle's outline with gaps (gates) cut where a walkway crosses it. */
function outlineWithGates(x: number, y: number, w: number, h: number, gates: { x: number; y: number }[], gap: number): string {
  const d: string[] = [];
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const horizontal = y1 === y2;
    const cuts = gates
      .filter((g) => (horizontal ? g.y === y1 && g.x >= Math.min(x1, x2) && g.x <= Math.max(x1, x2) : g.x === x1 && g.y >= Math.min(y1, y2) && g.y <= Math.max(y1, y2)))
      .map((g) => (horizontal ? g.x : g.y))
      .sort((a, b) => a - b);
    let from = horizontal ? x1 : y1;
    const to = horizontal ? x2 : y2;
    for (const c of cuts) {
      const a = c - gap / 2;
      if (a > from) d.push(horizontal ? `M${from} ${y1}H${a}` : `M${x1} ${from}V${a}`);
      from = c + gap / 2;
    }
    if (to > from) d.push(horizontal ? `M${from} ${y1}H${to}` : `M${x1} ${from}V${to}`);
  };
  edge(x, y, x + w, y);
  edge(x, y + h, x + w, y + h);
  edge(x, y, x, y + h);
  edge(x + w, y, x + w, y + h);
  return d.join("");
}

/** Shared gradient definitions; each drawing declares the ones it uses. */
const GRAD = {
  lamp: `<radialGradient id="lamp"><stop offset="0" stop-color="#9fc7ef" stop-opacity=".16"/><stop offset=".55" stop-color="#5f8fc0" stop-opacity=".06"/><stop offset="1" stop-color="#5f8fc0" stop-opacity="0"/></radialGradient>`,
  warm: `<radialGradient id="warm"><stop offset="0" stop-color="#ffd59a" stop-opacity=".2"/><stop offset=".6" stop-color="#ffb347" stop-opacity=".05"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`,
  screenGlow: `<radialGradient id="screenGlow"><stop offset="0" stop-color="${SCREEN}" stop-opacity=".32"/><stop offset="1" stop-color="${SCREEN}" stop-opacity="0"/></radialGradient>`,
  amberGlow: `<radialGradient id="amberGlow"><stop offset="0" stop-color="${LED_AMBER}" stop-opacity=".45"/><stop offset="1" stop-color="${LED_AMBER}" stop-opacity="0"/></radialGradient>`,
  redGlow: `<radialGradient id="redGlow"><stop offset="0" stop-color="${LED_RED}" stop-opacity=".5"/><stop offset="1" stop-color="${LED_RED}" stop-opacity="0"/></radialGradient>`,
  metal: `<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b5068"/><stop offset=".5" stop-color="#25364a"/><stop offset="1" stop-color="#18242f"/></linearGradient>`,
  floor: `<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a27"/><stop offset="1" stop-color="#0a111a"/></linearGradient>`,
  shadeN: `<linearGradient id="shadeN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000000" stop-opacity=".55"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient>`,
  shadeS: `<linearGradient id="shadeS" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000000" stop-opacity=".5"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient>`,
  shadeW: `<linearGradient id="shadeW" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000000" stop-opacity=".45"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient>`,
  shadeE: `<linearGradient id="shadeE" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000000" stop-opacity=".45"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></linearGradient>`,
  glass: `<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fd8ff" stop-opacity=".22"/><stop offset=".5" stop-color="#9fd8ff" stop-opacity=".05"/><stop offset="1" stop-color="#9fd8ff" stop-opacity=".16"/></linearGradient>`,
} as const;
type GradId = keyof typeof GRAD;
const defs = (...ids: GradId[]) => `<defs>${ids.map((i) => GRAD[i]).join("")}</defs>`;

/** A pool of light on the floor. */
const pool = (x: number, y: number, rx: number, ry: number, g: "lamp" | "warm" | "screenGlow" | "amberGlow" | "redGlow" = "lamp") => `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="url(#${g})"/>`;

/** A workstation in plan: a desk, a chair-side edge, and a lit screen facing the operator above it. */
function workstation(x: number, y: number, w = 44, screens = 2): string {
  const p: string[] = [];
  p.push(pool(x, y - 6, w * 0.55, 13, "screenGlow"));
  p.push(`<rect x="${r1(x - w / 2)}" y="${y}" width="${w}" height="11" rx="2" fill="url(#metal)" stroke="#0a0f15" stroke-width=".8"/>`);
  p.push(`<path d="M${r1(x - w / 2 + 2)} ${y + 0.8}H${r1(x + w / 2 - 2)}" stroke="${STEEL_HI}" stroke-width=".7" opacity=".7"/>`);
  const sw = (w - 8 - (screens - 1) * 3) / screens;
  for (let i = 0; i < screens; i++) {
    const sx = x - w / 2 + 4 + i * (sw + 3);
    p.push(`<rect x="${r1(sx)}" y="${y + 3}" width="${r1(sw)}" height="3.2" rx=".8" fill="${SCREEN}" opacity=".85"/>`);
  }
  return p.join("");
}

/** A rack of tiny indicator lamps along a line. */
function leds(x: number, y: number, n: number, step: number, seed: number): string {
  const rand = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = rand();
    const c = v < 0.7 ? LED_GREEN : v < 0.9 ? SCREEN : LED_AMBER;
    out.push(`<circle cx="${r1(x + i * step)}" cy="${y}" r="1.1" fill="${c}" opacity="${v < 0.7 ? 0.75 : 0.9}"/>`);
  }
  return out.join("");
}

/**
 * The shell every place shares: a lit floor with tile joints, wall shading, a heavy wall with an
 * inner highlight, a dark band under the name plate, and the door drawn as a threshold with its swing.
 */
function shell(r: Region, opts: { tile?: number; wall?: number; outdoor?: boolean; seed: number }): { open: string[]; close: string[] } {
  const { w, h } = r;
  const wall = opts.wall ?? 3;
  const clip = `c-${r.id}`;
  const open: string[] = [];
  open.push(`<defs><clipPath id="${clip}"><rect x="0" y="0" width="${w}" height="${h}" rx="6"/></clipPath>${["lamp", "warm", "screenGlow", "amberGlow", "redGlow", "metal", "floor", "shadeN", "shadeS", "shadeW", "shadeE", "glass"].map((g) => GRAD[g as GradId]).join("")}</defs>`);
  open.push(`<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="${opts.outdoor ? ASPHALT : "url(#floor)"}"/>`);
  open.push(`<g clip-path="url(#${clip})">`);
  if (opts.outdoor) {
    // Asphalt: a few faint patches and cracks.
    const rand = rng(opts.seed);
    for (let i = 0; i < 10; i++) open.push(`<ellipse cx="${r1(rand() * w)}" cy="${r1(NAME_BAND + rand() * (h - NAME_BAND))}" rx="${r1(20 + rand() * 40)}" ry="${r1(8 + rand() * 14)}" fill="#0d131b" opacity=".7"/>`);
  } else {
    open.push(`<path d="${lines(0, NAME_BAND, w, h - NAME_BAND, opts.tile ?? 16)}" stroke="#152131" stroke-width=".6" fill="none"/>`);
  }
  // Ceiling lights: a row of soft pools down the room.
  const n = Math.max(2, Math.round(w / 110));
  for (let i = 0; i < n; i++) open.push(pool(((i + 0.5) * w) / n, NAME_BAND + (h - NAME_BAND) * 0.45, w / n / 1.4, (h - NAME_BAND) * 0.42));
  const close: string[] = [];
  // Wall shading, then the dark band the name plate sits on.
  close.push(`<rect x="0" y="${NAME_BAND}" width="${w}" height="14" fill="url(#shadeN)"/>`);
  close.push(`<rect x="0" y="${h - 12}" width="${w}" height="12" fill="url(#shadeS)"/>`);
  close.push(`<rect x="0" y="0" width="10" height="${h}" fill="url(#shadeW)"/>`);
  close.push(`<rect x="${w - 10}" y="0" width="10" height="${h}" fill="url(#shadeE)"/>`);
  close.push(`<rect x="0" y="0" width="${w}" height="${NAME_BAND}" fill="#05090f" opacity=".72"/>`);
  close.push(`<path d="M6 ${NAME_BAND}H${w - 6}" stroke="${P.wall}" stroke-width=".8" opacity=".8"/>`);
  close.push(`</g>`);
  close.push(`<rect x="${wall / 2}" y="${wall / 2}" width="${w - wall}" height="${h - wall}" rx="6" fill="none" stroke="${P.wall}" stroke-width="${wall}"/>`);
  close.push(`<rect x="${wall + 1}" y="${wall + 1}" width="${w - 2 * wall - 2}" height="${h - 2 * wall - 2}" rx="4" fill="none" stroke="${STEEL_HI}" stroke-width=".6" opacity=".35"/>`);
  // The door: a lit threshold cut through the wall where the walkway meets it.
  const door = (r as Region & { door?: { x: number; y: number } }).door;
  if (door) {
    const dx = door.x - r.x;
    const top = door.y === r.y;
    const y = top ? 0 : h - wall - 1;
    close.push(`<rect x="${dx - 15}" y="${y}" width="30" height="${wall + 1}" fill="#1a2a3c"/>`);
    close.push(`<rect x="${dx - 15}" y="${top ? wall + 1 : h - wall - 3}" width="30" height="2" fill="${PAINT_AMBER}" opacity=".9"/>`);

  }
  return { open, close };
}

const local = (r: Region) => r.seats.map((s) => ({ x: s.x - r.x, y: s.y - r.y }));

function place(r: Region): string {
  const { w, h } = r;
  const seed = [...r.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const outdoor = r.id === "bench" || r.id === "quarantine";
  const { open, close } = shell(r, { seed, outdoor, wall: r.kind === "cube-set" ? 3 : 3.5, tile: r.kind === "cube-set" ? 12 : 16 });
  const p = open;
  const seats = local(r);
  const body = NAME_BAND;
  const rand = rng(seed);
  switch (r.id as RegionId) {
    case "process":
    case "mechanical":
    case "electrical":
    case "civil":
    case "assurance":
    case "project-controls": {
      // A work bay: an overhead cable tray down the middle, a workstation for each operator, an
      // equipment rack along the back wall with its lamps, and a painted aisle line.
      const tray = (seats[0]!.y + seats[3]!.y) / 2 + 4;
      p.push(`<rect x="10" y="${tray - 5}" width="${w - 20}" height="10" fill="#0d1520" stroke="${STEEL}" stroke-width="1"/>`);
      p.push(`<path d="${lines(10, tray - 5, w - 20, 10, 8, "v")}" stroke="${STEEL}" stroke-width=".8"/>`);
      p.push(`<path d="M12 ${tray - 1.5}H${w - 12}" stroke="#2f6d8c" stroke-width="1.4" opacity=".7"/><path d="M12 ${tray + 1.8}H${w - 12}" stroke="#7a5f2c" stroke-width="1.2" opacity=".6"/>`);
      for (const s of seats) p.push(workstation(s.x, s.y + 19, 42, 2));
      // Racks on the far wall, between the bottom row's desks and the wall.
      p.push(`<rect x="8" y="${h - 9}" width="${w - 16}" height="4" fill="url(#metal)"/>`);
      p.push(leds(14, h - 7, Math.floor((w - 28) / 6), 6, seed));
      // A painted aisle from the door.
      const dx = (r as Region & { door: { x: number } }).door.x - r.x;
      p.push(`<path d="M${dx - 18} ${body + 4}V${tray - 8}M${dx + 18} ${body + 4}V${tray - 8}" stroke="${PAINT_AMBER}" stroke-width="1" stroke-dasharray="6 4" opacity=".55"/>`);
      break;
    }
    case "your-office": {
      // The main control room: the operating console in a horseshoe, the large display wall across
      // the back, a supervisor's desk, and a warm light over the desk where you decide.
      p.push(pool(w / 2, h * 0.6, w * 0.42, h * 0.34, "warm"));
      // Display wall: three panels with mimic lines (to the right of the plate's corner).
      const px = 128;
      const pw = (w - px - 12) / 3;
      for (let i = 0; i < 3; i++) {
        const x = px + i * (pw + 2);
        p.push(`<rect x="${r1(x)}" y="10" width="${r1(pw)}" height="30" rx="2" fill="#071521" stroke="${SCREEN_DIM}" stroke-width=".8"/>`);
        const y0 = 16 + i * 3;
        p.push(`<path d="M${r1(x + 4)} ${y0}h${r1(pw * 0.3)}v8h${r1(pw * 0.35)}v-4h${r1(pw * 0.2)}M${r1(x + 4)} ${y0 + 14}h${r1(pw * 0.6)}" stroke="${SCREEN}" stroke-width="1" fill="none" opacity=".75"/>`);
        p.push(`<circle cx="${r1(x + pw - 7)}" cy="${y0 + 2}" r="1.5" fill="${i === 1 ? LED_AMBER : LED_GREEN}"/>`);
      }
      p.push(pool(px + (w - px) / 2, 44, (w - px) / 2, 16, "screenGlow"));
      // The horseshoe console, opening toward the supervisor.
      const cx = w / 2;
      const cy = body + 66;
      const R = 46;
      const arc = (rad: number) => `M${r1(cx - rad)} ${cy}A${rad} ${rad} 0 0 1 ${r1(cx + rad)} ${cy}`;
      p.push(`<path d="${arc(R)}" stroke="#0a0f15" stroke-width="15" fill="none" stroke-linecap="round"/>`);
      p.push(`<path d="${arc(R)}" stroke="url(#metal)" stroke-width="12" fill="none" stroke-linecap="round"/>`);
      p.push(`<path d="${arc(R + 4.5)}" stroke="${STEEL_HI}" stroke-width=".8" fill="none" opacity=".6"/>`);
      p.push(`<path d="${arc(R - 2.5)}" stroke="${SCREEN}" stroke-width="2.4" fill="none" stroke-dasharray="9 3" opacity=".8"/>`);
      for (let a = 15; a <= 165; a += 15) {
        const t = (a * Math.PI) / 180;
        const c = a === 90 ? LED_AMBER : rand() < 0.8 ? LED_GREEN : SCREEN;
        p.push(`<circle cx="${r1(cx - Math.cos(t) * (R + 2))}" cy="${r1(cy - Math.sin(t) * (R + 2))}" r="1.1" fill="${c}"/>`);
      }
      p.push(pool(cx, cy - 6, R, 26, "screenGlow"));
      // The supervisor's desk below the console.
      p.push(`<rect x="${cx - 30}" y="${h - 30}" width="60" height="13" rx="3" fill="url(#metal)" stroke="#0a0f15" stroke-width=".8"/>`);
      p.push(`<rect x="${cx - 24}" y="${h - 27}" width="20" height="3.4" rx=".8" fill="${LED_AMBER}" opacity=".85"/><rect x="${cx + 4}" y="${h - 27}" width="20" height="3.4" rx=".8" fill="${SCREEN}" opacity=".8"/>`);
      break;
    }
    case "verification": {
      // Independent verification: two booths behind a glass partition, a workstation for each.
      const mid = w / 2;
      p.push(`<rect x="${mid - 2}" y="${body + 4}" width="4" height="${h - body - 10}" fill="url(#glass)" stroke="#6fa9d1" stroke-width=".6" opacity=".9"/>`);
      p.push(`<path d="M${mid - 1} ${body + 8}V${h - 10}" stroke="#cfeaff" stroke-width=".5" opacity=".5"/>`);
      for (const s of seats) p.push(workstation(s.x + (s.x < mid ? 14 : -14), s.y + 19, 36, 2));
      p.push(`<rect x="${mid - 16}" y="${body + 8}" width="32" height="18" rx="2" fill="#0a1622" stroke="${SCREEN_DIM}" stroke-width=".8"/>`);
      p.push(`<path d="M${mid - 11} ${body + 21}l5 -6 5 3 5 -8 5 4" stroke="${LED_GREEN}" stroke-width="1" fill="none"/>`);
      break;
    }
    case "interface": {
      // Work control: a planning table lit from inside, with the work schedule drawn as bars.
      const tx = 50;
      const tw = w - 100;
      const ty = body + 34;
      const th = 78;
      p.push(pool(w / 2, ty + th / 2, tw * 0.7, th * 0.7, "screenGlow"));
      p.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="5" fill="#081521" stroke="url(#metal)" stroke-width="3"/>`);
      p.push(`<path d="${lines(tx + 4, ty + 4, tw - 8, th - 8, 12, "v")}" stroke="#123049" stroke-width=".6"/>`);
      const colors = [SCREEN, SCREEN, LED_GREEN, LED_AMBER, SCREEN, LED_GREEN];
      for (let i = 0; i < 6; i++) {
        const bx = tx + 8 + rand() * (tw * 0.45);
        const bw = 14 + rand() * (tw * 0.4);
        p.push(`<rect x="${r1(bx)}" y="${ty + 8 + i * 11}" width="${r1(Math.min(bw, tx + tw - 8 - bx))}" height="5" rx="1.5" fill="${colors[i]}" opacity=".8"/>`);
      }
      p.push(`<path d="M${r1(tx + tw * 0.62)} ${ty + 3}V${ty + th - 3}" stroke="${LED_RED}" stroke-width="1" opacity=".85"/>`);
      break;
    }
    case "review": {
      // The review board: one oval table with its chairs, and the evidence projected on the far wall.
      const cx = w / 2;
      const cy = body + 72;
      p.push(pool(cx, cy, 70, 44, "lamp"));
      p.push(`<rect x="${w - 70}" y="${h - 14}" width="56" height="4" rx="1" fill="${SCREEN}" opacity=".85"/>`);
      p.push(pool(w - 42, h - 22, 40, 18, "screenGlow"));
      for (let a = 0; a < 360; a += 36) {
        const t = (a * Math.PI) / 180;
        p.push(`<circle cx="${r1(cx + Math.cos(t) * 52)}" cy="${r1(cy + Math.sin(t) * 30)}" r="4" fill="#18232f" stroke="${STEEL}" stroke-width=".8"/>`);
      }
      p.push(`<ellipse cx="${cx}" cy="${cy}" rx="42" ry="22" fill="url(#metal)" stroke="#0a0f15" stroke-width="1"/>`);
      p.push(`<ellipse cx="${cx}" cy="${cy - 1}" rx="38" ry="18.5" fill="none" stroke="${STEEL_HI}" stroke-width=".7" opacity=".6"/>`);
      p.push(`<ellipse cx="${cx}" cy="${cy}" rx="12" ry="5" fill="${SCREEN}" opacity=".35"/>`);
      break;
    }
    case "bench": {
      // The staging yard: painted laydown bays and shipping containers between the operators.
      p.push(`<path d="${lines(0, body + 6, w, h - body - 12, 110, "v")}" stroke="${PAINT_WHITE}" stroke-width="1" stroke-dasharray="8 6" opacity=".5"/>`);
      const tones = ["#3a2f2a", "#22343f", "#2e3a2a", "#3b3324"];
      for (let i = 0; i < 3; i++) {
        const gx = seats[i]!.x + 55;
        for (const [j, cy] of [body + 18, body + 88].entries()) {
          const tone = tones[(i + j) % tones.length];
          p.push(`<rect x="${gx - 26}" y="${cy}" width="52" height="24" rx="1.5" fill="${tone}" stroke="#0a0f15" stroke-width="1"/>`);
          p.push(`<path d="${lines(gx - 26, cy, 52, 24, 4, "v")}" stroke="#000000" stroke-width=".7" opacity=".35"/>`);
          p.push(`<path d="M${gx - 25} ${cy + 1}H${gx + 25}" stroke="#ffffff" stroke-width=".6" opacity=".18"/>`);
        }
      }
      for (let i = 0; i < 4; i++) p.push(pool(seats[i]!.x, h * 0.55, 60, 70, "warm"));
      break;
    }
    case "document-control": {
      // The records vault: rows of shelving with their spines, and the vault door by the entrance.
      for (let i = 0; i < 3; i++) {
        const gx = seats[i]!.x + 55;
        for (const dx of [-16, 8]) {
          p.push(`<rect x="${gx + dx}" y="${body + 12}" width="10" height="${h - body - 30}" rx="1" fill="url(#metal)" stroke="#0a0f15" stroke-width=".8"/>`);
          const spines: string[] = [];
          for (let y = body + 16; y < h - 22; y += 3) spines.push(`M${gx + dx + 2} ${y}H${gx + dx + 8 - (rand() < 0.3 ? 2 : 0)}`);
          p.push(`<path d="${spines.join("")}" stroke="#8fa3b6" stroke-width=".9" opacity=".35"/>`);
        }
      }
      // Vault door, swung open beside the entrance.
      const dx = (r as Region & { door: { x: number } }).door.x - r.x;
      p.push(`<circle cx="${dx + 44}" cy="${body - 8 + 22}" r="16" fill="url(#metal)" stroke="${STEEL_HI}" stroke-width="1.2"/>`);
      p.push(`<circle cx="${dx + 44}" cy="${body - 8 + 22}" r="10" fill="none" stroke="${STEEL}" stroke-width="2"/>`);
      p.push(`<path d="M${dx + 44} ${body + 4}v20M${dx + 34} ${body + 14}h20" stroke="${STEEL_HI}" stroke-width="1"/>`);
      break;
    }
    case "quarantine": {
      // The hold yard: a pen behind a striped barrier, mesh fencing, and warning lamps at its corners.
      const x0 = 8;
      const y0 = body + 4;
      const pw = w - 16;
      const ph = h - body - 12;
      p.push(`<defs><clipPath id="stripe-q"><path fill-rule="evenodd" d="M${x0} ${y0}h${pw}v${ph}h${-pw}zM${x0 + 7} ${y0 + 7}h${pw - 14}v${ph - 14}h${-(pw - 14)}z"/></clipPath><clipPath id="mesh-q"><rect x="${x0 + 7}" y="${y0 + 7}" width="${pw - 14}" height="${ph - 14}"/></clipPath></defs>`);
      p.push(`<rect x="${x0}" y="${y0}" width="${pw}" height="${ph}" fill="${LED_AMBER}" opacity=".9" clip-path="url(#stripe-q)"/>`);
      p.push(`<path d="${hatch(x0, y0, pw, ph, 12)}" stroke="#0b0b0b" stroke-width="6" clip-path="url(#stripe-q)"/>`);
      p.push(`<g clip-path="url(#mesh-q)" opacity=".22"><path d="${hatch(x0, y0, pw, ph, 9)}" stroke="${FENCE}" stroke-width=".6"/><path d="${hatch(x0, y0, pw, ph, 9)}" stroke="${FENCE}" stroke-width=".6" transform="translate(${2 * x0 + pw} 0) scale(-1 1)"/></g>`);
      for (const [cx, cy] of [[x0 + 3.5, y0 + 3.5], [x0 + pw - 3.5, y0 + 3.5], [x0 + 3.5, y0 + ph - 3.5], [x0 + pw - 3.5, y0 + ph - 3.5]] as const) {
        p.push(pool(cx, cy, 26, 26, "redGlow"));
        p.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${LED_RED}" stroke="#2a0808" stroke-width="1"/>`);
      }
      break;
    }
  }
  return svg(w, h, p.concat(close).join(""));
}

/** The site: drawing grid, roads with their lights, the fence and its gates, piping, the auxiliary building and the reactor building's pad. */
function site(): string {
  const { width: W, height: H } = PLANT_LAYOUT.canvas;
  const zone = Object.fromEntries(PLANT_LAYOUT.zones.map((z) => [z.id, z]));
  const fence = zone.fence!;
  const aux = zone.auxiliary!;
  const core = PLANT_LAYOUT.core;
  const parts: string[] = [];
  parts.push(
    `<defs><radialGradient id="night" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#0b1420"/><stop offset=".7" stop-color="#060a11"/><stop offset="1" stop-color="${P.backdrop}"/></radialGradient>` +
      `<linearGradient id="fenceGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46d3ff" stop-opacity=".12"/><stop offset="1" stop-color="#46d3ff" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="auxWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3c50"/><stop offset="1" stop-color="#1a2634"/></linearGradient>` +
      `<clipPath id="outside"><path fill-rule="evenodd" d="M0 0H${W}V${H}H0zM${fence.x} ${fence.y}h${fence.w}v${fence.h}h${-fence.w}z"/></clipPath>` +
      GRAD.lamp +
      GRAD.warm +
      `</defs>`,
  );
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#night)"/>`);
  // The drawing grid: minor and major lines.
  parts.push(`<path d="${lines(0, 0, W, H, 20)}" stroke="${GRID_MINOR}" stroke-width=".6" fill="none"/>`);
  parts.push(`<path d="${lines(0, 0, W, H, 100)}" stroke="${GRID_MAJOR}" stroke-width="1" fill="none"/>`);
  // Ground outside the fence: faint hatching.
  parts.push(`<path d="${hatch(0, 0, W, H, 14)}" stroke="#0d1824" stroke-width=".8" clip-path="url(#outside)"/>`);
  // Roads: asphalt, edge lines and a dashed centre line, with lamps along the site road.
  for (const w of PLANT_LAYOUT.walkways.filter((x) => x.zone === "site")) parts.push(`<rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="${ASPHALT}"/>`);
  const road = PLANT_LAYOUT.walkways.find((x) => x.id === "site-road")!;
  parts.push(`<path d="M0 ${road.y + 5}H${W}M0 ${road.y + road.h - 5}H${W}" stroke="${PAINT_WHITE}" stroke-width="1.2" opacity=".55"/>`);
  parts.push(`<path d="M8 ${road.y + road.h / 2}H${W - 8}" stroke="${PAINT_AMBER}" stroke-width="2" stroke-dasharray="18 14"/>`);
  for (let x = 60; x < W; x += 160) {
    parts.push(`<ellipse cx="${x}" cy="${road.y + road.h / 2}" rx="70" ry="38" fill="url(#warm)"/>`);
    parts.push(`<circle cx="${x}" cy="${road.y + 3}" r="2.2" fill="#ffe2b0" opacity=".9"/>`);
  }
  // The fence: a glow inside the line, a double line with posts, and gates with barrier arms.
  parts.push(`<rect x="${fence.x}" y="${fence.y}" width="${fence.w}" height="24" fill="url(#fenceGlow)"/>`);
  const gates = PLANT_LAYOUT.gates.map((g) => g.at);
  parts.push(`<path d="${outlineWithGates(fence.x, fence.y, fence.w, fence.h, gates, 40)}" stroke="${FENCE}" stroke-width="1.6" fill="none"/>`);
  parts.push(`<path d="${outlineWithGates(fence.x + 4, fence.y + 4, fence.w - 8, fence.h - 8, gates.map((g) => ({ x: g.x === fence.x ? fence.x + 4 : fence.x + fence.w - 4, y: g.y })), 40)}" stroke="${FENCE}" stroke-width=".7" opacity=".55" fill="none"/>`);
  const posts: string[] = [];
  for (let x = fence.x + 24; x < fence.x + fence.w; x += 24) posts.push(`M${x - 1.2} ${fence.y - 1.2}h2.4v2.4h-2.4z`, `M${x - 1.2} ${fence.y + fence.h - 1.2}h2.4v2.4h-2.4z`);
  parts.push(`<path d="${posts.join("")}" fill="${STEEL_HI}"/>`);
  for (const g of gates) {
    const dir = g.x === fence.x ? 1 : -1;
    parts.push(`<rect x="${g.x - 4}" y="${g.y - 22}" width="8" height="5" fill="${STEEL}" stroke="${FENCE}" stroke-width=".6"/>`);
    for (let i = 0; i < 6; i++) parts.push(`<rect x="${g.x - 1.2}" y="${g.y - 17 + i * 5}" width="2.4" height="5" fill="${i % 2 ? "#e8f0f8" : LED_RED}" opacity=".85"/>`);
    parts.push(`<circle cx="${g.x + dir * 6}" cy="${g.y - 22}" r="1.6" fill="${LED_GREEN}"/>`);
  }
  // The inner walkway: a lit floor, painted edges, chevrons toward the control room, and a pipe rack along it.
  const inner = PLANT_LAYOUT.walkways.find((x) => x.id === "inner")!;
  parts.push(`<rect x="${inner.x + 6}" y="${inner.y}" width="${inner.w - 12}" height="${inner.h}" fill="#08101a"/>`);
  parts.push(`<path d="M${inner.x + 10} ${inner.y + 4}H${inner.x + inner.w - 10}M${inner.x + 10} ${inner.y + inner.h - 4}H${inner.x + inner.w - 10}" stroke="${PAINT_AMBER}" stroke-width="1.2" opacity=".7"/>`);
  const chev: string[] = [];
  for (let x = 320; x < inner.x + inner.w - 40; x += 90) chev.push(`M${x + 8} ${inner.y + inner.h / 2 - 7}l-8 7 8 7`);
  parts.push(`<path d="${chev.join("")}" stroke="${PAINT_WHITE}" stroke-width="1.6" fill="none" opacity=".45"/>`);
  for (let x = 90; x < W; x += 180) parts.push(`<ellipse cx="${x}" cy="${inner.y + inner.h / 2}" rx="80" ry="34" fill="url(#lamp)"/>`);
  const rack = inner.y + 12;
  parts.push(`<path d="M${inner.x + 14} ${rack}H${inner.x + inner.w - 14}" stroke="#1d3a4f" stroke-width="4"/><path d="M${inner.x + 14} ${rack - 1}H${inner.x + inner.w - 14}" stroke="#4f8fb3" stroke-width=".8" opacity=".6"/>`);
  parts.push(`<path d="M${inner.x + 14} ${rack + 6}H${inner.x + inner.w - 14}" stroke="#3a3220" stroke-width="3"/><path d="M${inner.x + 14} ${rack + 5.2}H${inner.x + inner.w - 14}" stroke="#a98a46" stroke-width=".7" opacity=".55"/>`);
  const flanges: string[] = [];
  for (let x = inner.x + 40; x < inner.x + inner.w - 14; x += 48) flanges.push(`M${x} ${rack - 3.5}v11`);
  parts.push(`<path d="${flanges.join("")}" stroke="${STEEL_HI}" stroke-width="1.4" opacity=".6"/>`);
  // The auxiliary building: a heavy concrete wall with structural columns between the bays.
  parts.push(`<rect x="${aux.x}" y="${aux.y}" width="${aux.w}" height="${aux.h}" rx="4" fill="#070d15" stroke="url(#auxWall)" stroke-width="5"/>`);
  parts.push(`<rect x="${aux.x + 3}" y="${aux.y + 3}" width="${aux.w - 6}" height="${aux.h - 6}" rx="3" fill="none" stroke="${STEEL_HI}" stroke-width=".6" opacity=".4"/>`);
  const bays = PLANT_LAYOUT.regions.filter((r) => r.kind === "cube-set").sort((a, b) => a.x - b.x);
  for (let i = 1; i < bays.length; i++) {
    const x = (bays[i - 1]!.x + bays[i - 1]!.w + bays[i]!.x) / 2;
    parts.push(`<rect x="${x - 3}" y="${aux.y - 1}" width="6" height="6" fill="${P.decorationAlt}"/><rect x="${x - 3}" y="${aux.y + aux.h - 5}" width="6" height="6" fill="${P.decorationAlt}"/>`);
  }
  // The reactor building's pad: the application draws the containment and the core on it.
  parts.push(`<rect x="${core.x}" y="${core.y}" width="${core.w}" height="${core.h}" rx="8" fill="#05090f" stroke="${P.wall}" stroke-width="1.5"/>`);
  return svg(W, H, parts.join(""));
}

/** One operator from above: hard hat, shoulders in dark coveralls with reflective bands. */
function operator(i: number): string {
  const suit = ["#1f3347", "#243a33", "#2f2f45"][i % 3];
  const hat = ["#f2f5f8", "#ffcf5a", "#7fd6ff"][i % 3];
  return svg(
    64,
    64,
    `<defs><radialGradient id="hat${i}" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="${hat}"/><stop offset="1" stop-color="#5a6a7a"/></radialGradient>` +
      `<linearGradient id="suit${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${suit}"/><stop offset="1" stop-color="#0d1620"/></linearGradient></defs>` +
      `<ellipse cx="32" cy="40" rx="22" ry="17" fill="#000000" opacity=".35"/>` +
      `<path d="M10 46c0-12 10-20 22-20s22 8 22 20v6H10z" fill="url(#suit${i})"/>` +
      `<path d="M14 40c5-5 11-7 18-7s13 2 18 7" stroke="#c8f0ff" stroke-width="2.6" fill="none" opacity=".85"/>` +
      `<path d="M17 47h30" stroke="#c8f0ff" stroke-width="2.2" opacity=".55"/>` +
      `<circle cx="32" cy="26" r="11" fill="url(#hat${i})"/>` +
      `<path d="M23 27.5h18" stroke="#000000" stroke-width="1.4" opacity=".25"/>`,
  );
}

export function renderPlant(out: Rendered): void {
  const siteArt = write(out, "site", site(), PLANT_LAYOUT.canvas.width, PLANT_LAYOUT.canvas.height);
  const regions: Record<string, { label: string; art: Asset }> = {};
  for (const r of PLANT_LAYOUT.regions) regions[r.id] = { label: PLANT_LABELS[r.id], art: write(out, r.id, place(r), r.w, r.h) };
  const bodies = [0, 1, 2].map((i) => write(out, `body-${i}`, operator(i), 64, 64));
  const theme = {
    schemaVersion: 1,
    id: ID,
    version: "1.0.0",
    title: "Plant",
    description: "One facility in plan: the site, the plant fence, the work bays and the reactor building, with the control room where you decide.",
    availability: "released",
    layout: "plant",
    tokens: PLANT_PALETTE,
    site: siteArt,
    regions,
    bodies,
    motionProfile: "shared-v1",
    accessibility: { notes: "Dark, low contrast linework throughout; nothing bright under any name band or seat. Instruments and zone names are application text, not art." },
    credits: [CREATOR],
  };
  const files = [siteArt, ...Object.values(regions).map((r) => r.art), ...bodies].map((a) => ({ file: a.path.split("/").pop()!, sha256: a.sha256 }));
  out.set(`public/office-themes/${ID}/assets.json`, JSON.stringify({ theme: ID, files }, null, 2) + "\n");
  out.set(`src/features/office/themes/${ID}.ts`, `// Generated by scripts/build-office-themes.ts (scripts/build-plant-theme.ts); do not edit.\nimport type { OfficeThemeV1 } from "../contract.js";\n\nconst theme: OfficeThemeV1 = ${JSON.stringify(theme, null, 2)};\nexport default theme;\n`);
}
