import { describe, expect, it } from "vitest";
import { patchFiles } from "../src/work.js";

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
