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

describe("criterion results template", () => {
  it("is schema-valid and lists every criterion and mapped check with the released basis", async () => {
    const { criterionResultsTemplate } = await import("../src/preparation/lifecycle.js");
    const { loadValidator } = await import("../src/schemas.js");
    const t = criterionResultsTemplate(
      { package_id: "PKG-1", package_revision: 0, preparation_manifest_digest: { value: "a".repeat(64) } },
      [{ id: "AC-1", verification_check_ids: ["VC-1", "VC-2"] }, { id: "AC-2", verification_check_ids: [] }],
    );
    const ajv = loadValidator();
    expect(ajv.validate("CriterionResultSubmission.json", t), ajv.errorsText()).toBe(true);
    expect(t.release_manifest_digest).toEqual({ algorithm: "sha256", value: "a".repeat(64) });
    expect(t.results.map((r) => [r.criterion_id, r.check_results.map((c) => c.check_id)])).toEqual([
      ["AC-1", ["VC-1", "VC-2"]],
      ["AC-2", []],
    ]);
  });
});
