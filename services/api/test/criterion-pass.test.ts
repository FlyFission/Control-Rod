import { describe, expect, it } from "vitest";
import { blocksPass, criterionResultFlags } from "../src/preparation/results.js";

/**
 * When a check keeps its criterion from passing (guided preparation design: pass only if every
 * required check passes; fail if any fails; open, deferred and inconclusive required outcomes are
 * never a pass).
 */
type Snapshot = Parameters<typeof blocksPass>[0];
const snapshot = {
  criteria: [{ id: "C1", statement: "Loads", requirement_ids: ["R1"], verification_check_ids: ["K1", "K2"] }],
  technical_plan: {
    checks: [
      { id: "K1", criterion_ids: ["C1"], method: "Test", required: true, expected_result: "Pass" },
      { id: "K2", criterion_ids: ["C1"], method: "Review", required: false, expected_result: "Pass" },
    ],
  },
} as unknown as Snapshot;
const results = (k1: string, k2: string) =>
  ({
    results: [
      {
        criterion_id: "C1",
        outcome: "pass",
        finding_refs: [],
        check_results: [
          { check_id: "K1", outcome: k1, evidence_refs: k1 === "pass" || k1 === "fail" ? ["checker:k1.txt"] : [] },
          { check_id: "K2", outcome: k2, evidence_refs: k2 === "pass" || k2 === "fail" || k2 === "inconclusive" ? ["checker:k2.txt"] : [] },
        ],
      },
    ],
  }) as unknown as Parameters<typeof criterionResultFlags>[1];

describe("criterion pass gating", () => {
  it.each([
    ["required", "K1", "pass", false],
    ["required", "K1", "fail", true],
    ["required", "K1", "inconclusive", true],
    ["required", "K1", "open", true],
    ["required", "K1", "deferred", true],
    ["optional", "K2", "pass", false],
    ["optional", "K2", "fail", true],
    ["optional", "K2", "inconclusive", true],
    ["optional", "K2", "open", false],
    ["optional", "K2", "deferred", false],
    ["unknown, so treated as required", "K9", "open", true],
  ])("a %s check %s reported %s blocks the pass: %s", (_kind, id, outcome, blocks) => {
    expect(blocksPass(snapshot, { check_id: id as string, outcome: outcome as string })).toBe(blocks);
  });

  it("lets a criterion pass with its required check passed and an optional check never run", () => {
    expect(criterionResultFlags(snapshot, results("pass", "open"))).toEqual({ results_complete: true, required_checks_complete: true, results_pass: true });
    expect(criterionResultFlags(snapshot, results("pass", "deferred")).results_pass).toBe(true);
  });

  it("never lets a failed optional check, or an unfinished required one, pass", () => {
    expect(criterionResultFlags(snapshot, results("pass", "fail")).results_pass).toBe(false);
    expect(criterionResultFlags(snapshot, results("open", "pass"))).toMatchObject({ required_checks_complete: false, results_pass: false });
  });
});
