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

/**
 * BRIEF.md for an author or pre-check run: header, role text, the package line, any extra
 * sections (findings, owner direction, prepared-run notes), the workflow sections (none under the
 * playbook), the Nuclear sections (none under Light), then the rules.
 */
export function composeBrief(parts: { header: string; roleText: string; objective: unknown; extra?: string[]; workflow?: string[]; nuclear?: string[] }): string {
  return [
    parts.header,
    parts.roleText,
    `## The work package\n\nSee inputs/PACKAGE.json. Objective: ${parts.objective}\n`,
    ...(parts.extra ?? []),
    ...(parts.workflow ?? []),
    ...(parts.nuclear ?? []),
    RULES,
  ].join("\n");
}
