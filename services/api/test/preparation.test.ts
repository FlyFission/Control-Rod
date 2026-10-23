import { describe, expect, it } from "vitest";
import { loadValidator } from "../src/schemas.js";
import { preparationReadiness, preparationSubjects } from "../src/preparation/readiness.js";
import { preparationFixture, packageFixture } from "./preparation-fixtures.js";

const codes = (s = preparationFixture(), pkg = packageFixture(), confirmed = true) =>
  preparationReadiness(s, pkg, confirmed).map(b => b.code);

describe("preparation contracts and structural readiness", () => {
  it("validates a complete companion, preserves the existing package schema", () => {
    const ajv = loadValidator();
    expect(ajv.validate("PreparationSnapshot.json", preparationFixture()), JSON.stringify(ajv.errors)).toBe(true);
    expect(ajv.validate("WorkPackage.json", packageFixture()), JSON.stringify(ajv.errors)).toBe(true);
    expect(codes()).toEqual([]);
  });
  it("blocks orphan criteria, duplicate IDs and unmapped checks", () => {
    const s = preparationFixture(); s.criteria[0]!.requirement_ids = ["unknown"];
    s.requirements.push({ ...s.requirements[0]! }); s.technical_plan.checks[0]!.criterion_ids = [];
    expect(codes(s)).toEqual(expect.arrayContaining(["duplicate-id", "unknown-requirement", "check-coverage"]));
  });
  it("blocks incomplete bug context, criteria divergence and unconfirmed requirements", () => {
    const s = preparationFixture(); s.request_kind = "bugfix"; s.criteria[0]!.statement = "different";
    expect(codes(s, packageFixture(), false)).toEqual(expect.arrayContaining(["bug-context", "criteria-diverged", "requirements-unconfirmed"]));
  });
  it("holds human-owned blockers and unresolved escalations", () => {
    const s = preparationFixture(); s.questions.push({ id:"Q1", kind:"question", text:"Which input?", owner:"owner", blocking:true, state:"open", resolution_refs:[] });
    s.escalations.push({ id:"E1", criterion_ids:["C1"], reason:"infeasible", alternatives:["supply source"], owner:"owner", resolution_refs:[] });
    expect(codes(s)).toEqual(expect.arrayContaining(["open-item", "escalation"]));
  });
  it("refuses resolved items with missing or mismatched human resolution", () => {
    const s = preparationFixture(); s.questions.push({ id:"Q1", kind:"question", text:"Which input?", owner:"owner", blocking:true, state:"resolved", resolution_refs:["missing"] });
    expect(codes(s)).toContain("resolution-missing");
  });
  it("requires source refs and complete repository pins", () => {
    const s = preparationFixture(); s.requirements[0]!.source_refs = ["missing"];
    s.basis[0]!.kind = "repository";
    expect(codes(s)).toEqual(expect.arrayContaining(["unknown-source", "repository-basis"]));
  });
  it("keeps technical edits out of requirements digest and includes controlled context", () => {
    const a = preparationFixture(), b = preparationFixture(); b.technical_plan.summary += " edit"; b.context.implementation_notes = "suggestion";
    expect(preparationSubjects(a).requirements_digest).toEqual(preparationSubjects(b).requirements_digest);
    expect(preparationSubjects(a).content_digest).not.toEqual(preparationSubjects(b).content_digest);
    b.context.problem += " changed";
    expect(preparationSubjects(a).requirements_digest).not.toEqual(preparationSubjects(b).requirements_digest);
  });
});
