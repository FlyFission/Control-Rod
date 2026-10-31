import { describe, expect, it } from "vitest";
import {
  type Answer, type CriterionEvidence, MAPPING_VERSION, acceptWithFindingsBlockers, aggregate, answer, combine, independenceOf, mapV1,
} from "../src/evidence.js";

/** Evidence dimensions and readiness truth tables (workbench plan task 1.10; specification 8 and 11.4, WB-14). */
const separated = { separated: true, unseparated: [] };
const base: CriterionEvidence = {
  criterion_id: "AC-1", mandatory: true, completeness: "executed", outcome: "pass", disposition: "none", freshness: "current",
  independence: separated, independence_required: true, evidence_retained: true,
};
const ans = (e: Partial<CriterionEvidence>) => answer({ ...base, ...e }).answer;

describe("mapping version 1 (specification 8)", () => {
  it.each([
    ["evidence-item", "pass", undefined, { completeness: "executed", outcome: "pass", disposition: "none" }],
    ["evidence-item", "open", undefined, { completeness: "missing", outcome: "none", disposition: "none" }],
    ["evidence-item", "deferred", "vendor data late", { completeness: "missing", outcome: "none", disposition: "deferred" }],
    ["evidence-item", "deferred", "  ", { completeness: "missing", outcome: "none", disposition: "none" }],
    ["verification-record", "pass", undefined, { completeness: "executed", outcome: "pass", disposition: "none" }],
    ["verification-record", "fail", undefined, { completeness: "executed", outcome: "fail", disposition: "none" }],
    ["verification-record", "inconclusive", undefined, { completeness: "executed", outcome: "inconclusive", disposition: "none" }],
    ["check-result", "pass", undefined, { completeness: "executed", outcome: "pass", disposition: "none" }],
    ["check-result", "fail", undefined, { completeness: "executed", outcome: "fail", disposition: "none" }],
    ["check-result", "inconclusive", undefined, { completeness: "executed", outcome: "inconclusive", disposition: "none" }],
    ["check-result", "open", undefined, { completeness: "missing", outcome: "none", disposition: "none" }],
    ["criterion-result", "deferred", "awaiting survey", { completeness: "missing", outcome: "none", disposition: "deferred" }],
    ["criterion-result", "open", undefined, { completeness: "missing", outcome: "none", disposition: "none" }],
  ] as const)("%s %s", (source, value, reason, expected) => {
    expect(mapV1(source, value, reason)).toEqual(expected);
  });

  it("has no row for values outside the contract, and records its version", () => {
    expect(() => mapV1("evidence-item", "fail")).toThrow(/no row/);
    expect(() => mapV1("verification-record", "open")).toThrow(/no row/);
    expect(answer(base).mapping_version).toBe(MAPPING_VERSION);
  });
});

describe("criterion answers (E-1, E-2)", () => {
  it.each<[string, Partial<CriterionEvidence>, Answer]>([
    ["complete pass", {}, "YES"],
    ["pass but stale", { freshness: "stale" }, "NO"],
    ["pass without required independence", { independence: { separated: false, unseparated: ["actor is shared"] } }, "NO"],
    ["pass, independence not required by the grade", { independence: { separated: false, unseparated: ["actor is shared"] }, independence_required: false }, "YES"],
    ["fail without disposition", { outcome: "fail" }, "NO"],
    ["fail with approved disposition", { outcome: "fail", disposition: "approved-disposition" }, "YES BY APPROVED DISPOSITION"],
    ["fail with disposition but stale", { outcome: "fail", disposition: "approved-disposition", freshness: "stale" }, "NO"],
    ["mandatory inconclusive, even with a disposition", { outcome: "inconclusive", disposition: "approved-disposition" }, "NO"],
    ["optional inconclusive with disposition", { mandatory: false, outcome: "inconclusive", disposition: "approved-disposition" }, "YES BY APPROVED DISPOSITION"],
    ["optional inconclusive without disposition", { mandatory: false, outcome: "inconclusive" }, "NO"],
    ["missing result", { completeness: "missing", outcome: "none" }, "NO"],
    ["missing result with an approved disposition", { completeness: "missing", outcome: "none", disposition: "approved-disposition" }, "NO"],
    ["deferred", { completeness: "missing", outcome: "none", disposition: "deferred" }, "NO"],
    ["evidence not retained", { evidence_retained: false }, "NO"],
    ["approved N/A basis", { completeness: "missing", outcome: "none", disposition: "approved-na-basis" }, "N/A WITH APPROVED BASIS"],
    ["approved N/A basis but stale", { completeness: "missing", outcome: "none", disposition: "approved-na-basis", freshness: "stale" }, "NO"],
    ["executed with no outcome", { outcome: "none" }, "NO"],
  ])("%s", (_name, e, expected) => {
    expect(ans(e)).toBe(expected);
  });

  it("says why an answer is NO", () => {
    expect(answer({ ...base, outcome: "inconclusive", freshness: "stale" }).reasons).toEqual([
      "an input or basis changed since the evidence was produced",
      "a mandatory check was inconclusive; no disposition can clear it",
    ]);
    expect(answer({ ...base, completeness: "missing", disposition: "deferred" }).reasons).toContain("the check was deferred; a deferral is never a result");
  });
});

