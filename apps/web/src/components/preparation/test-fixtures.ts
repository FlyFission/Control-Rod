import { pkg, DIGEST } from "../../test/fixtures.js";
import type { PreparationView } from "../../api/types.js";
export function preparationViewFixture(): PreparationView {
  const p = pkg();
  return {
    snapshot: {
      schema_version: "0.1.0",
      id: "P1",
      package_id: p.id,
      package_revision: 0,
      revision: 0,
      created_by: { kind: "human", id: "owner" },
      created_at: "2026-10-23T00:00:00Z",
      request_kind: "general",
      package_contract: {
        mode: p.mode,
        objective: p.objective,
        deliverables: p.deliverables,
        design_inputs: [],
        rigor_mode: p.rigor_mode,
        data_lane: p.data_lane,
        verification: p.verification,
      },
      requirements: [
        {
          id: "R1",
          statement: "Need report",
          source_refs: [],
          journey_or_repro_refs: [],
        },
      ],
      criteria: [
        {
          id: "C1",
          statement: p.acceptance_criteria[0]!,
          requirement_ids: ["R1"],
          verification_check_ids: [],
        },
      ],
      context: { problem: "Saved need" },
      questions: [],
      resolutions: [],
      escalations: [],
      basis: [],
      technical_plan: {
        summary: "",
        current_state_refs: [],
        design_elements: [],
        alternatives: [],
        tasks: [],
        checks: [],
        rollout: "",
        risks: [],
      },
    },
    content_digest: DIGEST,
    requirements_digest: DIGEST,
    confirmed: false,
    readiness: "blocked",
    blockers: [
      { code: "open-item", message: "Supply input", owner: "Requester" },
    ],
    change_summary: "Enrolled",
  };
}
