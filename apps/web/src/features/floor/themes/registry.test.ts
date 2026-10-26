import { describe, it, expect } from "vitest";
import {
  THEME_CATALOG,
  getThemeEntry,
  isThemeEligible,
  validateThemePack,
  loadTheme,
} from "./registry.js";
import { PLAIN_THEME } from "./plain.js";

describe("theme admission", () => {
  it("keeps plain available and unknown packs unavailable", () => {
    expect(THEME_CATALOG).toHaveLength(15);
    expect(new Set(THEME_CATALOG.map((x) => x.id)).size).toBe(15);
    expect(getThemeEntry("plain")?.title).toBe("Plain Floor");
    expect(getThemeEntry("../../outside")).toBeUndefined();
    expect(isThemeEligible(THEME_CATALOG[0]!, undefined)).toBe(false);
  });
  it("rejects executable, incompatible and incomplete descriptors", () => {
    expect(validateThemePack(PLAIN_THEME)).toBe(true);
    expect(validateThemePack({ ...PLAIN_THEME, schemaVersion: 2 })).toBe(false);
    expect(validateThemePack({ ...PLAIN_THEME, run: () => {} })).toBe(false);
    expect(validateThemePack({ ...PLAIN_THEME, stations: {} })).toBe(false);
    expect(validateThemePack({ ...PLAIN_THEME, motionProfile: "custom" })).toBe(
      false,
    );
  });
  it("does not mistake draft access for public release permission", async () => {
    await expect(loadTheme("creature-dispatch", false)).rejects.toThrow(
      /release/i,
    );
    expect((await loadTheme("plain", false)).id).toBe("plain");
  });
});
