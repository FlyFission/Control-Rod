/**
 * WCAG 2.x contrast arithmetic and a scan of the app's stylesheets, so text contrast is measured
 * by code on every test run rather than typed into a document. Pure functions, no DOM.
 */

/** Relative luminance of an sRGB colour, per WCAG 2.x. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}

export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a 3 or 6 digit hex colour: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Contrast ratio between two colours, 1 to 21. */
export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The `--name: #hex` declarations in a stylesheet (the design tokens). */
export function tokenColors(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of stripComments(css).matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}

export interface TextPair {
  file: string;
  selector: string;
  fg: string;
  bg: string;
  /** Where the background came from: the same rule, or the page grounds when the rule sets none. */
  bgSource: "rule" | "page";
  ratio: number;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The only named colours the stylesheets use. Add one here if a rule needs another. */
const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };

function resolve(value: string, tokens: Record<string, string>): string | undefined {
  const v = value.trim();
  if (NAMED[v.toLowerCase()]) return NAMED[v.toLowerCase()];
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(v)) return v;
  const m = /^var\(--([a-z0-9-]+)(?:\s*,\s*(#[0-9a-fA-F]{3,6}))?\)$/.exec(v);
  if (m) return tokens[m[1]!] ?? m[2];
  return undefined;
}

/**
 * Every rule that sets a plain colour for text. A rule that also sets its own background is
 * measured against that; one that does not is measured against each page ground (the worst wins).
 * Translucent, gradient and inherited colours cannot be resolved here and are skipped.
 */
export function textPairs(file: string, css: string, tokens: Record<string, string>, grounds: string[]): TextPair[] {
  const pairs: TextPair[] = [];
  for (const block of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1]!.trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    const decls = block[2]!;
    const fg = /(?:^|[;\s])color\s*:\s*([^;]+)/.exec(decls);
    if (!fg) continue;
    const fgHex = resolve(fg[1]!, tokens);
    if (!fgHex) continue;
    const bgMatch = /(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/.exec(decls);
    // "transparent" and "none" paint nothing: the text sits on the page ground, so measure it there.
    const bg = bgMatch && !/^(?:transparent|none)$/i.test(bgMatch[1]!.trim()) ? bgMatch : null;
    const bgHex = bg ? resolve(bg[1]!, tokens) : undefined;
    if (bgHex) {
      pairs.push({ file, selector, fg: fgHex, bg: bgHex, bgSource: "rule", ratio: ratio(fgHex, bgHex) });
      continue;
    }
    if (bg) continue; // a background we cannot resolve (gradient, translucent): do not guess
    for (const g of grounds) pairs.push({ file, selector, fg: fgHex, bg: g, bgSource: "page", ratio: ratio(fgHex, g) });
  }
  return pairs;
}

/**
 * Text colours and fills the scan could not measure, so the gap is a list a reviewer can read, not
 * a silent skip. `inherit` and `currentColor` are not gaps: the colour they take is measured where
 * it is set. Fills that are translucent, gradients or written as rgb(), hsl() or 8-digit hex land here.
 */
export function unmeasured(file: string, css: string, tokens: Record<string, string>): string[] {
  const out: string[] = [];
  for (const block of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1]!.trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    const decls = block[2]!;
    const fg = /(?:^|[;\s])color\s*:\s*([^;]+)/.exec(decls);
    const fgValue = fg?.[1]!.trim();
    if (!fg || /^(?:inherit|currentcolor|initial|unset)$/i.test(fgValue!)) continue;
    if (!resolve(fgValue!, tokens)) {
      out.push(`${file} ${selector}: color ${fgValue}`);
      continue;
    }
    const bg = /(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/.exec(decls);
    const bgValue = bg?.[1]!.trim();
    if (bg && !/^(?:transparent|none)$/i.test(bgValue!) && !resolve(bgValue!, tokens)) out.push(`${file} ${selector}: background ${bgValue}`);
  }
  return out;
}
