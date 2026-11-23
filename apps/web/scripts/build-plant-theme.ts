/**
 * Builds the Plant theme (docs/superpowers/specs/2026-11-23-plant-view-design.md, section 7) as inert
 * scene data: one site drawing exactly the plant canvas, one SVG per place sized exactly to its region
 * in the plant layout, and the operator bodies. All geometry is authored here, procedurally, as one
 * plan view in the manner of a general arrangement drawing: hairline boundaries, few long paths, no
 * text, no reference images, no real plant's layout, no hazard symbols. The live instruments (the
 * core, its rods, the annunciator) are application code, never theme art.
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

/** The plant's palette: a site at night, cool and low, so figures and plates read first. */
export const PLANT_PALETTE = {
  backdrop: "#060a10",
  floor: "#0c131d",
  wall: "#2a3a4d",
  decoration: "#354a60",
  decorationAlt: "#46607a",
} as const;
const P = PLANT_PALETTE;
/** Fine linework for the drawing grid and floor marks: barely there. */
const LINE = "#132031";
const ROAD = "#0a1018";
const ROAD_MARK = "#1e2c3c";
const FENCE = "#4a6580";

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

/** One path of evenly spaced lines across a box: the drawing grid, or painted floor marks. */
function lines(x: number, y: number, w: number, h: number, step: number): string {
  const d: string[] = [];
  for (let gx = x + step; gx < x + w; gx += step) d.push(`M${gx} ${y}V${y + h}`);
  for (let gy = y + step; gy < y + h; gy += step) d.push(`M${x} ${gy}H${x + w}`);
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

/** The site: drawing grid, roads, the fence with its gates, the auxiliary building and the reactor building's shell. */
function site(): string {
  const { width: W, height: H } = PLANT_LAYOUT.canvas;
  const zone = Object.fromEntries(PLANT_LAYOUT.zones.map((z) => [z.id, z]));
  const fence = zone.fence!;
  const aux = zone.auxiliary!;
  const core = PLANT_LAYOUT.core;
  const parts: string[] = [];
  parts.push(`<defs><radialGradient id="night" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#0b131e"/><stop offset="1" stop-color="${P.backdrop}"/></radialGradient></defs>`);
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#night)"/>`);
  // The drawing grid: one faint path.
  parts.push(`<path d="${lines(0, 0, W, H, 40)}" stroke="${LINE}" stroke-width="1" opacity=".55" fill="none"/>`);
  // Roads: the site road and the two side roads, with a dashed centre line.
  for (const w of PLANT_LAYOUT.walkways.filter((x) => x.zone === "site")) parts.push(`<rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="${ROAD}"/>`);
  const road = PLANT_LAYOUT.walkways.find((x) => x.id === "site-road")!;
  parts.push(`<path d="M8 ${road.y + road.h / 2}H${W - 8}" stroke="${ROAD_MARK}" stroke-width="2" stroke-dasharray="14 12" fill="none"/>`);
  // The fence: a fine double line with gates where the inner walkway leaves it.
  const gates = PLANT_LAYOUT.gates.map((g) => g.at);
  parts.push(`<path d="${outlineWithGates(fence.x, fence.y, fence.w, fence.h, gates, 40)}" stroke="${FENCE}" stroke-width="1.5" fill="none"/>`);
  parts.push(`<path d="${outlineWithGates(fence.x + 4, fence.y + 4, fence.w - 8, fence.h - 8, gates.map((g) => ({ x: g.x === fence.x ? fence.x + 4 : fence.x + fence.w - 4, y: g.y })), 40)}" stroke="${FENCE}" stroke-width=".75" opacity=".6" fill="none"/>`);
  // The inner walkway: a slightly lighter floor.
  const inner = PLANT_LAYOUT.walkways.find((x) => x.id === "inner")!;
  parts.push(`<rect x="${inner.x + 6}" y="${inner.y}" width="${inner.w - 12}" height="${inner.h}" fill="#09101a"/>`);
  parts.push(`<path d="M${inner.x + 10} ${inner.y + 1}H${inner.x + inner.w - 10}M${inner.x + 10} ${inner.y + inner.h - 1}H${inner.x + inner.w - 10}" stroke="${ROAD_MARK}" stroke-width="1" fill="none"/>`);
  // The auxiliary building: a heavier wall around the bays.
  parts.push(`<rect x="${aux.x}" y="${aux.y}" width="${aux.w}" height="${aux.h}" rx="4" fill="#080e16" stroke="${P.wall}" stroke-width="2.5"/>`);
  // The reactor building: a round shell in plan, centred in its box, with its own inner liner.
  const cx = core.x + core.w / 2;
  const cy = core.y + core.h / 2;
  const R = Math.min(core.w, core.h) / 2 - 4;
  parts.push(`<rect x="${core.x}" y="${core.y}" width="${core.w}" height="${core.h}" rx="10" fill="#070c14" stroke="${P.wall}" stroke-width="1"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#0a111b" stroke="${P.decorationAlt}" stroke-width="2.5"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R - 7}" fill="none" stroke="${P.decoration}" stroke-width="1"/>`);
  // Tick marks around the shell, every 15 degrees: the drafting convention for a round structure.
  const ticks: string[] = [];
  for (let a = 0; a < 360; a += 15) {
    const t = (a * Math.PI) / 180;
    ticks.push(`M${r1(cx + Math.cos(t) * (R + 3))} ${r1(cy + Math.sin(t) * (R + 3))}L${r1(cx + Math.cos(t) * (R + 8))} ${r1(cy + Math.sin(t) * (R + 8))}`);
  }
  parts.push(`<path d="${ticks.join("")}" stroke="${P.decoration}" stroke-width="1" fill="none"/>`);
  // The equipment hatch and personnel lock: two short stubs through the shell, toward the control room.
  parts.push(`<path d="M${r1(cx - R - 6)} ${cy - 12}H${r1(cx - R + 10)}M${r1(cx - R - 6)} ${cy + 12}H${r1(cx - R + 10)}" stroke="${P.decorationAlt}" stroke-width="2" fill="none"/>`);
  // A few transmission lines leave the site to the north east: the plant's output, drawn quietly.
  parts.push(`<path d="M${W - 60} 0V${fence.y}M${W - 80} 0V${fence.y}M${W - 100} 0V${fence.y}" stroke="${LINE}" stroke-width="1.5" fill="none"/>`);
  return svg(W, H, parts.join(""));
}

/** The common floor of a place: its slab, a fine wall, and a quiet band under the name plate. */
function slab(r: Region, wall: number): string[] {
  const { w, h } = r;
  return [
    `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="${P.floor}"/>`,
    `<rect x="${wall / 2}" y="${wall / 2}" width="${w - wall}" height="${h - wall}" rx="6" fill="none" stroke="${P.wall}" stroke-width="${wall}"/>`,
    `<rect x="3" y="3" width="${w - 6}" height="${NAME_BAND - 6}" rx="4" fill="${P.wall}" opacity=".28"/>`,
  ];
}

const local = (r: Region) => r.seats.map((s) => ({ x: s.x - r.x, y: s.y - r.y }));

function place(r: Region): string {
  const { w, h } = r;
  const parts = slab(r, r.kind === "cube-set" ? 2 : 1.5);
  const seats = local(r);
  const body = NAME_BAND + 6;
  switch (r.id as RegionId) {
    case "process":
    case "mechanical":
    case "electrical":
    case "civil":
    case "assurance":
    case "project-controls":
      // A confinement cell: a second, inner wall all round, and a workstation under each seat.
      parts.push(`<rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="4" fill="none" stroke="${P.decoration}" stroke-width="1"/>`);
      for (const s of seats) parts.push(`<rect x="${s.x - 22}" y="${s.y + 16}" width="44" height="10" rx="2" fill="${P.decoration}" opacity=".5"/>`);
      break;
    case "your-office": {
      // The main control room: a shallow console arc facing the operators, and the supervisor's desk.
      const arc = `M18 ${body + 18}Q${w / 2} ${body - 2} ${w - 18} ${body + 18}`;
      parts.push(`<path d="${arc}" stroke="${P.decorationAlt}" stroke-width="7" stroke-linecap="round" fill="none" opacity=".55"/>`);
      parts.push(`<rect x="${w / 2 - 34}" y="${h - 26}" width="68" height="12" rx="3" fill="${P.decoration}" opacity=".55"/>`);
      break;
    }
    case "verification":
      // Independent verification: two desks a wall apart.
      parts.push(`<path d="M${w / 2} ${body + 4}V${h - 10}" stroke="${P.wall}" stroke-width="2" fill="none"/>`);
      for (const s of seats) parts.push(`<rect x="${s.x - 18}" y="${s.y + 16}" width="36" height="9" rx="2" fill="${P.decoration}" opacity=".45"/>`);
      break;
    case "interface":
      // Work control: one long planning table.
      parts.push(`<rect x="22" y="${h / 2 + 4}" width="${w - 44}" height="14" rx="4" fill="${P.decoration}" opacity=".4"/>`);
      break;
    case "review":
      // The review board: one oval table.
      parts.push(`<ellipse cx="${w / 2}" cy="${h / 2 + 12}" rx="${w / 2 - 40}" ry="14" fill="${P.decoration}" opacity=".38"/>`);
      break;
    case "bench":
      // The staging yard: painted laydown bays.
      parts.push(`<path d="${lines(10, body, w - 20, h - body - 10, 48).split("M").filter((s) => s.includes("V")).map((s) => "M" + s).join("")}" stroke="${ROAD_MARK}" stroke-width="1.5" fill="none"/>`);
      break;
    case "document-control":
      // The records vault: rows of shelving along the back wall.
      for (let i = 0; i < 6; i++) parts.push(`<rect x="${14 + i * ((w - 28) / 6)}" y="${h - 22}" width="${(w - 28) / 6 - 8}" height="10" rx="2" fill="${P.decorationAlt}" opacity=".35"/>`);
      break;
    case "quarantine":
      // The hold yard: an inner fence, a pen inside the yard. No hazard stripes.
      parts.push(`<rect x="10" y="${body}" width="${w - 20}" height="${h - body - 10}" rx="3" fill="none" stroke="${FENCE}" stroke-width="1" stroke-dasharray="3 4"/>`);
      break;
  }
  return svg(w, h, parts.join(""));
}

/** One restrained operator in coveralls and a hard hat; three quiet tones. */
function operator(i: number): string {
  const tone = ["#4d6680", "#5b6f86", "#4a6a74"][i % 3];
  return svg(
    64,
    64,
    `<ellipse cx="32" cy="58" rx="15" ry="3.5" fill="#000000" opacity=".3"/>` +
      `<path d="M19 56c0-11 6-19 13-19s13 8 13 19z" fill="${tone}"/>` +
      `<circle cx="32" cy="26" r="8.5" fill="${tone}"/>` +
      `<path d="M22.5 24.5c0-6 4.3-10 9.5-10s9.5 4 9.5 10z" fill="#8fa3b6"/>` +
      `<rect x="21" y="23.5" width="22" height="2.4" rx="1.2" fill="#8fa3b6"/>`,
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
