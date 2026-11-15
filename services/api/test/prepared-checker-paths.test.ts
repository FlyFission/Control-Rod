import { describe, expect, it } from "vitest";
import { preparedCheckerOutputPaths } from "../src/work.js";

describe("prepared checker output paths", () => {
  it("keeps fake evidence on out/ and sandboxed evidence under scratch/evidence/", () => {
    expect(preparedCheckerOutputPaths("fake")).toEqual({
      verdict: "out/verification.json",
      criterion: "out/criterion-results.json",
      verdictRef: "checker:verification.json",
      criterionRef: "checker:criterion-results.json",
      evidence:
        "Retain actual check evidence as separate out/ files and reference it as checker:<relative file name>.",
    });
    for (const runtime of ["claude", "codex"]) {
      expect(preparedCheckerOutputPaths(runtime)).toEqual({
        verdict: "scratch/verification.json",
        criterion: "scratch/criterion-results.json",
        verdictRef: "checker:verification.json",
        criterionRef: "checker:criterion-results.json",
        evidence:
          "Retain check evidence as files under scratch/evidence/ and reference each as checker:evidence/<relative file name>.",
      });
    }
  });
});
