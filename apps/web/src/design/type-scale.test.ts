import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Selectors whose labels sit inside a scaled scene (a floor, an office stage) and are sized with
 * it. Everything else is readable chrome and keeps to the type tokens. Add to this list only for
 * art that a list or card view already offers in full-size text.
 */
const SCENE = [".figure", ".room-", ".office-plate", ".office-loop", ".office-figure", ".floor-station", ".floor-actor", ".floor-overflow"];

const isScene = (selector: string) => selector.split(",").every((s) => SCENE.some((x) => s.trim().startsWith(x) || s.includes(` ${x}`)));

describe("reading comfort: type scale", () => {
  const tokens = read("./tokens.css");
  const px = (name: string) => Number(new RegExp(`--${name}:\\s*([0-9.]+)px`).exec(tokens)?.[1]);

  it("keeps the smallest readable step at 11px and steps up from there", () => {
    expect(px("fs-chip")).toBeGreaterThanOrEqual(11);
    expect(px("fs-label")).toBeGreaterThan(px("fs-chip"));
    expect(px("fs-small")).toBeGreaterThan(px("fs-label"));
    expect(px("fs-ui")).toBeGreaterThan(px("fs-small"));
  });

  it("leaves letter spacing at each font's default for body text, and line height out of the cramped range", () => {
    expect(tokens).not.toMatch(/--(?:ls|tracking)[a-z-]*:/);
    expect(Number(/--lh-mono:\s*([0-9.]+)/.exec(tokens)?.[1])).toBeGreaterThanOrEqual(1.2);
  });

  it("sets no readable text below 14px outside scene art except through a --fs-* token", () => {
    const offenders: string[] = [];
    for (const file of ["../styles.css", "../features/floor/floor.css", "../features/office/office.css"]) {
      for (const block of read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = block[1]!.trim().replace(/\s+/g, " ");
        if (selector.startsWith("@") || isScene(selector)) continue;
        for (const d of block[2]!.matchAll(/font-size:\s*([0-9.]+)px/g)) {
          if (Number(d[1]) < 14) offenders.push(`${file} ${selector}: ${d[1]}px (use a --fs-* token)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
