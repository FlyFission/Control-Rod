import type { Db, Tx } from "./db/index.js";
import { Refusal } from "./refusal.js";
import {
  type SignerGrade, type SignerQualification, type SignerRole, DEFAULT_HARDWARE_FORMATS, currentCredential, currentPolicySet, currentQualification, hardwareFloor, memberIdFor,
} from "./tenancy.js";

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
export type SignerAction = "release" | "accept" | "accept-with-findings" | "return" | "reject" | "override-independence" | "verify" | "confirm";

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
  // Confirming requirements is the requester's act, or an approver's on their behalf.
  confirm: ["originator", ...APPROVERS],
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

/**
 * Serializes a signed act with administration (suspension, removal, credential revocation,
 * qualification and policy changes) and confirms the signing passkey is still the person's own and
 * not revoked. Call it first in the writer transaction; authority checks after it see a settled state.
 */
export async function lockSigner(q: Tx, userName: string, credentialId: string): Promise<void> {
  const m = await q.query<{ id: string; org_id: string }>("select id, org_id from members where user_name = $1", [userName]);
  if (!m.rows[0]) throw new Refusal(403, "not-a-member", "This passkey belongs to no member");
  await q.query("select pg_advisory_xact_lock(hashtext('controlrod-admin:' || $1))", [m.rows[0].org_id]);
  const cred = await currentCredential(q, credentialId);
  if (!cred || cred.revoked || cred.member_id !== m.rows[0].id) throw new Refusal(403, "signature-revoked", "The passkey that signed this is no longer valid");
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

/**
 * The hardware key floor verdict for a credential under the policy in effect now. A policy change
 * that drops a format takes effect at once; one that adds a format admits a credential whose chain
 * verified at registration. Records made before `attestation_verified` was kept can only lose
 * eligibility, never gain it.
 */
export async function currentFloor(q: Db | Tx, credentialId: string): Promise<{ eligible: boolean; reason: string }> {
  const cred = await currentCredential(q, credentialId);
  if (!cred) return { eligible: false, reason: "no credential record" };
  if (cred.revoked) return { eligible: false, reason: "credential revoked" };
  const listed = (await currentPolicySet(q, cred.org_id))?.record.hardware_attestation_formats ?? DEFAULT_HARDWARE_FORMATS;
  const now = hardwareFloor({ format: cred.attestation_format, attestationVerified: cred.attestation_verified ?? cred.hardware_floor.eligible,
    backupEligible: cred.backup_eligible, listedFormats: listed });
  if (cred.attestation_verified === undefined && !cred.hardware_floor.eligible) return cred.hardware_floor;
  return now;
}

/** Refuses a high consequence signature made with a credential the hardware key floor does not admit. */
export async function requireHardwareKey(q: Db | Tx, credentialId: string, needs: SubjectNeeds): Promise<void> {
  if (!highConsequence(needs)) return;
  const floor = await currentFloor(q, credentialId);
  if (!floor.eligible)
    throw new Refusal(403, "hardware-key-required",
      `${GRADE_WORDS[needs.grade!]} work must be signed with an attested hardware key; this passkey is not one (${floor.reason})`);
}

/** Whether the person holds any credential the hardware key floor admits under the current policy. */
export async function holdsHardwareKey(q: Db | Tx, userName: string): Promise<boolean> {
  const r = await q.query<{ credential_id: string }>(
    "select distinct credential_id from authenticator_credentials where member_id = $1", [memberIdFor(userName)]);
  for (const { credential_id } of r.rows) if ((await currentFloor(q, credential_id)).eligible) return true;
  return false;
}
