import { describe, expect, it } from "vitest";
import { preparedCheckerOutputPaths } from "../src/work.js";

describe("prepared checker output paths", () => {
  it("keeps the fake runtime on out/ and a sandboxed checker on scratch/, with the uploaded names in checker: references", () => {
    expect(preparedCheckerOutputPaths("fake")).toEqual({
      verdict: "out/verification.json",
      criterion: "out/criterion-results.json",
      verdictRef: "checker:verification.json",
      criterionRef: "checker:criterion-results.json",
    });
    for (const runtime of ["claude", "codex"]) {
      expect(preparedCheckerOutputPaths(runtime)).toEqual({
        verdict: "scratch/verification.json",
        criterion: "scratch/criterion-results.json",
        verdictRef: "checker:verification.json",
        criterionRef: "checker:criterion-results.json",
      });
    }
  });
});
