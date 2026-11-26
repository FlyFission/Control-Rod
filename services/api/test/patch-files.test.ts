import { describe, expect, it } from "vitest";
import { changePatches, patchFiles } from "../src/work.js";

describe("patchFiles", () => {
  it("lists every file a patch touches, renames on both sides, once each", () => {
    const patch = [
      "diff --git a/README.md b/README.md", "--- a/README.md", "+++ b/README.md", "@@ -1 +1 @@", "-a", "+b",
      "diff --git a/old.txt b/new.txt", "similarity index 100%", "rename from old.txt", "rename to new.txt",
      "--- /dev/null", "+++ b/added.md", "@@ -0,0 +1 @@", "+x",
    ].join("\n");
    expect(patchFiles(patch)).toEqual(["README.md", "new.txt", "old.txt", "added.md"]);
    expect(patchFiles("")).toEqual([]);
  });
});

describe("changePatches", () => {
  const diff = (...files: string[]) => files.map((f) => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n@@ -1 +1 @@\n-a\n+b\n`).join("");
  const pick = (outs: { name: string; text: string }[]) => {
    const r = changePatches(outs, (o) => patchFiles(o.text));
    return "use" in r ? r.use.map((o) => o.name) : r.refused;
  };

  it("keeps one patch, and the top-level one over a copy in a work folder", () => {
    expect(pick([{ name: "fix.patch", text: diff("a.ts") }])).toEqual(["fix.patch"]);
    expect(pick([{ name: "fix.patch", text: diff("a.ts") }, { name: "work/changes.patch", text: diff("a.ts") }, { name: "SUMMARY.md", text: "" }])).toEqual(["fix.patch"]);
    expect(pick([{ name: "RESPONSE.md", text: "" }])).toEqual([]);
  });

  it("prefers changes.patch, then takes disjoint patches together in name order", () => {
    expect(pick([{ name: "other.diff", text: diff("a.ts") }, { name: "changes.patch", text: diff("a.ts") }])).toEqual(["changes.patch"]);
    expect(pick([{ name: "TESTS.diff", text: diff("a.test.ts") }, { name: "FIX.diff", text: diff("a.ts") }])).toEqual(["FIX.diff", "TESTS.diff"]);
  });

  it("refuses patches that change the same file", () => {
    expect(pick([{ name: "FIX.diff", text: diff("a.ts") }, { name: "ALL.diff", text: diff("a.ts", "b.ts") }])).toMatch(/both change a\.ts/);
  });
});
