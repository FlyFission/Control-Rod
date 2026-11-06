// Pure WCAG 2.x contrast helpers and a tokens.css reader, shared by the
// check-contrast script and the Vitest guard. No ratio is typed by hand; every
// number comes from the hex values in tokens.css.

export const LOOKS = ["a", "b", "c"];
export const SURFACE_TOKENS = ["--ground", "--surface", "--panel"];
export const TEXT_TOKENS = [
  "--text",
  "--text-2",
  "--muted",
  "--needs",
  "--check",
  "--stuck",
  "--done",
  "--kind-code",
  "--kind-doc",
  "--accent",
];
export const MIN_RATIO = 4.5;

function blockBody(css, selector) {
  const start = css.indexOf(selector + " {");
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function declarations(body) {
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim().toLowerCase();
  return out;
}

/** Token maps per look; looks b and c inherit anything they do not override from :root. */
export function parseLooks(css) {
  const root = declarations(blockBody(css, ":root"));
  return {
    a: root,
    b: { ...root, ...declarations(blockBody(css, '[data-look="b"]')) },
    c: { ...root, ...declarations(blockBody(css, '[data-look="c"]')) },
  };
}

function channel(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => channel(parseInt(h, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text token against every surface, per look. */
export function contrastTable(looks) {
  const rows = [];
  for (const look of LOOKS) {
    for (const text of TEXT_TOKENS) {
      for (const surface of SURFACE_TOKENS) {
        const fg = looks[look][text];
        const bg = looks[look][surface];
        const ratio = contrastRatio(fg, bg);
        rows.push({ look, text, fg, surface, bg, ratio, pass: ratio >= MIN_RATIO });
      }
    }
  }
  return rows;
}
