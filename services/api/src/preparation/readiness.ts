import { digest } from "../kernel.js";
import type {
  PackageContract,
  PreparationBlocker,
  PreparationSnapshot,
  WorkPackage,
} from "./types.js";

export function packageContract(pkg: WorkPackage): PackageContract {
  const {
    mode,
    objective,
    deliverables,
    exclusions,
    design_inputs,
    assumptions,
    codes_and_standards,
    rigor_mode,
    data_lane,
    methodology,
    verification,
  } = pkg;
  return {
    mode,
    objective,
    deliverables,
    ...(exclusions ? { exclusions } : {}),
    design_inputs,
    ...(assumptions ? { assumptions } : {}),
    ...(codes_and_standards ? { codes_and_standards } : {}),
    rigor_mode,
    data_lane,
    ...(methodology ? { methodology } : {}),
    verification,
  };
}

export function preparationSubjects(s: PreparationSnapshot) {
  const { implementation_notes: _notes, ...context } = s.context;
  return {
    content_digest: { algorithm: "sha256" as const, value: digest(s) },
    requirements_digest: {
      algorithm: "sha256" as const,
      value: digest({
        package_id: s.package_id,
        package_revision: s.package_revision,
        request_kind: s.request_kind,
        package_contract: s.package_contract,
        context,
        requirements: s.requirements,
        criteria: s.criteria,
        questions: s.questions,
        resolutions: s.resolutions,
        escalations: s.escalations,
        basis: s.basis,
      }),
    },
  };
}

