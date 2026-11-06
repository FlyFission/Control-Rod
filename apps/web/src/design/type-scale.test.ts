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

  /** The size a `font-size` value or a `font` shorthand sets, or why it could not be read. */
  const sizeProblem = (prop: string, value: string): string | null => {
    const v = value.trim();
    if (/^(?:inherit|initial|unset)$/i.test(v)) return null;
    if (prop === "font") {
      // The shorthand: `inherit`, or a size then a family. Read the size; refuse what cannot be read.
      const size = /^(?:[a-z-]+\s+)*(var\(--fs-[a-z]+\)|[0-9.]+px)(?=\s|\/|$)/i.exec(v)?.[1];
      return size ? sizeProblem("font-size", size) : `font shorthand not understood: ${v}`;
    }
    if (/^var\(--fs-[a-z]+\)$/.test(v)) return null;
    const px = /^([0-9.]+)px$/.exec(v)?.[1];
    if (px) return Number(px) < 14 ? `${px}px (use a --fs-* token)` : null;
    const clamp = /^clamp\(\s*([0-9.]+)px\s*,/.exec(v)?.[1];
    if (clamp) return Number(clamp) < 14 ? `clamp minimum ${clamp}px` : null;
    return `unrecognised size ${v}: write a --fs-* token or px, or extend this guard`;
  };

  it("sets no readable text below 14px outside scene art except through a --fs-* token", () => {
    const offenders: string[] = [];
    for (const file of ["../styles.css", "../features/floor/floor.css", "../features/office/office.css"]) {
      for (const block of read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = block[1]!.trim().replace(/\s+/g, " ");
        if (selector.startsWith("@") || isScene(selector)) continue;
        for (const d of block[2]!.matchAll(/(?:^|[;\s])(font-size|font)\s*:\s*([^;]+)/g)) {
          const problem = sizeProblem(d[1]!, d[2]!);
          if (problem) offenders.push(`${file} ${selector}: ${problem}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("applies the monospace line height to logs, previews and markdown code blocks", () => {
    const blocks = [...read("../styles.css").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: m[1]!.split(",").map((x) => x.trim().replace(/\s+/g, " ")),
      body: m[2]!,
    }));
    for (const selector of [".log", ".preview-text", ".markdown pre"]) {
      const bodies = blocks.filter((b) => b.selectors.includes(selector)).map((b) => b.body).join("\n");
      expect(bodies, selector).toContain("line-height: var(--lh-mono)");
    }
  });

  it("reads the size forms it claims to guard", () => {
    expect(sizeProblem("font", "10px monospace")).toMatch(/10px/);
    expect(sizeProblem("font", "inherit")).toBeNull();
    expect(sizeProblem("font", "var(--fs-chip) monospace")).toBeNull();
    expect(sizeProblem("font-size", "0.7rem")).toMatch(/unrecognised/);
    expect(sizeProblem("font-size", "calc(10px + 1px)")).toMatch(/unrecognised/);
    expect(sizeProblem("font-size", "clamp(30px, 4vw, 48px)")).toBeNull();
  });
});
