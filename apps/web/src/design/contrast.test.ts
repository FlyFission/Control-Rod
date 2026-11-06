import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOOKS, SURFACE_TOKENS, TEXT_TOKENS, contrastRatio, parseLooks } from "../../scripts/contrast-lib.mjs";

const css = readFileSync(resolve(process.cwd(), "src/design/tokens.css"), "utf8");
const looks = parseLooks(css);

describe("contrast of text tokens on surfaces", () => {
  it("parses all three looks with every checked token", () => {
    for (const look of LOOKS) {
      for (const t of [...TEXT_TOKENS, ...SURFACE_TOKENS]) {
        expect(looks[look]![t], `${look} ${t}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("computes the WCAG reference ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  for (const look of LOOKS) {
    for (const text of TEXT_TOKENS) {
      for (const surface of SURFACE_TOKENS) {
        it(`look ${look}: ${text} on ${surface} is at least 4.5:1`, () => {
          const ratio = contrastRatio(looks[look]![text]!, looks[look]![surface]!);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
