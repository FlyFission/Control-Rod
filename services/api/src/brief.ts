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

/**
 * How to write the prose a person reads, under the Focus writing preference (setup.ts WRITING, the
 * default). Adapted from i-have-adhd by Ayoub Ghriss (MIT, https://github.com/ayghri/i-have-adhd;
 * THIRD_PARTY_NOTICES.md): its ten rules, cut to what an agent on a card writes. It shapes prose only;
 * the role's required files, sections and JSON fields are unchanged.
 */
export const FOCUS_WRITING = `## Write so the person can act at a glance

The person reads your words on a busy board, between other things. This covers everything you write for them: an answer, the opening of the main deliverable, RESPONSE.md, and each finding's text. It shapes how you write, never what you keep: every fact, file, criterion and finding the work needs stays in.

1. Open with the outcome or the next action, not with what you are about to do.
2. Number steps when there is more than one. One action per step; use the fewest that work.
3. If anything is left open, end with one next step the person can take in two minutes.
4. Stay on what was asked. Put a second issue last, on its own line, starting "Separately:".
5. Say where things stand: "2 of 3 criteria met; the third needs a passing test."
6. Show what now works, concretely: what changed and how to see it.
7. State errors plainly: where, what is wrong, the fix. Never "uh oh" or "there seems to be".
8. Keep a visible list to five items, most important first; group the rest under a short heading.
9. Give time only in real units, and only from something you measured or ran.
10. No preamble, recap or sign-off: no "Great question", "I have now", "Hope this helps".

A finding's text reads: file and line, what is wrong, the fix. The sections your role asks for stay where it asks for them.

Before you finish: if someone reads only your first and last line, do they know what happened and what to do next?
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
 * sections (findings, owner direction, prepared-run notes), the workflow sections (none under the
 * playbook), the Nuclear sections (none under Light), optional Nuclear-Grade PRO stage skills, the
 * Focus writing section (left out only under the Standard preference), then the rules.
 */
export function composeBrief(parts: {
  header: string;
  roleText: string;
  objective: unknown;
  extra?: string[];
  workflow?: string[];
  nuclear?: string[];
  mode?: string;
  contextProfile?: string;
  context_profile?: string;
  role?: string;
  /** The person's writing preference; Focus (the default) adds FOCUS_WRITING. */
  writing?: "focus" | "standard";
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
    ...(parts.workflow ?? []),
    ...(parts.nuclear ?? []),
    ...proSkills,
    ...(parts.writing === "standard" ? [] : [FOCUS_WRITING]),
    RULES,
  ].join("\n");
}
