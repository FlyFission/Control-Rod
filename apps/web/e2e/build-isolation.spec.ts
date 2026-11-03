import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Builds reuse an output directory outside the project, where Vite does not empty it.
// A release build must never inherit draft art or the demo page from an earlier draft build.
function build(outDir: string, draft: boolean) {
  execFileSync("pnpm", ["exec", "vite", "build", "--outDir", outDir], {
    env: {
      ...process.env,
      VITE_FLOOR_THEMES_ENABLED: "true",
      VITE_FLOOR_THEME_DRAFTS: draft ? "true" : "false",
    },
    stdio: "pipe",
  });
}

function inventory(dir: string): string[] {
  return readdirSync(dir, { recursive: true }).map(String).sort();
}

test.describe("build output isolation", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "build-only check runs once");
  test.setTimeout(180_000);

  test("a release build into a reused directory carries nothing from an earlier draft build", () => {
    const outDir = mkdtempSync(join(tmpdir(), "control-rod-build-"));
    try {
      build(outDir, true);
      expect(existsSync(join(outDir, "themes.html"))).toBe(true);
      expect(existsSync(join(outDir, "floor-themes"))).toBe(true);
      expect(existsSync(join(outDir, "office-harness.html"))).toBe(true);
      expect(existsSync(join(outDir, "office-themes", "harness-bright"))).toBe(true);

      build(outDir, false);
      const files = inventory(outDir);
      expect(files).not.toContain("themes.html");
      expect(files.some((f) => f.startsWith("floor-themes"))).toBe(false);
      expect(files.some((f) => /^assets\/themes-.*\.js$/.test(f))).toBe(false);
      // The office harness and the structural test theme are draft only; the released theme ships.
      expect(files).not.toContain("office-harness.html");
      expect(files.some((f) => /^assets\/officeHarness-.*\.js$/.test(f))).toBe(false);
      expect(files.some((f) => f.startsWith("office-themes/harness-bright"))).toBe(false);
      expect(files.some((f) => f.startsWith("office-themes/standard-office/"))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test("a build refuses a non-empty directory it did not create", () => {
    const outDir = mkdtempSync(join(tmpdir(), "control-rod-foreign-"));
    try {
      writeFileSync(join(outDir, "keep.txt"), "not a build output\n");
      expect(() => build(outDir, false)).toThrow();
      expect(inventory(outDir)).toEqual(["keep.txt"]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
