import { describe, expect, it } from "vitest";
import { newer } from "./semver.js";

/** SemVer 2.0 precedence (the copy in services/api/src/semver.ts), the order from the SemVer spec. */
const ORDER = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0", "10.0.0"];

describe("newer", () => {
  it("follows SemVer precedence in both directions", () => {
    for (let i = 0; i < ORDER.length; i++) for (let j = 0; j < ORDER.length; j++) expect(newer(ORDER[i]!, ORDER[j]!)).toBe(i > j);
  });
  it("compares long numeric identifiers by value and refuses what is not strict", () => {
    expect(newer("1.2.3-99999999999999999999", "1.2.3-18446744073709551616")).toBe(true);
    expect(newer("1.2.3-18446744073709551616", "1.2.3-99999999999999999999")).toBe(false);
    expect(newer("1.2.3-a", "1.2.3-999")).toBe(true);
    for (const bad of ["1.2.3+build", "1.2.3-", "01.2.3", "1.2", "", "1.2.3-rc.01"]) {
      expect(newer(bad, "0.0.1")).toBe(false);
      expect(newer("9.9.9", bad)).toBe(false);
    }
  });
});
