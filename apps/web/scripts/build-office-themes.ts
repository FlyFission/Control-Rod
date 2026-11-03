/**
 * Builds the office view's default theme and its structurally different test theme (plan task 4.4)
 * as inert scene data: one SVG per region, sized exactly to the region from the canonical layout, and
 * figure body styles. All geometry is authored here, procedurally; no reference images, fonts,
 * downloaded assets or model calls. Run from apps/web:
 *   node --experimental-strip-types scripts/build-office-themes.ts
 * It writes public/office-themes/<id>/ and src/features/office/themes/<id>.ts; a unit test renders the
 * same files in memory and fails if the committed ones differ.
 */
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NAME_BAND, REGIONS, type Region, type RegionId } from "../src/features/office/layout.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

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

const CREATOR = "Original procedural vector illustration (Claude Code)";

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** Every file the generator produces, by path relative to apps/web. */
export type Rendered = Map<string, string>;

function write(out: Rendered, themeId: string, name: string, text: string, w: number, h: number): Asset {
  const bytes = Buffer.from(text, "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = `${name}.${sha256.slice(0, 12)}.svg`;
  out.set(`public/office-themes/${themeId}/${file}`, text);
  return { path: `/office-themes/${themeId}/${file}`, sha256, bytes: bytes.byteLength, width: w, height: h, creator: CREATOR, rightsBasis: "original", licenseNoticeId: "Apache-2.0" };
}

/** Seat positions relative to the region's own origin. */
const local = (r: Region) => r.seats.map((s) => ({ x: s.x - r.x, y: s.y - r.y }));

type Palette = { backdrop: string; floor: string; wall: string; decoration: string; decorationAlt: string };

/* ---- Standard office: calm, dark, furniture beneath the seats ---- */

function standardRegion(r: Region, p: Palette): string {
  const { w, h } = r;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" rx="12" fill="${p.floor}"/>`);
  parts.push(`<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="12" fill="none" stroke="${p.wall}" stroke-width="2"/>`);
  // A quiet band under the name plate, the same tone as the wall.
  parts.push(`<rect x="2" y="2" width="${w - 4}" height="${NAME_BAND - 4}" rx="10" fill="${p.wall}" opacity=".35"/>`);
  const seats = local(r);
  for (const s of seats) {
    if (r.kind === "cube-set") {
      parts.push(`<rect x="${s.x - 26}" y="${s.y + 14}" width="52" height="16" rx="3" fill="${p.decoration}" opacity=".55"/>`);
      parts.push(`<rect x="${s.x - 9}" y="${s.y + 2}" width="18" height="11" rx="2" fill="${p.decorationAlt}" opacity=".5"/>`);
    } else {
      parts.push(`<ellipse cx="${s.x}" cy="${s.y + 24}" rx="20" ry="5" fill="${p.decoration}" opacity=".4"/>`);
    }
  }
  switch (r.id as RegionId) {
    case "review":
      parts.push(`<ellipse cx="${w / 2}" cy="${h - 46}" rx="${w / 3}" ry="16" fill="${p.decoration}" opacity=".35"/>`);
      break;
    case "document-control":
      for (let i = 0; i < 4; i++) parts.push(`<rect x="${10 + i * ((w - 20) / 4)}" y="${h - 34}" width="${(w - 20) / 4 - 6}" height="22" rx="2" fill="${p.decorationAlt}" opacity=".45"/>`);
      break;
    case "quarantine":
      for (let x = -h; x < w; x += 18) parts.push(`<line x1="${x}" y1="${h - 4}" x2="${x + 30}" y2="${h - 34}" stroke="${p.decorationAlt}" stroke-width="3" opacity=".35"/>`);
      break;
    case "your-office":
      parts.push(`<rect x="${w / 2 - 50}" y="${h - 48}" width="100" height="18" rx="4" fill="${p.decoration}" opacity=".5"/>`);
      break;
  }
  return parts.join("");
}

function standardBody(i: number, p: Palette): string {
  const tones = [p.decoration, p.decorationAlt, "#7f97ab", "#9c8db8", "#7fae9c", "#b39b78"];
  const c = tones[i % tones.length];
  return svg(64, 64, `<ellipse cx="32" cy="58" rx="16" ry="4" fill="#000000" opacity=".25"/><path d="M18 56c0-12 6-20 14-20s14 8 14 20z" fill="${c}"/><circle cx="32" cy="24" r="10" fill="${c}"/>`);
}

/* ---- Bright test theme: light, saturated, busy right up to the name plates ---- */

function brightRegion(r: Region, p: Palette, i: number): string {
  const { w, h } = r;
  const colours = ["#ffd166", "#06d6a0", "#ef476f", "#118ab2", "#f78c6b", "#83d483", "#c77dff"];
  const a = colours[i % colours.length];
  const b = colours[(i + 3) % colours.length];
  const parts: string[] = [];
  parts.push(`<defs><linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${p.floor}"/></linearGradient></defs>`);
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="url(#g${i})"/>`);
  // Dense diagonal stripes over everything, name band included: the stress case for contrast.
  for (let x = -h; x < w + h; x += 14) parts.push(`<line x1="${x}" y1="0" x2="${x + h}" y2="${h}" stroke="${b}" stroke-width="5" opacity=".55"/>`);
  for (let k = 0; k < 9; k++) {
    const cx = ((k * 53 + i * 31) % (w - 20)) + 10;
    const cy = ((k * 71 + i * 17) % (h - 20)) + 10;
    parts.push(`<polygon points="${cx},${cy - 12} ${cx + 12},${cy + 10} ${cx - 12},${cy + 10}" fill="${k % 2 ? "#ffffff" : "#1b1b1b"}" opacity=".6"/>`);
  }
  parts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#1b1b1b" stroke-width="6"/>`);
  return parts.join("");
}

