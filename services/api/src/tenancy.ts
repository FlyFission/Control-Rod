import { createHash } from "node:crypto";
import type { Ajv2020 } from "ajv/dist/2020.js";
import type { Db, Tx } from "./db/index.js";
import { appendEvent, type Actor } from "./events.js";
import { digest } from "./kernel.js";
import { loadValidator } from "./schemas.js";

/** Storage for tenancy, people and authority (specification 5.1). Commands that authorize these writes land in task 1.5. */

export type LifecycleStatus = "active" | "suspended" | "retired";
export type SignerGrade = "safety" | "material" | "general-service";
export type SignerRole = "originator" | "checker" | "approver" | "discipline-lead" | "engineer-in-responsible-charge";
export type SignerAuthority = "administrator" | "lane" | "policy";
export type AttestationFormat = "none" | "packed" | "tpm" | "fido-u2f" | "android-key" | "android-safetynet" | "apple";
export type DataLane = "public" | "internal" | "proprietary" | "client-confidential" | "restricted";

export interface Organization { id: string; name: string; status: LifecycleStatus }
export interface Member { id: string; org_id: string; user_name: string; display_name: string; status: LifecycleStatus }
export interface License { jurisdiction: string; number: string; discipline?: string; expires_on: string }
export interface SignerQualification {
  id: string; version: number; org_id: string; member_id: string;
  licenses: License[]; disciplines: string[]; grades: SignerGrade[]; roles: SignerRole[];
  authorities: SignerAuthority[]; revoked: boolean; reason: string; effective_at: string;
}
export interface HardwareFloorVerdict { eligible: boolean; reason: string }
export interface AuthenticatorCredential {
  id: string; version: number; org_id: string; member_id: string; credential_id: string;
  attestation_format: AttestationFormat; aaguid?: string; user_verified: boolean; backup_eligible?: boolean;
  hardware_floor: HardwareFloorVerdict; attestation_verified?: boolean; attestation_evidence?: AttestationEvidence; revoked?: boolean; recorded_at: string;
}
export interface AttestationEvidence { attestation_object: string; trust_anchor_digest?: { algorithm: "sha256"; value: string } }
export interface Delegation {
  id: string; org_id: string; from_member_id: string; to_member_id: string; role: SignerRole;
  project_id?: string; discipline?: string; starts_on: string; ends_on: string; reason: string;
}
export interface Project {
  id: string; org_id: string; name: string; mode: "general" | "software" | "capital-projects";
  default_rigor: "administrative" | "quick" | "standard" | "high-consequence";
  lanes: DataLane[]; qa_overlays: string[]; autonomy_level: number; status: LifecycleStatus;
}
export interface RepoBinding { id: string; org_id: string; project_id: string; url: string; default_branch: string; status: LifecycleStatus }
export interface PolicySet {
  id: string; version: number; org_id: string; hardware_attestation_formats: AttestationFormat[];
  settings: Record<string, string>; reason: string; effective_at: string;
}
export interface Machine { id: string; org_id: string; name: string; status: LifecycleStatus }
export interface OwnershipEnvelope { object_kind: string; object_id: string; org_id: string; project_id?: string }
export interface MarkingEnvelope { object_kind: string; object_id: string; version: number; lane: DataLane; reason: string }

/** The organization migration 009 created for every record that predates tenancy. */
export const LOCAL_ORG = "org_local";

/**
 * Attestation formats docs/sqa/authenticators.md accepts as hardware backed, when no policy set
 * names its own. Eligibility also needs the statement verified against a retained trust anchor.
 */
export const DEFAULT_HARDWARE_FORMATS: readonly AttestationFormat[] = ["packed", "fido-u2f", "tpm"];

const BACKFILL_ACTOR: Actor = { kind: "system", id: "migration-009-tenancy" };

let validator: Ajv2020 | undefined;
/** Refuses a body its generated schema rejects, naming the first failing path. */
export function checkSchema(schema: string, body: unknown): void {
  validator ??= loadValidator();
  const v = validator.getSchema(schema);
  if (!v) throw new Error(`schema ${schema} is not generated`);
  if (!v(body)) {
    const e = v.errors?.[0];
    throw new Error(`${schema} refused: ${e?.instancePath || "/"} ${e?.message ?? "invalid"}`);
  }
}

/** Member ids are derived from the passkey user name so migration 009 and later code agree. */
export function memberIdFor(userName: string): string {
  return `mem_${createHash("md5").update(userName, "utf8").digest("hex").slice(0, 24)}`;
}

