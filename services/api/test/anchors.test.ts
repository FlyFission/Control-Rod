import { describe, expect, it } from "vitest";
import { type AnchoredQuote, type Snapshot, checkAnchor, parseUnifiedDiff, sections, validPath } from "../src/anchors.js";
import { loadValidator } from "../src/schemas.js";

/** Stage 1 anchoring (pattern PL3; review panel design 6.3). */

const BASE: Record<string, string> = {
  "src/calc.ts": "export function area(r: number) {\n  return 3.14 * r * r;\n}\n// old helper\nexport const unused = 1;\n",
  "docs/old.md": "# Old\n\nThis file goes away.\n",
  "docs/guide.md": "# Guide\n\n## Setup\n\nRun the setup.\n\n## Removed part\n\nGone soon.\n",
};
const HEAD: Record<string, string> = {
  "src/calc.ts": "export function area(r: number) {\n  return Math.PI * r * r;\n}\n",
  "src/new.ts": "export const added = true;\n",
  "docs/guide.md":
    "# Guide\n\n## Setup\n\nRun the setup.\n\n```md\n## Not a heading\n```\n\n### Notes\n\nKeep the  setup\n  short.\n\n## Usage\n\n### Notes\n\nOther notes.\n",
};
const DIFF = `diff --git a/src/calc.ts b/src/calc.ts
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -1,5 +1,3 @@
 export function area(r: number) {
-  return 3.14 * r * r;
+  return Math.PI * r * r;
 }
-// old helper
-export const unused = 1;
diff --git a/docs/old.md b/docs/old.md
deleted file mode 100644
--- a/docs/old.md
+++ /dev/null
@@ -1,3 +0,0 @@
-# Old
-
-This file goes away.
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+export const added = true;
diff --git a/docs/guide.md b/docs/guide.md
--- a/docs/guide.md
+++ b/docs/guide.md
@@ -5,6 +5,18 @@
 Run the setup.

-## Removed part
-
-Gone soon.
+\`\`\`md
+## Not a heading
+\`\`\`
+
+### Notes
+
+Keep the  setup
+  short.
+
+## Usage
+
+### Notes
+
+Other notes.
`;

const diffTarget: Snapshot = { head: (p) => HEAD[p], base: (p) => BASE[p], diff: parseUnifiedDiff(DIFF) };
const folderTarget: Snapshot = { head: (p) => HEAD[p] };
const check = (q: AnchoredQuote, s: Snapshot = diffTarget) => checkAnchor(q, s);

describe("head lines", () => {
  const anchor = { kind: "head-lines", path: "src/calc.ts", start: 2, end: 2 } as const;

  it("anchor when the quote is at those lines, whatever the whitespace", () => {
    expect(check({ anchor, quote: "return   Math.PI * r * r;" }, folderTarget)).toEqual({ anchored: true });
  });

  it("say whether the lines touch the change on a diff target", () => {
    expect(check({ anchor, quote: "Math.PI" })).toEqual({ anchored: true, outside_change: false });
    expect(
      check({ anchor: { kind: "head-lines", path: "docs/guide.md", start: 1, end: 1 }, quote: "# Guide" }),
    ).toEqual({ anchored: true, outside_change: true });
  });

  it("refuse a missing path, a bad or out-of-range span, no quote, and a quote one line off", () => {
    expect(check({ anchor: { ...anchor, path: "src/missing.ts" }, quote: "x" }).failure).toBe("path-missing");
    expect(check({ anchor: { ...anchor, start: 3, end: 2 }, quote: "x" }).failure).toBe("bad-range");
    expect(check({ anchor: { ...anchor, start: 0, end: 1 }, quote: "x" }).failure).toBe("bad-range");
    expect(check({ anchor: { ...anchor, start: 3, end: 4 }, quote: "}" }).failure).toBe("out-of-range");
    expect(check({ anchor }).failure).toBe("missing-quote");
    expect(check({ anchor, quote: "   " }).failure).toBe("missing-quote");
    expect(check({ anchor: { ...anchor, start: 1, end: 1 }, quote: "Math.PI" }).failure).toBe("quote-not-found");
  });

  it("refuse paths that could leave the snapshot", () => {
    for (const path of ["/etc/passwd", "../secret", "src/../../x", "a\\b", ".", "src/./calc.ts", ""]) {
      expect(validPath(path), path).toBe(false);
      expect(check({ anchor: { ...anchor, path }, quote: "x" }).failure, path).toBe("bad-path");
    }
    expect(validPath("src/.hidden/a..b.ts")).toBe(true);
  });
});

