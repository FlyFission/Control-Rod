import type { Db, Tx } from "./db/index.js";
import { Refusal } from "./refusal.js";
import { type SignerGrade, type SignerQualification, type SignerRole, currentCredential, currentQualification, memberIdFor } from "./tenancy.js";

/**
 * Signing authority (workbench specification 11.1 G-4; plan task 1.14). A sign or verify control is
 * live only when the Member's current SignerQualification covers what the subject needs: a role able
 * to make that decision, the package's grade and, for Safety and Material work, its discipline;
 * Safety work also needs a current professional license. The refusal names what is missing.
 *
 * These checks run in the command layer. Moving them into the kernel (`evaluate_authority`) is a
 * protected change (plan task 1.14, Phase 6).
 */

/** Signer actions this module governs: the package decisions, the independence override and person verification. */
export type SignerAction = "release" | "accept" | "accept-with-findings" | "return" | "reject" | "override-independence" | "verify";

const APPROVERS: SignerRole[] = ["approver", "engineer-in-responsible-charge"];
const REVIEWERS: SignerRole[] = ["checker", ...APPROVERS];

/** The roles, any one of which may take each action. */
export const ACTION_ROLES: Record<SignerAction, SignerRole[]> = {
  release: APPROVERS,
  accept: APPROVERS,
  "accept-with-findings": APPROVERS,
  // Sending work back needs a reviewer, not an approver: incomplete work can always be returned.
  return: REVIEWERS,
  reject: REVIEWERS,
  "override-independence": APPROVERS,
  // A person verification is a checker's act (specification 11.5).
  verify: REVIEWERS,
};

const ROLE_WORDS: Record<SignerRole, string> = {
  originator: "originator",
  checker: "checker",
  approver: "approver",
  "discipline-lead": "discipline lead",
  "engineer-in-responsible-charge": "engineer in responsible charge",
};
const GRADE_WORDS: Record<SignerGrade, string> = { safety: "Safety", material: "Material", "general-service": "General service" };

/** What a package asks of its signers. */
export interface SubjectNeeds { grade?: SignerGrade | undefined; discipline?: string | undefined }

const list = (words: string[], joiner: string) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} ${joiner} ${words.at(-1)}`);
const or = (words: string[]) => list(words, "or");
const and = (words: string[]) => list(words, "and");

/** Each missing qualification for a qualification and action, in words. Empty when covered. */
export function gapsIn(q: SignerQualification | null, action: SignerAction, needs: SubjectNeeds, today = new Date()): string[] {
  if (!q) return ["a signer qualification"];
  const gaps: string[] = [];
  const roles = ACTION_ROLES[action];
  if (!roles.some((r) => q.roles.includes(r))) gaps.push(`the ${or(roles.map((r) => ROLE_WORDS[r]))} role`);
  const grade = needs.grade ?? "general-service";
  if (!q.grades.includes(grade)) gaps.push(`the ${GRADE_WORDS[grade]} grade`);
  if (grade !== "general-service" && needs.discipline && !q.disciplines.includes(needs.discipline)) gaps.push(`the ${needs.discipline} discipline`);
  if (grade === "safety") {
    const day = today.toISOString().slice(0, 10);
    const current = q.licenses.some((l) => l.expires_on >= day && (!l.discipline || !needs.discipline || l.discipline === needs.discipline));
    if (!current) gaps.push(`a current professional license${needs.discipline ? ` for ${needs.discipline}` : ""}`);
  }
  return gaps;
}

/** The gaps for a person by session user name, including an inactive or missing membership. */
export async function signingGaps(q: Db | Tx, userName: string, action: SignerAction, needs: SubjectNeeds): Promise<string[]> {
  const id = memberIdFor(userName);
  const m = await q.query<{ status: string }>("select body->>'status' as status from members where id = $1", [id]);
  if (!m.rows[0]) return ["membership in this organization"];
  if (m.rows[0].status !== "active") return ["an active membership"];
  return gapsIn(await currentQualification(q, id), action, needs);
}

/** What a package body asks of signers. */
export function needsOf(body: { grade?: unknown; discipline?: unknown }): SubjectNeeds {
  const grade = body.grade === "safety" || body.grade === "material" || body.grade === "general-service" ? body.grade : undefined;
  return { grade, discipline: typeof body.discipline === "string" ? body.discipline : undefined };
}

/** Refuses, naming every missing qualification, unless the person may take this action on the subject. */
export async function requireAuthority(q: Db | Tx, userName: string, action: SignerAction, needs: SubjectNeeds): Promise<void> {
  const gaps = await signingGaps(q, userName, action, needs);
  if (gaps.length) throw new Refusal(403, "qualification-missing", `This needs ${and(gaps)}, which your qualification does not include`);
}

/**
 * High consequence work (specification 11.1 G-5, 11.2): Safety and Material grades. Their decisions
 * must be signed with a credential the hardware key floor admits.
 */
export const highConsequence = (needs: SubjectNeeds) => needs.grade === "safety" || needs.grade === "material";

/** Refuses a high consequence signature made with a credential the hardware key floor does not admit. */
export async function requireHardwareKey(q: Db | Tx, credentialId: string, needs: SubjectNeeds): Promise<void> {
  if (!highConsequence(needs)) return;
  const cred = await currentCredential(q, credentialId);
  if (!cred?.hardware_floor.eligible)
    throw new Refusal(403, "hardware-key-required",
      `${GRADE_WORDS[needs.grade!]} work must be signed with an attested hardware key; this passkey is not one (${cred?.hardware_floor.reason ?? "no credential record"})`);
}

/** Whether the person holds any live credential the hardware key floor admits. */
export async function holdsHardwareKey(q: Db | Tx, userName: string): Promise<boolean> {
  const r = await q.query(
    `select 1 from authenticator_credentials a
      where a.member_id = $1 and a.version = (select max(version) from authenticator_credentials b where b.id = a.id)
        and (a.body->'hardware_floor'->>'eligible')::boolean and coalesce((a.body->>'revoked')::boolean, false) = false limit 1`,
    [memberIdFor(userName)]);
  return Boolean(r.rowCount);
}