/** Credential record ids are derived from the WebAuthn credential id. */
export function credentialRecordIdFor(credentialId: string): string {
  return `cred_${createHash("sha256").update(credentialId, "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * The hardware key floor (specification 11.1 G-5). Eligible only with an attestation statement
 * in a listed format that was verified against a retained trust anchor; a synced credential is
 * never eligible.
 */
export function hardwareFloor(input: {
  format: AttestationFormat;
  attestationVerified: boolean;
  /** Undefined when the registration did not record it. */
  backupEligible: boolean | undefined;
  listedFormats: readonly AttestationFormat[];
}): HardwareFloorVerdict {
  if (input.format === "none")
    return { eligible: false, reason: "registered without attestation; re-enroll with attestation" };
  if (input.backupEligible !== false)
    return { eligible: false, reason: input.backupEligible ? "synced (multi-device) credential; not hardware bound" : "device binding was not recorded at registration" };
  if (!input.listedFormats.includes(input.format))
    return { eligible: false, reason: `attestation format ${input.format} is not listed as hardware backed` };
  if (!input.attestationVerified)
    return { eligible: false, reason: `${input.format} attestation not verified against a retained trust anchor` };
  return { eligible: true, reason: `${input.format} attestation verified` };
}

async function nextVersion(c: Tx, table: string, id: string): Promise<number> {
  // Serializes writers of one identity; the contiguity trigger refuses anything else.
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`${table}:${id}`]);
  const r = await c.query<{ v: number | null }>(`select max(version) as v from ${table} where id = $1`, [id]);
  return (r.rows[0]?.v ?? 0) + 1;
}

export async function createOrganization(c: Tx, org: Organization, actor: Actor): Promise<Organization> {
  checkSchema("Organization.json", org);
  await c.query("insert into organizations (body) values ($1)", [org]);
  await appendEvent(c, "organization.created", org.id, actor, { status: org.status });
  return org;
}

export async function addMember(c: Tx, member: Member, actor: Actor): Promise<Member> {
  checkSchema("Member.json", member);
  await c.query("insert into members (body) values ($1)", [member]);
  await appendEvent(c, "member.added", member.id, actor, { org_id: member.org_id });
  return member;
}

const LIFECYCLED = { organization: "organizations", member: "members", project: "projects", repo_binding: "repo_bindings", machine: "machines" } as const;
export type LifecycledKind = keyof typeof LIFECYCLED;

/** The only way a lifecycled identity changes state; each change is an event. */
export async function setStatus(c: Tx, kind: LifecycledKind, id: string, status: LifecycleStatus, actor: Actor, reason: string): Promise<void> {
  const table = LIFECYCLED[kind];
  const r = await c.query<{ body: { status: LifecycleStatus } }>(`select body from ${table} where id = $1 for update`, [id]);
  const from = r.rows[0]?.body.status;
  if (!from) throw new Error(`${kind} ${id} does not exist`);
  if (from === "retired") throw new Error(`${kind} ${id} is retired; retirement is final`);
  if (from === status) return;
  await c.query(`update ${table} set body = jsonb_set(body, '{status}', to_jsonb($2::text)) where id = $1`, [id, status]);
  await appendEvent(c, `${kind.replace("_", "-")}.status-changed`, id, actor, { from, to: status, reason });
}

export async function recordQualification(
  c: Tx,
  q: Omit<SignerQualification, "version" | "effective_at">,
  actor: Actor,
): Promise<{ record: SignerQualification; digest: string }> {
  const version = await nextVersion(c, "signer_qualifications", q.id);
  const record: SignerQualification = { ...q, version, effective_at: new Date().toISOString() };
  checkSchema("SignerQualification.json", record);
  const d = digest(record);
  await c.query("insert into signer_qualifications (body, digest) values ($1, $2)", [record, d]);
  await appendEvent(c, "signer-qualification.recorded", record.id, actor, { version, member_id: record.member_id, revoked: record.revoked, digest: d });
  return { record, digest: d };
}

/**
 * The Member's qualification in effect: the latest version of each qualification identity they
 * hold, ignoring revoked ones. The latest version is chosen before any filter, so a revocation
 * always wins over an earlier grant.
 */
export async function currentQualification(db: Db | Tx, memberId: string): Promise<SignerQualification | null> {
  const r = await db.query<{ body: SignerQualification }>(
    `select distinct on (id) body from signer_qualifications
      where id in (select id from signer_qualifications where member_id = $1)
      order by id, version desc`,
    [memberId],
  );
  const live = r.rows.map((x) => x.body).filter((q) => !q.revoked);
  if (live.length > 1) throw new Error(`member ${memberId} holds ${live.length} live qualifications; expected one`);
  return live[0] ?? null;
}

export async function recordPolicySet(
  c: Tx,
  p: Omit<PolicySet, "version" | "effective_at">,
  actor: Actor,
): Promise<{ record: PolicySet; digest: string }> {
  const version = await nextVersion(c, "policy_sets", p.id);
  const record: PolicySet = { ...p, version, effective_at: new Date().toISOString() };
  checkSchema("PolicySet.json", record);
  const d = digest(record);
  await c.query("insert into policy_sets (body, digest) values ($1, $2)", [record, d]);
  await appendEvent(c, "policy-set.recorded", record.id, actor, { version, digest: d });
  return { record, digest: d };
}

/** The policy set in effect for an organization: the greatest version of its one policy identity. */
export async function currentPolicySet(db: Db | Tx, orgId: string): Promise<{ record: PolicySet; digest: string } | null> {
  const r = await db.query<{ body: PolicySet; digest: string }>(
    "select body, digest from policy_sets where org_id = $1 order by version desc limit 1",
    [orgId],
  );
  return r.rows[0] ? { record: r.rows[0].body, digest: r.rows[0].digest } : null;
}

export async function recordCredential(
  c: Tx,
  input: {
    orgId: string; memberId: string; credentialId: string; format: AttestationFormat; aaguid?: string;
    userVerified: boolean; backupEligible?: boolean; attestationVerified: boolean; revoked?: boolean; evidence?: AttestationEvidence;
  },
  actor: Actor,
): Promise<{ record: AuthenticatorCredential; digest: string }> {
  const id = credentialRecordIdFor(input.credentialId);
  const version = await nextVersion(c, "authenticator_credentials", id);
  const policy = await currentPolicySet(c, input.orgId);
  const record: AuthenticatorCredential = {
    id, version, org_id: input.orgId, member_id: input.memberId, credential_id: input.credentialId,
    attestation_format: input.format, user_verified: input.userVerified,
    hardware_floor: hardwareFloor({
      format: input.format, attestationVerified: input.attestationVerified, backupEligible: input.backupEligible,
      listedFormats: policy?.record.hardware_attestation_formats ?? DEFAULT_HARDWARE_FORMATS,
    }),
    recorded_at: new Date().toISOString(),
  };
  if (input.aaguid !== undefined) record.aaguid = input.aaguid;
  if (input.backupEligible !== undefined) record.backup_eligible = input.backupEligible;
  record.attestation_verified = input.attestationVerified;
  if (input.evidence) record.attestation_evidence = input.evidence;
  if (input.revoked) {
    record.revoked = true;
    record.hardware_floor = { eligible: false, reason: "credential revoked" };
  }
  checkSchema("AuthenticatorCredential.json", record);
  const d = digest(record);
  await c.query("insert into authenticator_credentials (body, digest) values ($1, $2)", [record, d]);
  await appendEvent(c, "authenticator-credential.recorded", id, actor, {
    version, member_id: record.member_id, eligible: record.hardware_floor.eligible, digest: d,
  });
  return { record, digest: d };
}

export async function currentCredential(db: Db | Tx, credentialId: string): Promise<AuthenticatorCredential | null> {
  const r = await db.query<{ body: AuthenticatorCredential }>(
    "select body from authenticator_credentials where credential_id = $1 order by version desc limit 1",
    [credentialId],
  );
  return r.rows[0]?.body ?? null;
}

export async function recordDelegation(c: Tx, d: Delegation, actor: Actor): Promise<{ record: Delegation; digest: string }> {
  checkSchema("Delegation.json", d);
  if (d.ends_on < d.starts_on) throw new Error("delegation ends before it starts");
  const value = digest(d);
  await c.query("insert into delegations (body, digest) values ($1, $2)", [d, value]);
  await appendEvent(c, "delegation.recorded", d.id, actor, { role: d.role, from: d.from_member_id, to: d.to_member_id, digest: value });
  return { record: d, digest: value };
}

export async function createProject(c: Tx, p: Project, actor: Actor): Promise<Project> {
  checkSchema("Project.json", p);
  await c.query("insert into projects (body) values ($1)", [p]);
  await appendEvent(c, "project.created", p.id, actor, { org_id: p.org_id, mode: p.mode });
  return p;
}

export async function bindRepo(c: Tx, b: RepoBinding, actor: Actor): Promise<RepoBinding> {
  checkSchema("RepoBinding.json", b);
  const owner = await c.query<{ org_id: string }>("select org_id from projects where id = $1", [b.project_id]);
  if (owner.rows[0]?.org_id !== b.org_id) throw new Error(`project ${b.project_id} is not in organization ${b.org_id}`);
  await c.query("insert into repo_bindings (body) values ($1)", [b]);
  await appendEvent(c, "repo-binding.created", b.id, actor, { project_id: b.project_id });
  return b;
}

export async function enrollMachine(c: Tx, m: Machine, actor: Actor): Promise<Machine> {
  checkSchema("Machine.json", m);
  await c.query("insert into machines (body) values ($1)", [m]);
  await appendEvent(c, "machine.enrolled", m.id, actor, { org_id: m.org_id });
  return m;
}

/** Where each legacy object kind lives, so an envelope can only name a record that exists. */
const LEGACY_KINDS: Record<string, [table: string, column: string]> = {
  capture: ["captures", "id"], package: ["packages", "id"], run: ["runs", "id"], decision: ["decisions", "id"],
  preparation: ["preparation_snapshots", "preparation_id"], grant: ["preparation_grants", "id"], credential: ["credentials", "id"],
};

/**
 * Records an owner explicitly. Envelopes are immutable; a second owner for one object refuses. A
 * legacy kind must name an existing record, so no envelope can claim an identity before it exists.
 */
export async function recordOwner(c: Tx, e: OwnershipEnvelope): Promise<void> {
  checkSchema("OwnershipEnvelope.json", e);
  const legacy = LEGACY_KINDS[e.object_kind];
  if (legacy) {
    const found = await c.query(`select 1 from ${legacy[0]} where ${legacy[1]} = $1 limit 1`, [e.object_id]);
    if (!found.rowCount) throw new Error(`${e.object_kind} ${e.object_id} does not exist`);
  }
  await c.query("insert into object_owners (object_kind, object_id, org_id, project_id) values ($1, $2, $3, $4)", [
    e.object_kind, e.object_id, e.org_id, e.project_id ?? null,
  ]);
}

export async function ownerOf(db: Db | Tx, kind: string, id: string): Promise<OwnershipEnvelope | null> {
  const r = await db.query<{ org_id: string; project_id: string | null }>(
    "select org_id, project_id from object_owners where object_kind = $1 and object_id = $2",
    [kind, id],
  );
  const row = r.rows[0];
  if (!row) return null;
  const e: OwnershipEnvelope = { object_kind: kind, object_id: id, org_id: row.org_id };
  if (row.project_id !== null) e.project_id = row.project_id;
  return e;
}

/** Records the lane an object carried at creation (version 1). Effective markings arrive in task 1.9. */
export async function recordCreationMarking(c: Tx, kind: string, id: string, lane: DataLane, reason: string): Promise<MarkingEnvelope> {
  const m: MarkingEnvelope = { object_kind: kind, object_id: id, version: 1, lane, reason };
  checkSchema("MarkingEnvelope.json", m);
  await c.query("insert into object_markings (body) values ($1)", [m]);
  return m;
}

/** Records a passkey just registered: its Member (created on first use) and credential version 1. */
export async function recordRegistration(
  c: Tx,
  input: { userName: string; credentialId: string; format: AttestationFormat; aaguid?: string; userVerified: boolean; backupEligible: boolean;
    attestationVerified?: boolean; evidence?: AttestationEvidence },
  actor: Actor,
): Promise<{ record: AuthenticatorCredential; digest: string }> {
  const owner = await ownerOf(c, "credential", input.credentialId);
  if (!owner) throw new Error(`credential ${input.credentialId} has no owning organization`);
  const memberId = memberIdFor(input.userName);
  const existing = await c.query("select 1 from members where id = $1", [memberId]);
  if (!existing.rowCount)
    await addMember(c, { id: memberId, org_id: owner.org_id, user_name: input.userName, display_name: input.userName, status: "active" }, actor);
  // Verified means the attestation chain reached a retained trust anchor (attestation.ts); the floor verdict follows from it.
  return recordCredential(c, { orgId: owner.org_id, memberId, credentialId: input.credentialId, format: input.format,
    ...(input.aaguid !== undefined ? { aaguid: input.aaguid } : {}),
    userVerified: input.userVerified, backupEligible: input.backupEligible, attestationVerified: input.attestationVerified ?? false,
    ...(input.evidence ? { evidence: input.evidence } : {}) }, actor);
}

/** The deterministic id of a Member's one qualification identity, so issues and revocations version it. */
export const qualificationIdFor = (memberId: string) => `qual_${memberId.slice(4)}`;

const FOUNDING_ACTOR: Actor = { kind: "system", id: "founding-member" };

/**
 * The organization's first Member: whoever enrolled earliest. A Member's enrollment is the earlier
 * of their record and their first passkey, because the Members that migration 009 backfilled were
 * all created in one transaction and share one timestamp, while their passkeys keep the order
 * people really registered in. Ties fall back to the id only when both times match.
 */
export async function firstMemberOf(c: Tx | Db, orgId: string, options: { activeOnly?: boolean } = {}): Promise<string | undefined> {
  const r = await c.query<{ id: string }>(
    `select m.id from members m
       left join lateral (
         select min(cr.created_at) as at from authenticator_credentials a join credentials cr on cr.id = a.credential_id
          where a.member_id = m.id) e on true
      where m.org_id = $1 ${options.activeOnly ? "and m.body->>'status' = 'active'" : ""}
      order by least(m.created_at, coalesce(e.at, m.created_at)), m.id limit 1`, [orgId]);
  return r.rows[0]?.id;
}

/**
 * Makes an organization's first Member able to run it: administrator, lane and policy authority,
 * recorded as their qualification version 1. Only while no administrator qualification has ever
 * existed in the organization, so it happens once. Licenses, disciplines and signing roles are not
 * granted; the person records those themselves.
 */
export async function grantFoundingAuthorities(c: Tx, orgId: string): Promise<boolean> {
  const ever = await c.query("select 1 from signer_qualifications where org_id = $1 and body->'authorities' ? 'administrator' limit 1", [orgId]);
  if (ever.rowCount) return false;
  const firstId = await firstMemberOf(c, orgId, { activeOnly: true });
  if (!firstId) return false;
  const first = { id: firstId };
  await recordQualification(c, {
    // Enough to run a General service package end to end on a fresh install: originate, check and
    // approve. Safety and Material grades, disciplines and licenses are facts only the person can
    // record, so they start empty.
    id: qualificationIdFor(first.id), org_id: orgId, member_id: first.id, licenses: [], disciplines: [], grades: ["general-service"],
    roles: ["originator", "checker", "approver"], authorities: ["administrator", "lane", "policy"], revoked: false,
    reason: "founding member of the organization",
  }, FOUNDING_ACTOR);
  return true;
}

/**
 * Completes migration 009 for records that existed before it (command migration.backfill-tenancy):
 * an ownership envelope for every existing record, a Member for every passkey user, and credential
 * version 1 for every passkey. Idempotent, and never reads a signed body, event or digest for
 * writing. Envelopes go to the sole active organization, as the insert triggers do.
 */
export async function backfillTenancy(c: Tx): Promise<number> {
  // Only records with no envelope yet are resolved, so a later second organization never makes
  // restarts ambiguous; an unowned record with more than one active organization still refuses.
  await c.query(`insert into object_owners (object_kind, object_id, org_id)
    select k, i, tenancy_sole_org() from (
      select 'capture' as k, id as i from captures
      union select 'package', id from packages
      union select 'run', id from runs
      union select 'decision', id from decisions
      union select 'preparation', preparation_id from preparation_snapshots
      union select 'grant', id from preparation_grants
      union select 'credential', id from credentials) existing
    where not exists (select 1 from object_owners o where o.object_kind = existing.k and o.object_id = existing.i)
    on conflict do nothing`);
  const recorded = await backfillCredentials(c);
  // An installation from before founding authorities gives its first Member the same start.
  await grantFoundingAuthorities(c, LOCAL_ORG);
  return recorded;
}

/**
 * Completes migration 009 for passkeys registered before it: each gets credential version 1,
 * marked registered without attestation, so none is eligible for the hardware key floor until
 * re-enrolled. Idempotent; appends events only for credentials it records.
 */
export async function backfillCredentials(c: Tx): Promise<number> {
  await c.query("select pg_advisory_xact_lock(hashtext('tenancy-backfill-credentials'))");
  const r = await c.query<{ id: string; user_name: string; org_id: string }>(
    `select cr.id, cr.user_name, o.org_id from credentials cr
       join object_owners o on o.object_kind = 'credential' and o.object_id = cr.id
      where not exists (select 1 from authenticator_credentials a where a.credential_id = cr.id)
      order by cr.created_at, cr.id`,
  );
  for (const row of r.rows) {
    const memberId = memberIdFor(row.user_name);
    const m = await c.query("select 1 from members where id = $1", [memberId]);
    if (!m.rowCount)
      await addMember(c, { id: memberId, org_id: row.org_id, user_name: row.user_name, display_name: row.user_name, status: "active" }, BACKFILL_ACTOR);
    // Registration has always required user verification; device binding was never recorded.
    await recordCredential(c, { orgId: row.org_id, memberId, credentialId: row.id, format: "none",
      userVerified: true, attestationVerified: false }, BACKFILL_ACTOR);
  }
  return r.rows.length;
}