function brightBody(i: number): string {
  const c = ["#ef476f", "#118ab2", "#06d6a0", "#ffd166"][i % 4];
  return svg(64, 64, `<rect x="16" y="30" width="32" height="28" fill="${c}" stroke="#1b1b1b" stroke-width="3"/><rect x="22" y="10" width="20" height="18" fill="${c}" stroke="#1b1b1b" stroke-width="3"/>`);
}

/* ---- Assemble ---- */

interface Spec {
  id: string;
  title: string;
  description: string;
  availability: "development" | "released";
  palette: Palette;
  labels: Record<RegionId, string>;
  region: (r: Region, p: Palette, i: number) => string;
  body: (i: number, p: Palette) => string;
  bodies: number;
  notes: string;
}

const STANDARD: Spec = {
  id: "standard-office",
  title: "Standard Office",
  description: "A calm, dark floor with desks beneath every seat; the office's default.",
  availability: "released",
  palette: { backdrop: "#0b0f14", floor: "#151c24", wall: "#2a3644", decoration: "#3d4f63", decorationAlt: "#4f6478" },
  labels: {
    process: "Process bay", mechanical: "Mechanical bay", electrical: "Controls bay", civil: "Structures bay",
    assurance: "Assurance bay", "project-controls": "Controls desk", review: "Review table", interface: "Hand-off desk",
    verification: "Check bench", "your-office": "Your desk", "document-control": "Records room", bench: "Waiting bench", quarantine: "Hold room",
  },
  region: (r, p) => standardRegion(r, p),
  body: standardBody,
  bodies: 6,
  notes: "Dark scene tokens throughout; furniture kept low and away from the name bands.",
};

const BRIGHT: Spec = {
  id: "harness-bright",
  title: "Harness Bright",
  description: "A deliberately bright, saturated and busy test theme for the quality harness.",
  availability: "development",
  palette: { backdrop: "#fff8e7", floor: "#fdfdfd", wall: "#1b1b1b", decoration: "#ef476f", decorationAlt: "#118ab2" },
  labels: {
    process: "Stripe Hall", mechanical: "Gear Yard", electrical: "Spark Room", civil: "Beam Loft",
    assurance: "Shield Hall", "project-controls": "Clock Room", review: "Round Room", interface: "Bridge",
    verification: "Lens Room", "your-office": "Corner Room", "document-control": "Stack Room", bench: "Long Bench", quarantine: "Locked Room",
  },
  region: (r, p, i) => brightRegion(r, p, i),
  body: (i) => brightBody(i),
  bodies: 4,
  notes: "Built to fail weak semantic contrast: light, saturated stripes run under every name plate and seat.",
};

function render(out: Rendered, spec: Spec): void {
  const regions: Record<string, { label: string; art: Asset }> = {};
  REGIONS.forEach((r, i) => {
    regions[r.id] = { label: spec.labels[r.id], art: write(out, spec.id, r.id, svg(r.w, r.h, spec.region(r, spec.palette, i)), r.w, r.h) };
  });
  const bodies = Array.from({ length: spec.bodies }, (_, i) => write(out, spec.id, `body-${i}`, spec.body(i, spec.palette), 64, 64));
  const theme = {
    schemaVersion: 1,
    id: spec.id,
    version: "1.0.0",
    title: spec.title,
    description: spec.description,
    availability: spec.availability,
    tokens: spec.palette,
    regions,
    bodies,
    motionProfile: "shared-v1",
    accessibility: { notes: spec.notes },
    credits: [CREATOR],
  };
  out.set(`src/features/office/themes/${spec.id}.ts`, `// Generated by scripts/build-office-themes.ts; do not edit.\nimport type { OfficeThemeV1 } from "../contract.js";\n\nconst theme: OfficeThemeV1 = ${JSON.stringify(theme, null, 2)};\nexport default theme;\n`);
}

export const SPECS: readonly Spec[] = [STANDARD, BRIGHT];

/** Renders every theme file in memory. */
export function renderAll(): Rendered {
  const out: Rendered = new Map();
  for (const spec of SPECS) render(out, spec);
  // Ordinary builds ship only released themes; vite.config.ts reads this list.
  out.set("src/features/office/themes/released.json", JSON.stringify(SPECS.filter((s) => s.availability === "released").map((s) => s.id)) + "\n");
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = renderAll();
  for (const spec of SPECS) rmSync(join(ROOT, "public/office-themes", spec.id), { recursive: true, force: true });
  for (const [path, text] of files) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), text);
  }
  console.log(`built ${SPECS.map((s) => s.id).join(", ")}: ${files.size} files`);
}