/** Structural checks only: neither authorization nor executed verification. */
export function preparationReadiness(
  s: PreparationSnapshot,
  pkg: WorkPackage,
  confirmed: boolean,
): PreparationBlocker[] {
  const blockers: PreparationBlocker[] = [];
  const add = (code: string, message: string, owner = "owner") =>
    blockers.push({ code, message, owner });
  const nonempty = (v: string | undefined) => Boolean(v?.trim());
  if (!confirmed)
    add(
      "requirements-unconfirmed",
      "Confirm the current requirements with a passkey after confirmation is enabled.",
    );
  if (s.package_id !== pkg.id || s.package_revision !== pkg.revision)
    add("package-revision", "Preparation belongs to another package revision.");
  if (digest(s.package_contract) !== digest(packageContract(pkg)))
    add(
      "contract-diverged",
      "Update the package and preparation contract together.",
    );
  if (
    digest(s.criteria.map((c) => c.statement)) !==
    digest(pkg.acceptance_criteria)
  )
    add(
      "criteria-diverged",
      "Acceptance criteria must match the package in order and text.",
    );
  if (!nonempty(s.context.problem))
    add("problem-missing", "Describe the problem or need.");
  if (
    s.request_kind === "bugfix" &&
    [
      s.context.repro,
      s.context.expected,
      s.context.actual,
      s.context.environment,
    ].some((v) => !nonempty(v))
  )
    add(
      "bug-context",
      "Provide reproduction, expected/actual behavior and environment.",
    );
  if (
    s.request_kind === "enhancement" &&
    [s.context.current_journey, s.context.desired_journey].some(
      (v) => !nonempty(v),
    )
  )
    add("journey-context", "Describe the current and desired journey.");
  const groups = [
    s.requirements,
    s.criteria,
    s.questions,
    s.resolutions,
    s.escalations,
    s.technical_plan.design_elements,
    s.technical_plan.tasks,
    s.technical_plan.checks,
  ];
  // IDs are globally unique within one snapshot, avoiding ambiguous resolution/task references.
  const all = groups.flat();
  const ids = all.map((v) => v.id);
  if (new Set(ids).size !== ids.length)
    add(
      "duplicate-id",
      "Every preparation item must have a distinct stable ID.",
    );
  const req = new Set(s.requirements.map((v) => v.id)),
    criteria = new Set(s.criteria.map((v) => v.id));
  const checks = new Map(s.technical_plan.checks.map((v) => [v.id, v]));
  const basis = new Set(s.basis.map((v) => v.reference));
  if (basis.size !== s.basis.length)
    add(
      "duplicate-source",
      "Each controlled source reference must be unambiguous.",
    );
  function sources(refs: string[], description: string) {
    for (const ref of refs)
      if (!basis.has(ref))
        add(
          "unknown-source",
          `${description}: unknown controlled source ${ref}.`,
        );
  }
  if (!s.requirements.length)
    add("requirements-missing", "Record at least one requirement.");
  if (!s.criteria.length)
    add("criteria-missing", "Record at least one criterion.");
  for (const r of s.requirements) {
    if (!nonempty(r.statement) || !r.source_refs.length)
      add("requirement-incomplete", `${r.id}: state the need and its source.`);
    sources(r.source_refs, r.id);
    const contextKeys = new Set(
      Object.keys(s.context).map((k) => `context.${k}`),
    );
    if (
      r.journey_or_repro_refs.some(
        (ref) => !contextKeys.has(ref) && !basis.has(ref),
      )
    )
      add(
        "unknown-context",
        `${r.id}: unknown journey or reproduction reference.`,
      );
    if (!s.criteria.some((c) => c.requirement_ids.includes(r.id)))
      add("requirement-uncovered", `${r.id}: map an acceptance criterion.`);
  }
  for (const c of s.criteria) {
    if (!nonempty(c.statement) || !c.requirement_ids.length)
      add(
        "criterion-incomplete",
        `${c.id}: describe acceptance and map its requirements.`,
      );
    if (c.requirement_ids.some((id) => !req.has(id)))
      add(
        "unknown-requirement",
        `${c.id}: criterion references an unknown requirement.`,
      );
    if (
      !c.verification_check_ids.length ||
      c.verification_check_ids.some(
        (id) => !checks.get(id)?.criterion_ids.includes(c.id),
      )
    )
      add(
        "check-coverage",
        `${c.id}: map at least one reciprocal verification check.`,
      );
  }
  const itemIds = new Set([...s.questions, ...s.escalations].map((v) => v.id));
  for (const r of s.resolutions) {
    if (
      r.actor.kind !== "human" ||
      !nonempty(r.actor.id) ||
      !nonempty(r.rationale) ||
      !itemIds.has(r.item_id)
    )
      add(
        "resolution-invalid",
        `${r.id}: resolution needs a human actor, rationale and current item.`,
      );
    sources(r.source_refs, r.id);
  }
  for (const item of [...s.questions, ...s.escalations]) {
    const resolved =
      item.resolution_refs.length > 0 &&
      item.resolution_refs.every((ref) =>
        s.resolutions.some(
          (r) =>
            r.id === ref && r.item_id === item.id && r.actor.kind === "human",
        ),
      );
    if (item.resolution_refs.length && !resolved)
      add(
        "resolution-missing",
        `${item.id}: recorded human resolution is missing.`,
        item.owner,
      );
    if ("blocking" in item) {
      if (item.state === "resolved" && !resolved)
        add(
          "resolution-missing",
          `${item.id}: resolve through the human resolution action.`,
          item.owner,
        );
      if (item.blocking && (item.state !== "resolved" || !resolved))
        add("open-item", `${item.id}: ${item.text}`, item.owner);
    } else {
      if (!resolved)
        add("escalation", `${item.id}: ${item.reason}`, item.owner);
      if (
        !item.criterion_ids.length ||
        item.criterion_ids.some((id) => !criteria.has(id))
      )
        add(
          "escalation-criterion",
          `${item.id}: map current criteria.`,
          item.owner,
        );
    }
    if (!nonempty(item.owner))
      add("owner-missing", `${item.id}: assign a resolution owner.`);
  }
  for (const b of s.basis) {
    if (!nonempty(b.reference) || !nonempty(b.revision))
      add("basis-incomplete", "Pin source reference and revision.");
    if (
      b.kind === "repository" &&
      (!/^[0-9a-f]{40,64}$/.test(b.commit ?? "") ||
        !b.path ||
        b.path.startsWith("/") ||
        b.path.split(/[\\/]/).includes("..") ||
        b.path.includes("\\") ||
        /^[A-Za-z]:/.test(b.path))
    )
      add(
        "repository-basis",
        `${b.reference}: pin a commit and safe relative path.`,
      );
    if (
      b.line_end !== undefined &&
      (b.line_start === undefined || b.line_end < b.line_start)
    )
      add("source-lines", `${b.reference}: invalid source line range.`);
  }
  const plan = s.technical_plan;
  if (
    !nonempty(plan.summary) ||
    !nonempty(plan.rollout) ||
    !plan.design_elements.length ||
    !plan.tasks.length ||
    !plan.checks.length ||
    !plan.current_state_refs.length ||
    !plan.alternatives.some(nonempty) ||
    !plan.risks.some(nonempty)
  )
    add(
      "technical-plan",
      "Complete the method, design, tasks, checks, alternatives, rollout and risks.",
    );
  sources(plan.current_state_refs, "Technical plan");
  const designs = new Set(plan.design_elements.map((d) => d.id));
  const tasks = new Map(plan.tasks.map((t) => [t.id, t]));
  const visit = (id: string, path: Set<string>): boolean => {
    if (path.has(id)) return false;
    const next = new Set(path);
    next.add(id);
    return (tasks.get(id)?.depends_on ?? []).every(
      (dep) => tasks.has(dep) && visit(dep, next),
    );
  };
  for (const t of plan.tasks)
    if (
      !nonempty(t.description) ||
      !t.design_element_ids.length ||
      t.design_element_ids.some((id) => !designs.has(id)) ||
      !visit(t.id, new Set())
    )
      add(
        "task-mapping",
        `${t.id}: fix missing design references or cyclic/unknown dependencies.`,
      );
  for (const c of checks.values())
    if (
      !nonempty(c.method) ||
      !nonempty(c.expected_result) ||
      !c.criterion_ids.length ||
      c.criterion_ids.some(
        (id) =>
          !criteria.has(id) ||
          !s.criteria
            .find((v) => v.id === id)
            ?.verification_check_ids.includes(c.id),
      )
    )
      add(
        "check-coverage",
        `${c.id}: describe its method/expected result and reciprocal criteria.`,
      );
  return blockers;
}
