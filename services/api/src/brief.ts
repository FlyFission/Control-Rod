/**
 * The author and pre-check brief (BRIEF.md) as buildJob assembles it, kept pure and free of
 * relative imports so scripts/measure-briefs.mjs composes exactly the same text from disk.
 */

/** The rules every brief ends with. */
export const RULES = `## Rules

- Read every file under inputs/. Write every deliverable into out/. Never edit inputs/.
- Every engineering number comes from a tool or code you run, never typed from memory.
- Cite every outside fact with its source and the date you retrieved it.
- You cannot approve, accept or release anything. A person does that.
`;

export function briefHeader(run: { role: string; package_id: string; package_revision: number | string; round: number | string }): string {
  return `# Control Rod brief\n\nRole: ${run.role} · Package ${run.package_id} revision ${run.package_revision} · Round ${run.round}\n`;
}

const PRO_STAGE_SKILLS: Record<"intake" | "author" | "pre-check", readonly string[]> = {
  intake: [
    "- `questioning-attitude`: challenge vague assumptions, surface missing facts, and name the one fact that would change the decision before planning continues.",
    "- `using-nuclear-grade`: state the Nuclear-Grade workflow mode, packet path, and verification obligations up front.",
    "- `classifying-change-risk`: classify consequence, reversibility, and unknowns to set Quick, Standard, or stronger human-reviewed rigor.",
    "- `identifying-controlled-items`: identify every controlled configuration item, interface, and trust boundary affected by the request.",
    "- `screening-change-impact`: check downstream dependents, cross-boundary effects, and revalidation triggers.",
    "- `creating-change-packets`: structure the change packet fields, acceptance criteria, and stop conditions cleanly.",
    "- `packing-agent-context`: pack focused, bounded inputs and references for downstream author and verifier runs.",
  ],
  author: [
    "- `self-checking-agent-actions`: verify exact target, expected result, and stop condition before and after critical edits, commands, or boundary-sensitive actions.",
    "- `turning-over-agent-work`: leave a clean, explicit handoff of completed edits, open items, verification state, and exact outputs for the verifier.",
    "- `controlling-mission-drift`: stay anchored to the packet scope and acceptance criteria; re-anchor, escalate, or stop if scope drifts or rigor erodes.",
  ],
  "pre-check": [
    "- `proving-claims`: map every acceptance criterion and deliverable claim to independent evidence rows, tests, logs, and open gaps.",
    "- `reviewing-code-quality`: inspect the diff or deliverable for standards drift, needless complexity, and missing edge-case guards.",
    "- `red-teaming-agent-changes`: adversarially probe tool grants, trust boundaries, dependencies, models, and inputs for misuse or escalation.",
    "- `tracing-agent-execution`: verify captured execution traces, tool calls, inputs, outputs, and approval gates as auditable evidence.",
    "- `checking-dependency-and-model-trust`: verify dependency, model, API, generated artifact, and vendor trust assumptions.",
    "- `checking-source-lineage`: check citations and source-family claims for accurate, source-safe wording.",
    "- `checking-license-and-assurance-boundaries`: check license and assurance language so no boundary or claim overreaches.",
    "- `reviewing-ship-readiness`: ground findings and verdict in evidence completeness, residual risk, rollback readiness, and human release gates.",
    "- `baselining-configuration`: verify controlled configuration item boundaries, exact digests/versions, and baseline integrity with no unauthorized trust-surface edits.",
    "- `learning-from-opex`: flag near misses, bad handoffs, review surprises, or safeguard gaps for durable OPEX follow-up.",
  ],
};

function normalizeProRole(role: string | undefined, header: string): "intake" | "author" | "pre-check" {
  const raw = (role ?? header.match(/^Role:\s*([^\s·]+)/m)?.[1] ?? "author").trim().toLowerCase();
  if (raw === "intake") return "intake";
  if (raw === "pre-check" || raw === "checker") return "pre-check";
  return "author";
}

/** Concise PRO (Plan · Run · Operate) stage skill guidance for Nuclear-Grade runs. */
export function nuclearProStageSkillsSection(role?: string): string {
  const key = normalizeProRole(role, "");
  return `## Nuclear-Grade PRO Stage Skills\n\nFollow the PRO (Plan · Run · Operate) operating method for this \`${key}\` run:\n${PRO_STAGE_SKILLS[key].join("\n")}\n`;
}

/**
 * BRIEF.md for an author or pre-check run: header, role text, the package line, any extra
 * sections (findings, owner direction, prepared-run notes), the Nuclear sections (none under
 * Light), optional Nuclear-Grade PRO stage skills, then the rules.
 */
export function composeBrief(parts: {
  header: string;
  roleText: string;
  objective: unknown;
  extra?: string[];
  nuclear?: string[];
  mode?: string;
  contextProfile?: string;
  context_profile?: string;
  role?: string;
}): string {
  const isNuclear =
    parts.mode === "nuclear-grade" ||
    parts.contextProfile === "nuclear" ||
    parts.context_profile === "nuclear";
  const proSkills = isNuclear ? [nuclearProStageSkillsSection(normalizeProRole(parts.role, parts.header))] : [];
  return [
    parts.header,
    parts.roleText,
    `## The work package\n\nSee inputs/PACKAGE.json. Objective: ${parts.objective}\n`,
    ...(parts.extra ?? []),
    ...(parts.nuclear ?? []),
    ...proSkills,
    RULES,
  ].join("\n");
}