describe("aggregation (E-4)", () => {
  const Y = "YES", D = "YES BY APPROVED DISPOSITION", N = "N/A WITH APPROVED BASIS", X = "NO";
  it.each<[Answer[], boolean, Answer]>([
    [[Y, Y], false, Y],
    [[Y, D], false, D],
    [[Y, D, X], false, X],
    [[N, N], false, N],
    [[Y, N], false, Y],
    [[D, N], false, D],
    [[X], false, X],
    [[], false, X],
    [[], true, N],
  ])("%j (set basis %s) is %s", (answers, basis, expected) => {
    expect(aggregate(answers, basis)).toBe(expected);
  });
});

describe("mixed, conflicting and empty result sets", () => {
  const pass = mapV1("check-result", "pass"), fail = mapV1("check-result", "fail"), inc = mapV1("check-result", "inconclusive");
  const open = mapV1("check-result", "open"), deferred = mapV1("check-result", "deferred", "late");
  it.each([
    ["empty", [], { completeness: "missing", outcome: "none", disposition: "none" }],
    ["all pass", [pass, pass], pass],
    ["pass and fail conflict", [pass, fail], fail],
    ["pass and inconclusive", [pass, inc], inc],
    ["fail and inconclusive", [inc, fail], fail],
    ["one still open", [pass, open], { completeness: "missing", outcome: "none", disposition: "none" }],
    ["one deferred", [pass, deferred], { completeness: "missing", outcome: "none", disposition: "deferred" }],
  ] as const)("%s", (_n, results, expected) => {
    expect(combine([...results])).toEqual(expected);
  });
});

describe("independence from custody (E-5)", () => {
  const all = { actor: "independent", context: "independent", mechanism: "independent", authority: "independent", resource: "independent" } as const;
  it("is separated only when every axis of every custody record is independent and the baselines differ", () => {
    expect(independenceOf([all], { author: "a", verifier: "b" })).toEqual({ separated: true, unseparated: [] });
    expect(independenceOf([all, { ...all, context: "shared" }], { author: "a", verifier: "b" }).unseparated).toEqual(["context is shared"]);
    expect(independenceOf([{ actor: "independent", context: "independent", mechanism: "independent", authority: "independent" }], { author: "a", verifier: "b" }).unseparated).toEqual(["resource is unknown"]);
    expect(independenceOf([all], { author: "a", verifier: "a" }).unseparated).toEqual(["the verifier is the author's own baseline"]);
    expect(independenceOf([all]).unseparated).toEqual(["the author or verifier baseline is unknown"]);
    expect(independenceOf([], { author: "a", verifier: "b" }).separated).toBe(false);
  });
});

describe("accept with findings (E-3)", () => {
  it("covers completed adverse results only, never incompleteness or a mandatory inconclusive check", () => {
    expect(acceptWithFindingsBlockers([{ ...base, outcome: "fail" }])).toEqual([]);
    expect(acceptWithFindingsBlockers([{ ...base, completeness: "missing" }, { ...base, criterion_id: "AC-2", outcome: "inconclusive" },
      { ...base, criterion_id: "AC-3", evidence_retained: false }])).toEqual([
      "AC-1: a result is missing", "AC-2: a mandatory check was inconclusive", "AC-3: its evidence is not retained",
    ]);
  });
});

describe("contract", () => {
  it("validates a derived answer against CriterionReadiness", async () => {
    const { checkSchema } = await import("../src/tenancy.js");
    expect(() => checkSchema("CriterionReadiness.json", answer({ ...base, outcome: "fail" }))).not.toThrow();
  });
});