describe("base lines", () => {
  const anchor = { kind: "base-lines", path: "src/calc.ts", start: 4, end: 5 } as const;

  it("anchor removed lines that the quote matches", () => {
    expect(check({ anchor, quote: "// old helper export const unused" })).toEqual({ anchored: true });
  });

  it("refuse unchanged base lines, a folder target, and a quote not there", () => {
    expect(check({ anchor: { ...anchor, start: 1, end: 1 }, quote: "export function area" }).failure).toBe("not-in-change");
    expect(check({ anchor, quote: "unused" }, folderTarget).failure).toBe("not-a-diff");
    expect(check({ anchor, quote: "Math.PI" }).failure).toBe("quote-not-found");
  });
});

describe("deleted file", () => {
  const anchor = { kind: "deleted-file", path: "docs/old.md" } as const;

  it("anchor a file the diff deletes, with or without a quote from it", () => {
    expect(check({ anchor })).toEqual({ anchored: true });
    expect(check({ anchor, quote: "goes away" })).toEqual({ anchored: true });
  });

  it("refuse a file that still exists, one that never did, and a quote not in it", () => {
    expect(check({ anchor: { ...anchor, path: "src/calc.ts" } }).failure).toBe("not-deleted");
    expect(check({ anchor: { ...anchor, path: "src/new.ts" } }).failure).toBe("path-missing");
    expect(check({ anchor, quote: "not in the file" }).failure).toBe("quote-not-found");
    expect(check({ anchor }, folderTarget).failure).toBe("not-a-diff");
  });
});

describe("sections", () => {
  it("resolve a heading path to one section, ignoring headings inside code fences", () => {
    expect(sections(HEAD["docs/guide.md"]!, ["Not a heading"])).toEqual([]);
    expect(sections(HEAD["docs/guide.md"]!, ["Setup", "Notes"])).toHaveLength(1);
    expect(
      check({ anchor: { kind: "section", path: "docs/guide.md", side: "head", heading_path: ["Setup", "Notes"] }, quote: "Keep the setup short." }),
    ).toEqual({ anchored: true });
  });

  it("refuse a path that matches no section or several", () => {
    const head = { kind: "section", path: "docs/guide.md", side: "head" } as const;
    expect(check({ anchor: { ...head, heading_path: ["Install"] } }).failure).toBe("section-missing");
    expect(check({ anchor: { ...head, heading_path: ["Notes"] } }).failure).toBe("section-ambiguous");
    expect(check({ anchor: { ...head, heading_path: ["Usage", "Notes"] }, quote: "Keep the setup" }).failure).toBe("quote-not-found");
  });

  it("anchor a removed section in base only when the change removed it", () => {
    const base = { kind: "section", path: "docs/guide.md", side: "base" } as const;
    expect(check({ anchor: { ...base, heading_path: ["Removed part"] }, quote: "Gone soon." })).toEqual({ anchored: true });
    expect(check({ anchor: { ...base, heading_path: ["Setup"] } }).failure).toBe("not-in-change");
    expect(check({ anchor: { ...base, heading_path: ["Removed part"] } }, folderTarget).failure).toBe("not-a-diff");
  });
});

describe("unified diff parsing", () => {
  it("records the exact removed and added line numbers, and deleted and added files", () => {
    const files = parseUnifiedDiff(DIFF);
    const calc = files.find((f) => f.newPath === "src/calc.ts")!;
    expect(calc.hunks[0]).toMatchObject({ removed: [2, 4, 5], added: [2] });
    expect(files.find((f) => f.oldPath === "docs/old.md")).toMatchObject({ newPath: null });
    expect(files.find((f) => f.newPath === "src/new.ts")).toMatchObject({ oldPath: null });
  });
});

