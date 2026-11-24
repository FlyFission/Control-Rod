import { describe, expect, it } from "vitest";
import { isDiffName, parseUnifiedDiff } from "./diff.js";

const GIT = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,5 @@ function head
 keep one
-old two
+new two
+new three
 keep four
@@ -10,2 +11,2 @@
 ctx
-gone
+here
\\ No newline at end of file
diff --git a/b.txt b/b.txt
new file mode 100644
--- /dev/null
+++ b/b.txt
@@ -0,0 +1,2 @@
+x
+y
`;

describe("parseUnifiedDiff", () => {
  it("reads files, hunks, signs and numbers both sides", () => {
    const d = parseUnifiedDiff(GIT)!;
    expect(d.files.map((f) => f.path)).toEqual(["src/a.ts", "b.txt"]);
    expect([d.added, d.removed]).toEqual([5, 2]);
    const h = d.files[0]!.hunks[0]!;
    expect(h.section).toBe("function head");
    expect(h.lines).toEqual([
      { kind: "ctx", oldNo: 1, newNo: 1, text: "keep one" },
      { kind: "del", oldNo: 2, text: "old two" },
      { kind: "add", newNo: 2, text: "new two" },
      { kind: "add", newNo: 3, text: "new three" },
      { kind: "ctx", oldNo: 3, newNo: 4, text: "keep four" },
    ]);
    // The second hunk restarts from its own header, and the no-newline marker is a note.
    expect(d.files[0]!.hunks[1]!.lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ["ctx", 10, 11],
      ["del", 11, undefined],
      ["add", undefined, 12],
      ["note", undefined, undefined],
    ]);
    expect(d.files[1]!.hunks[0]!.lines.map((l) => l.newNo)).toEqual([1, 2]);
  });

  it("reads a removed line that starts with dashes as a removal, not a file header", () => {
    const d = parseUnifiedDiff("--- a/f\n+++ b/f\n@@ -1,2 +1,1 @@\n--- not a header\n keep\n")!;
    expect(d.files).toHaveLength(1);
    expect(d.files[0]!.hunks[0]!.lines[0]).toEqual({ kind: "del", oldNo: 1, text: "-- not a header" });
  });

  it("splits a plain multi-file diff -u on its --- lines", () => {
    const d = parseUnifiedDiff("--- a/one\t2026-01-01\n+++ b/one\t2026-01-02\n@@ -1 +1 @@\n-a\n+b\n--- a/two\n+++ b/two\n@@ -1 +1 @@\n-c\n+d\n")!;
    expect(d.files.map((f) => f.path)).toEqual(["one", "two"]);
    expect(d.lines).toBe(4);
  });

  it("takes CRLF text and a hunk count of one when the count is omitted", () => {
    const d = parseUnifiedDiff("--- a/f\r\n+++ b/f\r\n@@ -3 +3 @@\r\n-x\r\n+y\r\n")!;
    expect(d.files[0]!.hunks[0]!.lines.map((l) => l.text)).toEqual(["x", "y"]);
  });

  it("keeps binary, rename and mode-only files beside a text edit", () => {
    const text = [
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/logo.png b/logo.png",
      "Binary files a/logo.png and b/logo.png differ",
      "diff --git a/old.md b/new.md",
      "similarity index 100%",
      "rename from old.md",
      "rename to new.md",
      "diff --git a/run.sh b/run.sh",
      "old mode 100644",
      "new mode 100755",
    ].join("\n");
    const d = parseUnifiedDiff(text)!;
    expect(d.files.map((f) => f.path)).toEqual(["a.txt", "logo.png", "new.md", "run.sh"]);
    expect(d.files[1]!.hunks).toEqual([]);
    expect(d.files[1]!.meta.some((m) => m.startsWith("Binary files"))).toBe(true);
  });

  it("returns null for text that holds no hunk", () => {
    expect(parseUnifiedDiff("just some notes\nwith lines")).toBeNull();
    expect(parseUnifiedDiff("")).toBeNull();
    expect(parseUnifiedDiff("--- a\n+++ b\n")).toBeNull();
  });

  it("names the files people call a diff", () => {
    expect(isDiffName("patches/x.diff")).toBe(true);
    expect(isDiffName("X.PATCH")).toBe(true);
    expect(isDiffName("notes.md")).toBe(false);
  });
});
