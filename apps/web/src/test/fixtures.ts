import type { PackageView, WorkPackage } from "../api/types.js";

export function pkg(over: Partial<WorkPackage> = {}): WorkPackage {
  return {
    schema_version: "0.1.0",
    id: "WP-0001",
    revision: 0,
    title: "Site concept package, Parcel 12",
    project: "general",
    mode: "capital-projects",
    status: "draft",
    rigor_mode: "quick",
    data_lane: "internal",
    objective: "Site a 50 MW data center on the parcel.",
    deliverables: [{ id: "D1", type: "concept site plan", format: ["pdf"] }],
    design_inputs: [],
    agent_assignment: [{ role: "author", agent_baseline: "site-author", baseline_revision: 1 }],
    acceptance_criteria: ["Every facility block sits inside the buildable area."],
    verification: {
      method: "agent-pre-check",
      verifier: "site-checker",
      verifier_receives: ["deliverable", "acceptance criteria"],
      required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
    },
    ...over,
  };
}

export const DIGEST = { algorithm: "sha256" as const, value: "ab12cd34ef56".padEnd(64, "0") };

export function view(over: Partial<PackageView> = {}, p: Partial<WorkPackage> = {}): PackageView {
  return { package: pkg(p), runs: [], outputs: [], decisions: [], subject_digest: DIGEST, ...over };
}
