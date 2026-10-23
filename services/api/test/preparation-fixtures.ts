// Literal fixture: generated types ensure the fixture follows the TypeSpec contract.
import type {
  PreparationSnapshot,
  WorkPackage,
} from "../src/preparation/types.js";
export function packageFixture(): WorkPackage {
  return {
    schema_version: "0.1.0",
    id: "WP-prep",
    revision: 0,
    title: "Controlled report",
    project: "test",
    mode: "general",
    status: "draft",
    rigor_mode: "standard",
    data_lane: "internal",
    objective: "Produce a report",
    deliverables: [{ id: "D1", type: "report", format: ["md"] }],
    design_inputs: [],
    agent_assignment: [
      {
        role: "general-author",
        agent_baseline: "author",
        baseline_revision: 0,
      },
    ],
    acceptance_criteria: ["The report exists"],
    verification: {
      method: "agent-pre-check",
      verifier: "checker",
      verifier_receives: ["deliverables"],
      required_custody: {
        decisive_evidence_generated_by: "verifier",
        preparer_may_present: false,
      },
    },
  };
}
export function preparationFixture(): PreparationSnapshot {
  const p = packageFixture();
  return {
    schema_version: "0.1.0",
    id: "P-test",
    package_id: p.id,
    package_revision: 0,
    revision: 0,
    request_kind: "general",
    package_contract: {
      mode: p.mode,
      objective: p.objective,
      deliverables: p.deliverables,
      design_inputs: p.design_inputs,
      rigor_mode: p.rigor_mode,
      data_lane: p.data_lane,
      verification: p.verification,
    },
    requirements: [
      {
        id: "R1",
        statement: "Need a report",
        source_refs: ["capture:test"],
        journey_or_repro_refs: [],
      },
    ],
    criteria: [
      {
        id: "C1",
        requirement_ids: ["R1"],
        statement: p.acceptance_criteria[0]!,
        verification_check_ids: ["V1"],
      },
    ],
    context: { problem: "Need a controlled report" },
    questions: [],
    resolutions: [],
    escalations: [],
    technical_plan: {
      summary: "Write then independently check the report",
      current_state_refs: ["capture:test"],
      design_elements: [{ id: "D1", description: "Report" }],
      alternatives: ["Manual report"],
      tasks: [
        {
          id: "T1",
          description: "Write report",
          design_element_ids: ["D1"],
          depends_on: [],
        },
      ],
      checks: [
        {
          id: "V1",
          criterion_ids: ["C1"],
          method: "independent-review",
          required: true,
          expected_result: "Report exists",
        },
      ],
      rollout: "Owner reviews",
      risks: ["Missing inputs hold"],
    },
    basis: [
      {
        kind: "capture",
        reference: "capture:test",
        revision: "0",
        digest: { algorithm: "sha256", value: "0".repeat(64) },
      },
    ],
    created_by: { kind: "human", id: "owner" },
    created_at: "2026-10-23T00:00:00Z",
  };
}
