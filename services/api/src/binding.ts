/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

export const short = (d: string) => `sha256:${d.slice(0, 12)}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The sentence a signer reads before signing (specification 14 Sign; AttentionItem): what the digest
 * covers, in words, including the preparation basis and criterion evidence when the subject has them.
 * The Inbox and the package page show this same sentence.
 */
/** "a", "a and b", "a, b and c". */
const list = (parts: string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`);

export function bindingSentence(kind: string, pkg: Json, revision: number, outputs: number, preCheck: Json | null, digest: string,
  scope: { preparation?: boolean; criterionResults?: boolean } = {}): string {
  const prepared = scope.preparation ? ["its confirmed requirements and preparation basis"] : [];
  if (kind === "release")
    // Worded for any decision on a draft (release or reject): what the signature binds, not the act.
    return `Signing binds revision ${revision} of ${pkg.id} as drafted: ${list([
      plural(pkg.acceptance_criteria?.length ?? 0, "acceptance criterion", "acceptance criteria"),
      plural(pkg.deliverables?.length ?? 0, "deliverable"),
      ...prepared,
    ])} (${short(digest)}).`;
  const check = preCheck === null ? "no pre-check" : `its pre-check (${preCheck.outcome}, ${plural(preCheck.findings?.length ?? 0, "finding")})`;
  return `Signing binds revision ${revision} of ${pkg.id}: ${list([
    ...prepared,
    plural(outputs, "output"),
    check,
    ...(scope.criterionResults ? ["the checker's criterion results and their evidence"] : []),
  ])} (${short(digest)}).`;
}
