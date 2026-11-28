import { describe, expect, it } from "vitest";
import { changedRepoFiles, patchSections, touchedFiles } from "../src/change-files.js";

/** Scope from the patch (change record scope-from-patch): a checkout card's files come from its patch. */
const diff = (file: string, from: string, to: string) =>
  `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-${from}\n+${to}\n`;
const out = (name: string, text: string) => ({ name, sha256: String(text.length), bytes: Buffer.from(text) });

describe("touchedFiles", () => {
  it("uses the files the change patch touches, not the output names", () => {
    expect(touchedFiles([out("changes.patch", diff("src/a.ts", "a", "b") + diff("src/b.ts", "a", "b")), out("RESPONSE.md", "Done.")])).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("falls back to output names when there is no patch", () => {
    expect(touchedFiles([out("report.md", "x"), out("notes.md", "y")])).toEqual(["report.md", "notes.md"]);
    expect(touchedFiles([])).toEqual([]);
  });

  it("takes every patch when two would change the same file", () => {
    const outs = [out("a.patch", diff("src/a.ts", "a", "b")), out("b.patch", diff("src/a.ts", "a", "c") + diff("src/c.ts", "a", "b"))];
    expect(touchedFiles(outs).sort()).toEqual(["src/a.ts", "src/c.ts"]);
  });
});

describe("patchSections", () => {
  it("splits a git patch and a plain unified diff per file", () => {
    const git = patchSections(diff("a.ts", "1", "2") + diff("b.ts", "1", "2"));
    expect([...git.keys()]).toEqual(["a.ts", "b.ts"]);
    expect(git.get("a.ts")).toContain("+2");
    expect(git.get("a.ts")).not.toContain("b.ts");
    const plain = patchSections("--- a/x.md\n+++ b/x.md\n@@ -1 +1 @@\n-1\n+2\n--- a/y.md\n+++ b/y.md\n@@ -1 +1 @@\n-1\n+3\n");
    expect([...plain.keys()]).toEqual(["x.md", "y.md"]);
    expect(plain.get("y.md")).toContain("+3");
  });
});

describe("changedRepoFiles", () => {
  it("on a checkout card, names the repository files whose change differs between rounds", () => {
    const r1 = [out("changes.patch", diff("src/a.ts", "a", "b") + diff("src/b.ts", "a", "b")), out("RESPONSE.md", "Round 1.")];
    const r2 = [out("changes.patch", diff("src/a.ts", "a", "c") + diff("src/b.ts", "a", "b") + diff("src/new.ts", "", "x")), out("RESPONSE.md", "Round 2.")];
    // Never changes.patch or RESPONSE.md; src/b.ts changed the same way in both rounds.
    expect(changedRepoFiles(r1, r2)).toEqual(["src/a.ts", "src/new.ts"]);
  });

  it("reports a file a later round stopped changing", () => {
    const r1 = [out("changes.patch", diff("src/a.ts", "a", "b") + diff("src/b.ts", "a", "b"))];
    const r2 = [out("changes.patch", diff("src/a.ts", "a", "b"))];
    expect(changedRepoFiles(r1, r2)).toEqual(["src/b.ts"]);
  });

  it("without a patch, compares outputs by name and digest", () => {
    expect(changedRepoFiles([out("a.md", "1"), out("b.md", "2")], [out("a.md", "11"), out("b.md", "2"), out("c.md", "3")])).toEqual(["a.md", "c.md"]);
  });
});

describe("quoted Git paths and hunk whitespace", () => {
  // Made by `git diff` after changing é.md and ta"b.md: Git quotes both paths.
  const quoted = "diff --git \"a/ta\\\"b.md\" \"b/ta\\\"b.md\"\nindex 7898192..6178079 100644\n--- \"a/ta\\\"b.md\"\n+++ \"b/ta\\\"b.md\"\n@@ -1 +1 @@\n-a\n+b\ndiff --git \"a/\\303\\251.md\" \"b/\\303\\251.md\"\nindex 587be6b..975fbec 100644\n--- \"a/\\303\\251.md\"\n+++ \"b/\\303\\251.md\"\n@@ -1 +1 @@\n-x\n+y\n";

  it("decodes the paths Git quotes", () => {
    expect(touchedFiles([out("changes.patch", quoted)])).toEqual(['ta"b.md', "é.md"]);
    expect(changedRepoFiles([], [out("changes.patch", quoted)])).toEqual(["é.md", 'ta"b.md'].sort());
  });

  it("sees a change to trailing spaces on the last added line of a plain diff", () => {
    const plain = (last: string) => `--- a/doc.md\n+++ b/doc.md\n@@ -1 +1 @@\n-old\n+${last}\n`;
    expect(changedRepoFiles([out("changes.patch", plain("new"))], [out("changes.patch", plain("new  "))])).toEqual(["doc.md"]);
    expect(changedRepoFiles([out("changes.patch", plain("new"))], [out("changes.patch", plain("new") + "\n\n")])).toEqual([]);
  });

  it("does not take hunk lines that look like file headers for a new file", () => {
    const plain = (last: string) => `--- a/docs/guide.md\n+++ b/docs/guide.md\n@@ -1,2 +1,3 @@\n--- a/example.md\n+++ b/example.md\n+${last}\n keep\n`;
    expect(touchedFiles([out("changes.patch", plain("one"))])).toEqual(["docs/guide.md"]);
    expect(changedRepoFiles([out("changes.patch", plain("one"))], [out("changes.patch", plain("two"))])).toEqual(["docs/guide.md"]);
  });
});
