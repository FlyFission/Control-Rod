import type {
  Run,
  WorkPackage,
  PackageView,
  OfficeItem,
} from "../../api/types.js";
/** Deliberately synthetic examples for the standalone design preview. Never live work. */
export function showcaseInput() {
  const packages: WorkPackage[] = [],
    views = new Map<string, PackageView>(),
    office: OfficeItem[] = [];
  const rows: [Run["status"], Run["role"], WorkPackage["status"], boolean][] = [
    ["running", "author", "in-work", false],
    ["running", "author", "in-work", true],
    ["running", "pre-check", "in-verification", false],
    ["queued", "author", "released", false],
    ["failed", "author", "in-work", false],
    ["succeeded", "author", "in-verification", false],
    ["succeeded", "author", "accepted", false],
    ["lost", "author", "in-work", true],
    ["running", "author", "in-work", true],
    ["queued", "author", "released", false],
  ];
  rows.forEach(([status, role, packageStatus, capital], i) => {
    const id = `WP-${101 + i}`;
    const pkg: WorkPackage = {
      schema_version: "0.1.0",
      id,
      revision: 0,
      title: [
        "Navigation design",
        "Landscape brief",
        "Independent review",
        "Documentation",
        "Accessibility review",
        "Interface proposal",
        "Accepted reference",
        "Source review",
        "Implementation",
        "Research",
      ][i]!,
      project: "world-preview",
      mode: capital ? "capital-projects" : "general",
      status: packageStatus,
      rigor_mode: "quick",
      data_lane: "internal",
      objective: "Demonstrate work-state presentation using synthetic records.",
      deliverables: [],
      design_inputs: [],
      agent_assignment: [],
      acceptance_criteria: [],
      verification: {
        method: "agent-pre-check",
        verifier: "independent",
        verifier_receives: [],
        required_custody: {
          decisive_evidence_generated_by: "verifier",
          preparer_may_present: false,
        },
      },
    };
    const run: Run = {
      schema_version: "0.1.0",
      id: `R-${i + 1}`,
      package_id: id,
      package_revision: 0,
      role,
      agent_baseline: "sample-worker",
      runtime: { kind: "local", provider: "demo", model: "sample" },
      round: 1,
      status,
      queued_at: "2026-10-26T12:00:00Z",
      label: pkg.title,
      ...(i === 8 ? { stop_requested_at: "2026-10-26T12:01:00Z" } : {}),
      ...(i === 9 ? { waiting_reason: "Waiting for the source document" } : {}),
    };
    packages.push(pkg);
    views.set(id, {
      package: pkg,
      runs: [run],
      outputs: [],
      decisions: [],
      subject_digest: { algorithm: "sha256", value: "0".repeat(64) },
    });
    if (i === 4 || i === 5 || i === 7)
      office.push({
        kind: i === 4 ? "permission" : i === 5 ? "accept" : "lost",
        package_id: id,
        package_revision: 0,
        title: pkg.title,
        detail:
          i === 4
            ? "A person needs to resolve this request"
            : i === 5
              ? "Ready for human review"
              : "Run requires attention",
        since: "2026-10-26T12:00:00Z",
      });
  });
  return { packages, views, office };
}
