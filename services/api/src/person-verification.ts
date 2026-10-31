import { createHash, randomUUID } from "node:crypto";
import { gapsIn, needsOf, requireHardwareKey } from "./authority.js";
import { command } from "./commands/executor.js";
import type { Db, Tx } from "./db/index.js";
import type { Actor } from "./events.js";
import { digest } from "./kernel.js";
import { preparationForSubject } from "./preparation/release.js";
import { Refusal } from "./refusal.js";
import { currentQualification, memberIdFor } from "./tenancy.js";
import { currentPackage, latestAuthorRun, type PackageRow } from "./work.js";
import { recordObject } from "./workbench.js";

/**
 * Person verification (workbench specification 11.5; plan task 1.13). For Safety and Material work
 * an agent check is a pre-check, never verification: a qualified checker, who is neither an
 * originator of the work nor a runtime, verifies the candidate in person, over every mandatory
 * criterion, signing with a passkey. This command records it. Requiring it before an accept verdict
 * is the kernel guard of plan task 6.8, a protected change; until then the record stands on its own
 * and the case view can show it.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

export type VerificationOutcome = "pass" | "fail" | "inconclusive";

/**
 * The criteria a verification must cover. A prepared package names its criteria; a criterion is
 * mandatory when any check that verifies it is required, or when nothing is planned to verify it.
 * A package without preparation numbers its acceptance criteria AC-1, AC-2 and so on.
 */
export async function mandatoryCriteria(q: Db | Tx, pkg: PackageRow): Promise<{ all: string[]; mandatory: string[] }> {
  const prepared = await preparationForSubject(q, pkg);
  if (prepared) {
    const snap = prepared.snapshot;
    const required = new Set(snap.technical_plan.checks.filter((c) => c.required).map((c) => c.id));
    const all = snap.criteria.map((c) => c.id);
    const mandatory = snap.criteria
      .filter((c) => c.verification_check_ids.length === 0 || c.verification_check_ids.some((id) => required.has(id)))
      .map((c) => c.id);
    return { all, mandatory };
  }
  const all = (pkg.body.acceptance_criteria ?? []).map((_: unknown, i: number) => `AC-${i + 1}`);
  return { all, mandatory: all };
}

/** The people who originated the work: whoever made its capture and whoever edited its drafts. */
export async function originators(q: Db | Tx, pkg: PackageRow): Promise<Set<string>> {
  const r = await q.query<{ id: string }>(
    `select distinct body->'actor'->>'id' as id from events
      where body->'actor'->>'kind' = 'human'
        and ((body->>'type' = 'capture.created' and body->>'subject' = $1) or (body->>'type' = 'package.edited' and body->>'subject' = $2))`,
    [pkg.capture_id ?? "", pkg.id]);
  return new Set(r.rows.map((x) => x.id));
}

/**
 * The single candidate of a package revision released without an attempt set (ordinal 1), recorded
 * the first time a verification needs it. Its release digest is the signed release decision's subject.
 */
async function singleCandidate(c: Tx, pkg: PackageRow, orgId: string, actor: Actor): Promise<string> {
  const id = `cand_${createHash("sha256").update(`${pkg.id}\n${pkg.revision}`).digest("hex").slice(0, 32)}`;
  if ((await c.query("select 1 from candidate_assignments where id = $1", [id])).rowCount) return id;
  const release = await c.query<{ body: Json }>(
    "select body from decisions where package_id = $1 and package_revision = $2 and kind = 'release' order by created_at limit 1", [pkg.id, pkg.revision]);
  if (!release.rows[0]) throw new Refusal(409, "wrong-state", "This revision was never released, so there is nothing to verify");
  const assignment = pkg.body.agent_assignment?.[0];
  await recordObject(c, "candidate_assignment", {
    id, org_id: orgId, package_id: pkg.id, package_revision: pkg.revision, release_digest: release.rows[0].body.subject_digest, ordinal: 1,
    author_assignment: assignment,
  } as never, actor);
  return id;
}

export interface VerificationRequest { package_revision: number; criteria: string[]; outcome: VerificationOutcome }

function checkRequest(body: unknown): VerificationRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const criteria = Array.isArray(b.criteria) ? b.criteria.filter((x): x is string => typeof x === "string") : [];
  if (!Number.isInteger(b.package_revision)) throw new Refusal(400, "invalid", "package_revision is required");
  if (b.outcome !== "pass" && b.outcome !== "fail" && b.outcome !== "inconclusive") throw new Refusal(400, "invalid", "outcome must be pass, fail or inconclusive");
  if (!criteria.length || criteria.length !== (b.criteria as unknown[]).length) throw new Refusal(400, "invalid", "criteria must list the criterion ids verified");
  return { package_revision: b.package_revision as number, criteria: [...new Set(criteria)].sort(), outcome: b.outcome };
}

