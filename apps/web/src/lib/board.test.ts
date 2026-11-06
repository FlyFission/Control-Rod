import { describe, expect, it } from "vitest";
import type { OfficeItem, PersonVerificationEntry } from "../api/types.js";
import { pkg } from "../test/fixtures.js";
import { COLUMNS, boardColumn, groupBoard, needsIndependentCheck } from "./board.js";

describe("boardColumn with person verification", () => {
  it("puts Safety work with a passed pre-check and no verification in Person verifies", () => {
    expect(boardColumn(pkg({ status: "in-verification", grade: "safety" }), "passed", false)).toBe("person-verifies");
  });
  it("puts Material work the same way", () => {
    expect(boardColumn(pkg({ status: "in-verification", grade: "material" }), "passed", false)).toBe("person-verifies");
  });
  it("sends General service work with a passed pre-check straight to Needs signature", () => {
    expect(boardColumn(pkg({ status: "in-verification", grade: "general-service" }), "passed", false)).toBe("needs-signature");
    expect(boardColumn(pkg({ status: "in-verification" }), "passed", false)).toBe("needs-signature");
  });
  it("moves Safety work to Needs signature once verified", () => {
    expect(boardColumn(pkg({ status: "in-verification", grade: "safety" }), "passed", true)).toBe("needs-signature");
  });
  it("keeps a disputed pre-check in Agent check", () => {
    expect(boardColumn(pkg({ status: "in-verification" }), "disputed", false)).toBe("agent-check");
    expect(boardColumn(pkg({ status: "in-verification", grade: "safety" }), "disputed", false)).toBe("agent-check");
  });
  it("keeps today's mapping when verifications are unknown", () => {
    expect(boardColumn(pkg({ status: "in-verification", grade: "safety" }), "passed", null)).toBe("needs-signature");
  });
  it("grades Safety and Material as needing an independent check", () => {
    expect(needsIndependentCheck(pkg({ grade: "safety" }))).toBe(true);
    expect(needsIndependentCheck(pkg({ grade: "material" }))).toBe(true);
    expect(needsIndependentCheck(pkg({ grade: "general-service" }))).toBe(false);
    expect(needsIndependentCheck(pkg())).toBe(false);
  });
  it("titles the last column Accepted", () => {
    expect(COLUMNS.map((c) => c.title)).toEqual(["Ready", "Drafting", "Agent check", "Person verifies", "Needs signature", "Accepted"]);
  });
});

describe("groupBoard with person verifications", () => {
  const accept = (id: string, rev: number): OfficeItem => ({ kind: "accept", package_id: id, package_revision: rev, title: "t", detail: "d", since: "2026-10-22T10:00:00Z" });
  const dispute = (id: string, rev: number): OfficeItem => ({ ...accept(id, rev), kind: "dispute" });
  const ver = (rev: number, outcome: PersonVerificationEntry["outcome"]) => ({ package_revision: rev, outcome }) as PersonVerificationEntry;

  it("uses the current revision's passing verification only", () => {
    const a = pkg({ id: "A", status: "in-verification", grade: "safety", revision: 2 });
    const b = pkg({ id: "B", status: "in-verification", grade: "safety", revision: 2 });
    const c = pkg({ id: "C", status: "in-verification", grade: "safety", revision: 2 });
    const g = groupBoard([a, b, c], [accept("A", 2), accept("B", 2), accept("C", 2)], {
      A: [ver(2, "pass")],
      B: [ver(1, "pass"), ver(2, "fail")],
      C: [],
    });
    expect(g["needs-signature"].map((p) => p.id)).toEqual(["A"]);
    expect(g["person-verifies"].map((p) => p.id)).toEqual(["B", "C"]);
  });
  it("reads a dispute as Agent check", () => {
    const a = pkg({ id: "A", status: "in-verification", revision: 1 });
    expect(groupBoard([a], [dispute("A", 1)])["agent-check"].map((p) => p.id)).toEqual(["A"]);
  });
});