describe("the AnchoredQuote contract", () => {
  const ajv = loadValidator();
  const valid = (v: unknown) => ajv.validate("AnchoredQuote.json", v);

  it("accepts each anchor kind and refuses unknown fields, escaping paths and bad spans", () => {
    expect(valid({ anchor: { kind: "head-lines", path: "src/calc.ts", start: 2, end: 2 }, quote: "x" })).toBe(true);
    expect(valid({ anchor: { kind: "base-lines", path: "src/calc.ts", start: 4, end: 5 }, quote: "x" })).toBe(true);
    expect(valid({ anchor: { kind: "deleted-file", path: "docs/old.md" } })).toBe(true);
    expect(valid({ anchor: { kind: "section", path: "a.md", side: "base", heading_path: ["A"] } })).toBe(true);
    expect(valid({ anchor: { kind: "head-lines", path: "../x", start: 1, end: 1 }, quote: "x" })).toBe(false);
    expect(valid({ anchor: { kind: "head-lines", path: "x", start: 0, end: 1 }, quote: "x" })).toBe(false);
    expect(valid({ anchor: { kind: "deleted-file", path: "x", extra: 1 } })).toBe(false);
    expect(valid({ anchor: { kind: "section", path: "a.md", side: "head", heading_path: [] } })).toBe(false);
  });
});

describe("review fixes", () => {
  it("decodes git's C-quoted paths in diff headers", () => {
    const diff = 'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"\n--- "a/caf\\303\\251.txt"\n+++ "b/caf\\303\\251.txt"\n@@ -1 +1 @@\n-old\n+new\n';
    const [file] = parseUnifiedDiff(diff);
    expect(file?.oldPath).toBe("café.txt");
    expect(file?.newPath).toBe("café.txt");
    const tab = parseUnifiedDiff('--- "a/x\\ty.txt"\n+++ "b/x\\ty.txt"\n@@ -1 +1 @@\n-a\n+b\n');
    expect(tab[0]?.newPath).toBe("x\ty.txt");
  });

  it("keeps a longer fence open across a shorter inner fence", () => {
    const doc = "# Top\n\n````md\n```js\nx\n```\n## Fake\n````\n\n## Real\n\ntext\n";
    expect(sections(doc, ["Fake"])).toEqual([]);
    expect(sections(doc, ["Top", "Real"])).toHaveLength(1);
    expect(sections("# A\n\n~~~\n```\n## In\n~~~\n", ["In"])).toEqual([]);
    expect(sections("# A\n\n```\n```js\n## In\n```\n", ["In"])).toEqual([]);
  });
});

describe("more review fixes", () => {
  it("refuses a path with a line break before a dot segment", () => {
    expect(validPath("x\n/../../secret")).toBe(false);
    expect(validPath("x\r\n..")).toBe(false);
    expect(validPath("docs/guide.md")).toBe(true);
  });

  it("keeps an empty file's deletion and addition, which have no ---/+++ lines", () => {
    const diff =
      "diff --git a/empty.txt b/empty.txt\ndeleted file mode 100644\nindex e69de29..0000000\n" +
      "diff --git a/new file.txt b/new file.txt\nnew file mode 100644\nindex 0000000..e69de29\n" +
      "diff --git a/src/calc.ts b/src/calc.ts\n--- a/src/calc.ts\n+++ b/src/calc.ts\n@@ -1 +1 @@\n-a\n+b\n";
    const files = parseUnifiedDiff(diff);
    expect(files).toContainEqual({ oldPath: "empty.txt", newPath: null, hunks: [] });
    expect(files).toContainEqual({ oldPath: null, newPath: "new file.txt", hunks: [] });
    expect(files.filter((f) => f.oldPath === "src/calc.ts")).toHaveLength(1);
  });
});

describe("diff header paths", () => {
  it("keeps a trailing space in an unquoted name, which git ends with a tab", () => {
    const [file] = parseUnifiedDiff("--- a/trailing \t\n+++ b/trailing \t\n@@ -1 +1 @@\n-a\n+b\n");
    expect(file?.oldPath).toBe("trailing ");
    expect(file?.newPath).toBe("trailing ");
  });
});

describe("quoted paths with literal characters", () => {
  it("keeps a literal emoji next to an escape, as git writes with core.quotePath=false", () => {
    const [file] = parseUnifiedDiff('--- "a/😀\\tx.txt"\n+++ "b/😀\\tx.txt"\n@@ -1 +1 @@\n-a\n+b\n');
    expect(file?.oldPath).toBe("😀\tx.txt");
  });
});