/**
 * Everything a verification must satisfy before anyone signs: the work is in verification with an
 * author output, the person is a qualified checker for its grade and discipline, is not an
 * originator, and the criteria are known and cover every mandatory one.
 */
async function admissible(q: Db | Tx, user: string, id: string, req: VerificationRequest, lock = false) {
  const pkg = await currentPackage(q, id, lock);
  if (!pkg) throw new Refusal(404, "not-found", "No such package");
  if (pkg.revision !== req.package_revision) throw new Refusal(409, "stale", "That revision is no longer current");
  if (pkg.status !== "in-verification") throw new Refusal(409, "wrong-state", `The package is ${pkg.status}; a person verifies work that is in verification`);
  const author = await latestAuthorRun(q, pkg.id, pkg.revision);
  if (!author || author.status !== "succeeded") throw new Refusal(409, "output-required", "No author deliverable is available to verify");
  const gaps = gapsIn(await currentQualification(q, memberIdFor(user)), "verify", needsOf(pkg.body));
  if (gaps.length) throw new Refusal(403, "qualification-missing", `Verifying this needs ${gaps.join(" and ")}, which your qualification does not include`);
  if ((await originators(q, pkg)).has(user))
    throw new Refusal(403, "verifier-is-originator", "You originated this work, so your verification would not be independent");
  const { all, mandatory } = await mandatoryCriteria(q, pkg);
  const unknown = req.criteria.filter((c) => !all.includes(c));
  if (unknown.length) throw new Refusal(400, "invalid", `This package has no criterion ${unknown.join(", ")}`);
  const missing = mandatory.filter((c) => !req.criteria.includes(c));
  if (missing.length) throw new Refusal(409, "verification-incomplete", `A verification must cover every mandatory criterion; it leaves out ${missing.join(", ")}`);
  return pkg;
}

/** Step 1: the digest the person signs, after every rule that can be checked without a signature. */
export async function personVerificationSubject(db: Db, user: string, id: string, body: unknown) {
  const req = checkRequest(body);
  const pkg = await admissible(db, user, id, req);
  return { req, digest: digest({ act: "person-verification", package_id: pkg.id, package_revision: pkg.revision, criteria: req.criteria, outcome: req.outcome }) };
}

/** Step 2: records the signed verification, checking every rule again inside the writer transaction. */
export async function recordPersonVerification(
  db: Db, user: string, id: string, body: unknown,
  signed: { subject_digest: string; assertion: Json } | null,
) {
  const req = checkRequest(body);
  return command(db, "verification.record-person", async (c) => {
    if (!signed) throw new Refusal(403, "unsigned", "A person's verification must be signed with a passkey");
    const pkg = await admissible(c, user, id, req, true);
    const expected = digest({ act: "person-verification", package_id: pkg.id, package_revision: pkg.revision, criteria: req.criteria, outcome: req.outcome });
    if (signed.subject_digest !== expected) throw new Refusal(403, "signature-mismatch", "The signature does not cover this exact verification");
    await requireHardwareKey(c, String(signed.assertion.id ?? ""), needsOf(pkg.body));
    const memberId = memberIdFor(user);
    const q = await currentQualification(c, memberId);
    const m = await c.query<{ org_id: string }>("select org_id from members where id = $1", [memberId]);
    const orgId = m.rows[0]!.org_id;
    const actor: Actor = { kind: "human", id: memberId };
    const candidate = await singleCandidate(c, pkg, orgId, actor);
    const record = {
      id: `pv_${randomUUID().replaceAll("-", "").slice(0, 20)}`, org_id: orgId, verifier_member_id: memberId,
      qualification_id: q!.id, qualification_version: q!.version, candidate_id: candidate, criteria: req.criteria, outcome: req.outcome,
      assertion: {
        credential_id: String(signed.assertion.id ?? ""),
        authenticator_data: String(signed.assertion.response?.authenticatorData ?? ""),
        client_data_json: String(signed.assertion.response?.clientDataJSON ?? ""),
        signature: String(signed.assertion.response?.signature ?? ""),
      },
    };
    await recordObject(c, "person_verification", record as never, actor);
    return record;
  });
}
