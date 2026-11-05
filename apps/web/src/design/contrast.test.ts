import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ratio, textPairs, tokenColors } from "./contrast.js";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const tokensCss = read("./tokens.css");
const tokens = tokenColors(tokensCss);
const GROUNDS = ["ground", "surface", "panel"] as const;

/**
 * Reading comfort: the research this app's text rules rest on (.nuclear/changes/reading-comfort)
 * finds adequate luminance contrast is the robust requirement, while "softer" themes usually get
 * their softness by making secondary text harder to read. These checks keep every text colour at
 * WCAG AA (4.5:1) or better, and the three reading colours at AAA (7:1), measured from the files.
 */
describe("text contrast", () => {
  it("keeps the three reading colours at AAA on every page ground", () => {
    for (const name of ["text", "text-2", "muted"]) {
      for (const g of GROUNDS) {
        expect(ratio(tokens[name]!, tokens[g]!), `--${name} on --${g}`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("keeps every state colour at AA on every page ground", () => {
    for (const name of ["accent", "needs", "waiting", "stuck", "changed", "done", "idle"]) {
      for (const g of GROUNDS) {
        expect(ratio(tokens[name]!, tokens[g]!), `--${name} on --${g}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps text on its own fill at AA", () => {
    expect(ratio(tokens["accent-ink"]!, tokens["accent"]!)).toBeGreaterThanOrEqual(4.5);
  });

  const files = {
    "styles.css": read("../styles.css"),
    "floor.css": read("../features/floor/floor.css"),
    "office.css": read("../features/office/office.css"),
  };
  const grounds = GROUNDS.map((g) => tokens[g]!);

  it("keeps every plain text colour in the stylesheets at AA", () => {
    const pairs = Object.entries(files).flatMap(([file, css]) => textPairs(file, css, tokens, grounds));
    expect(pairs.length).toBeGreaterThan(20);
    const worst = [...pairs].sort((a, b) => a.ratio - b.ratio);
    // The table is the recorded measurement: one line per rule and ground, worst first.
    console.log(
      worst
        .slice(0, 12)
        .map((p) => `${p.ratio.toFixed(2)}  ${p.fg} on ${p.bg} (${p.bgSource})  ${p.file}  ${p.selector}`)
        .join("\n"),
    );
    const failing = worst.filter((p) => p.ratio < 4.5).map((p) => `${p.ratio.toFixed(2)} ${p.fg} on ${p.bg} ${p.file} ${p.selector}`);
    expect(failing).toEqual([]);
  });
});
