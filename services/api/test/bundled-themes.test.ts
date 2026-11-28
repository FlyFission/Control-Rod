import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledThemes } from "../src/admin.js";

/** The office themes the API offers come from the web app's bundled packs (API-35). */
describe("bundled themes", () => {
  it("offers nothing, and does not fail, when the web assets are not installed", () => {
    expect(bundledThemes(mkdtempSync(join(tmpdir(), "cr-themes-"))).size).toBe(0);
  });

  it("lists each pack directory with a manifest, and skips stray files and folders without one", () => {
    const root = mkdtempSync(join(tmpdir(), "cr-themes-"));
    const dir = join(root, "apps", "web", "public", "floor-themes");
    mkdirSync(join(dir, "corner-cafe"), { recursive: true });
    writeFileSync(join(dir, "corner-cafe", "assets.json"), "{}");
    mkdirSync(join(dir, "half-made"));
    writeFileSync(join(dir, ".DS_Store"), "");
    expect([...bundledThemes(root).keys()]).toEqual(["corner-cafe"]);
  });
});
