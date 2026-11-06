import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CommandName } from "./commands/catalog.js";
import { command } from "./commands/executor.js";
import type { Db, Tx } from "./db/index.js";
import { appendEvent, type Actor } from "./events.js";
import { digest } from "./kernel.js";
import {
  type DataLane, type License, type Member, type SignerAuthority, type SignerGrade, type SignerQualification, type SignerRole,
  addMember, bindRepo, checkSchema, qualificationIdFor, createProject, currentCredential, currentPolicySet, currentQualification, firstMemberOf, memberIdFor,
  recordCredential, recordDelegation, recordPolicySet, recordQualification, setStatus,
} from "./tenancy.js";
import { isLane } from "./disclosure.js";
import { configuredClosure, covers, declassify, downstreamOf, effectiveLane, ensureMarking } from "./markings.js";
import { teach } from "./refusals.js";
import { pinRuntime, rollbackRuntime } from "./runtimes.js";
import { pullScram, restartAfterScram, reviewQuarantine } from "./scram.js";
import { sealChain } from "./seals.js";
import { checkBudget } from "./budgets.js";
import { getObject, recordObject, transition } from "./workbench.js";
import { Refusal } from "./work.js";

/**
 * Administrative commands (specification 10.2; workbench plan task 1.5). Each declares how it is
 * signed and what authority it needs. Direct commands run only with a passkey assertion over the
 * command name and the digest of its exact payload (`adminSubject`). Authority is checked inside the
 * writer transaction against the Member's latest qualification and active status.
 */

export interface Caller { userName: string; memberId: string; orgId: string }
type Need = "administrator" | "policy" | "administrator+policy" | "lane" | "member";

interface AdminCommand {
  /** What a person sees, in the palette and on Policies. */
  label: string;
  /** A command that exists in the catalog but is refused for everyone for now: its reason code. */
  unavailable?: string;
  catalog: CommandName;
  signature: "direct" | "none";
  need: Need;
  /** Runs inside the writer transaction after authority is confirmed. Returns what the client sees. */
  run: (c: Tx, caller: Caller, payload: Record<string, unknown>, ctx: AdminContext) => Promise<unknown>;
}

export interface AdminContext {
  /** The repository root, for bundled theme manifests. */
  root: string;
  /** Lanes of configured preparation sources, which a declassification records as covered. */
  preparationLanes?: Record<string, DataLane>;
  /** The signed command's passkey assertion, in record form, for records that keep it (SCRAM). */
  assertion?: { credential_id: string; authenticator_data: string; client_data_json: string; signature: string };
  /** The signed subject and the challenge nonce, for records whose signature is checked again later (seals). */
  signed?: { subject: string; nonce: string };
}

const str = (p: Record<string, unknown>, k: string, required = true): string | undefined => {
  const v = p[k];
  if (v === undefined && !required) return undefined;
  if (typeof v !== "string" || !v.trim()) throw new Refusal(400, "invalid", `${k} is required`);
  return v.trim();
};
const arr = <T>(p: Record<string, unknown>, k: string): T[] => {
  const v = p[k] ?? [];
  if (!Array.isArray(v)) throw new Refusal(400, "invalid", `${k} must be a list`);
  return v as T[];
};
const actorOf = (caller: Caller): Actor => ({ kind: "human", id: caller.memberId });
const idFor = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

export { qualificationIdFor } from "./tenancy.js";

async function member(c: Tx | Db, id: string, orgId: string): Promise<Member> {
  const r = await c.query<{ body: Member }>("select body from members where id = $1 and org_id = $2", [id, orgId]);
  if (!r.rows[0]) throw new Refusal(404, "not-found", "No such member in this organization");
  return r.rows[0].body;
}

/**
 * Refuses a change to one Member that would leave the organization without an active administrator,
 * or without an active Member holding both administrator and policy authority: only such a Member can
 * issue qualifications, so without one nobody could ever restore authority. `next` is the Member's
 * authorities after the change, or null when they lose them all (suspended, removed or revoked). A
 * state the organization was already in is never made the reason to refuse.
 */
async function keepAdministration(c: Tx, orgId: string, memberId: string, next: readonly string[] | null): Promise<void> {
  const r = await c.query<{ body: SignerQualification }>(
    "select distinct on (id) body from signer_qualifications where org_id = $1 order by id, version desc", [orgId]);
  const held: { member: string; authorities: readonly string[] }[] = [];
  for (const { body: q } of r.rows) {
    if (q.revoked) continue;
    if ((await member(c, q.member_id, orgId)).status !== "active") continue;
    held.push({ member: q.member_id, authorities: q.authorities });
  }
  const after = held.filter((h) => h.member !== memberId).concat(next ? [{ member: memberId, authorities: next }] : []);
  const admin = (xs: typeof held) => xs.some((h) => h.authorities.includes("administrator"));
  const issuer = (xs: typeof held) => xs.some((h) => h.authorities.includes("administrator") && h.authorities.includes("policy"));
  if (admin(held) && !admin(after)) throw new Refusal(409, "last-administrator", "This would leave no active administrator");
  if (issuer(held) && !issuer(after))
    throw new Refusal(409, "last-qualification-issuer",
      "This would leave no active Member with both administrator and policy authority, and only such a Member can issue qualifications");
}

/** An object's current marking, or a refusal when it has no classified lane. */
async function markingFor(c: Tx, kind: string, id: string) {
  const m = await ensureMarking(c, kind, id);
  if (!m) throw new Refusal(404, "not-found", "No classified object of that kind and id");
  return m;
}

/** Refuses unless the caller is an active Member holding what the command needs. */
async function authorize(c: Tx, caller: Caller, need: Need, bootstrap: boolean): Promise<void> {
  const me = await member(c, caller.memberId, caller.orgId);
  if (me.status !== "active") throw new Refusal(403, "member-inactive", "Your membership is not active");
  if (need === "member" || bootstrap) return;
  const q = await currentQualification(c, caller.memberId);
  const has = new Set<SignerAuthority>(q?.authorities ?? []);
  const missing = need.split("+").filter((a) => !has.has(a as SignerAuthority));
  if (missing.length)
    throw new Refusal(403, "authority-missing", `This needs ${missing.join(" and ")} authority, which your qualification does not include`);
}

/** Bundled office themes: each pack's manifest and its digest. Only these can be selected. */
export function bundledThemes(root: string): Map<string, string> {
  const dir = join(root, "apps", "web", "public", "floor-themes");
  const out = new Map<string, string>();
  for (const id of readdirSync(dir)) {
    try {
      out.set(id, createHash("sha256").update(readFileSync(join(dir, id, "assets.json"))).digest("hex"));
    } catch {
      // Not a theme pack.
    }
  }
  return out;
}

async function lastUsableCredential(c: Tx, memberId: string, except: string): Promise<boolean> {
  const r = await c.query<{ credential_id: string }>(
    "select distinct on (credential_id) credential_id, body from authenticator_credentials where member_id = $1 order by credential_id, version desc", [memberId]);
  for (const row of r.rows) {
    if (row.credential_id === except) continue;
    const cur = await currentCredential(c, row.credential_id);
    if (cur && !cur.revoked) return false;
  }
  return true;
}

const INVITATION_DAYS = 7;

/** Issues a one-time invitation for a Member; the token is returned once and only its hash is kept. */
async function invite(c: Tx, caller: Caller, memberId: string): Promise<{ token: string; expires_at: string }> {
  const token = randomBytes(32).toString("base64url");
  const r = await c.query<{ expires_at: Date }>(
    `insert into member_invitations (token_hash, member_id, org_id, issued_by, expires_at)
     values ($1, $2, $3, $4, now() + interval '${INVITATION_DAYS} days') returning expires_at`,
    [createHash("sha256").update(token).digest("hex"), memberId, caller.orgId, caller.memberId]);
  await appendEvent(c, "member.invited", memberId, actorOf(caller), { expires_at: r.rows[0]!.expires_at.toISOString() });
  return { token, expires_at: r.rows[0]!.expires_at.toISOString() };
}

/** Voids every challenge issued to a person: signatures and passkey registrations they have not redeemed. */
async function voidChallenges(c: Tx, m: Member): Promise<void> {
  await c.query("delete from challenges where data->>'issued_to' = $1 or data->>'member' = $2", [m.user_name, m.id]);
}

/** Ends what a Member can do right now: sessions, every unredeemed challenge, open invitations. */
async function endAccess(c: Tx, m: Member): Promise<void> {
  await c.query("delete from sessions where user_name = $1", [m.user_name]);
  await voidChallenges(c, m);
  await c.query("update member_invitations set used_at = now() where member_id = $1 and used_at is null", [m.id]);
}

/** Whether a Member already holds a passkey. Invitations are only for a person's first one. */
async function hasPasskey(c: Tx, m: Member): Promise<boolean> {
  return Boolean((await c.query("select 1 from credentials where user_name = $1 limit 1", [m.user_name])).rowCount);
}

/** Policy settings Control Rod understands, each with its allowed values. Anything else is refused. */
/**
 * The policy settings Control Rod understands. autonomy_ceiling caps a project's autonomy level;
 * budget_near_percent is the share of a budget's limit, in whole percent, at which it reads as near
 * and alerts (plan task 5.2). Unset, no budget is called near: the line is the organization's to draw.
 */
const POLICY_SETTINGS: Record<string, RegExp> = { autonomy_ceiling: /^[0-3]$/, budget_near_percent: /^[1-9][0-9]?$/ };

function checkPolicy(proposal: unknown): { hardware_attestation_formats: string[]; settings: Record<string, string> } {
  if (!proposal || typeof proposal !== "object") throw new Refusal(400, "invalid", "policy is required");
  const p = proposal as { hardware_attestation_formats?: unknown; settings?: unknown };
  const formats = p.hardware_attestation_formats ?? [];
  const settings = (p.settings === undefined ? {} : p.settings) as Record<string, unknown>;
  if (!Array.isArray(formats) || settings === null || typeof settings !== "object" || Array.isArray(settings))
    throw new Refusal(400, "invalid", "policy has the wrong shape");
  for (const [k, v] of Object.entries(settings)) {
    const rule = Object.hasOwn(POLICY_SETTINGS, k) ? POLICY_SETTINGS[k] : undefined;
    if (!rule) throw new Refusal(400, "unknown-setting", `Policy setting ${k} is not one Control Rod understands`);
    if (typeof v !== "string" || !rule.test(v)) throw new Refusal(400, "invalid-setting", `Policy setting ${k} has an invalid value`);
  }
  return { hardware_attestation_formats: formats as string[], settings: settings as Record<string, string> };
}

/** The autonomy ceiling in effect; an unreadable value fails closed to 0. */
function autonomyCeiling(settings: Record<string, string> | undefined): number {
  const v = settings?.autonomy_ceiling ?? "3";
  return POLICY_SETTINGS.autonomy_ceiling!.test(v) ? Number(v) : 0;
}

async function revokeDelegationsOf(c: Tx, caller: Caller, memberId: string, reason: string): Promise<number> {
  const r = await c.query<{ id: string }>(
    `select d.id from delegations d where d.org_id = $1 and (d.from_member_id = $2 or d.to_member_id = $2)
       and not exists (select 1 from delegation_revocations x where x.delegation_id = d.id)`, [caller.orgId, memberId]);
  for (const { id } of r.rows) await recordRevocation(c, caller, id, reason);
  return r.rows.length;
}

async function recordRevocation(c: Tx, caller: Caller, delegationId: string, reason: string): Promise<void> {
  const body = { id: idFor("drev"), org_id: caller.orgId, delegation_id: delegationId, revoked_by: caller.memberId, reason, revoked_at: new Date().toISOString() };
  checkSchema("DelegationRevocation.json", body);
  const d = digest(body);
  await c.query("insert into delegation_revocations (body, digest) values ($1, $2)", [body, d]);
  await appendEvent(c, "delegation.revoked", delegationId, actorOf(caller), { reason, digest: d });
}

export const ADMIN_COMMANDS: Record<string, AdminCommand> = {
  "org.create": {
    label: "Create the organization",
    unavailable: "multi-organization-later",
    catalog: "admin.org-create", signature: "direct", need: "administrator",
    async run() {
      throw new Refusal(409, "multi-organization-later",
        "Control Rod runs one organization until the multi-organization phase; records created before it need a sole owner");
    },
  },

  "member.enroll": {
    label: "Enroll a member",
    catalog: "admin.member-enroll", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const userName = str(p, "user_name")!;
      const m: Member = { id: memberIdFor(userName), org_id: caller.orgId, user_name: userName, display_name: str(p, "display_name", false) ?? userName, status: "active" };
      await addMember(c, m, actorOf(caller));
      // The new person registers their own passkey with this invitation; nobody registers for them.
      return { member: m, invitation: await invite(c, caller, m.id) };
    },
  },

  "member.invite": {
    label: "Invite a member",
    catalog: "admin.member-invite", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const id = str(p, "member_id")!;
      const m = await member(c, id, caller.orgId);
      if (m.status !== "active") throw new Refusal(409, "member-not-active", `This member is ${m.status}`);
      // An invitation registers a first passkey. A member who has one adds more themselves, by signing.
      if (await hasPasskey(c, m)) throw new Refusal(409, "member-has-passkey", "This member already has a passkey; invitations are for a first passkey only");
      return { member_id: id, invitation: await invite(c, caller, id) };
    },
  },

  "member.suspend": {
    label: "Suspend a member",
    catalog: "admin.member-suspend", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const id = str(p, "member_id")!;
      const m = await member(c, id, caller.orgId);
      if (m.status !== "active") throw new Refusal(409, "member-not-active", `This member is ${m.status}`);
      await keepAdministration(c, caller.orgId, id, null);
      await setStatus(c, "member", id, "suspended", actorOf(caller), str(p, "reason")!);
      await endAccess(c, m);
      return { member_id: id, status: "suspended" };
    },
  },

  "member.reactivate": {
    label: "Reactivate a member",
    catalog: "admin.member-reactivate", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const id = str(p, "member_id")!;
      const m = await member(c, id, caller.orgId);
      if (m.status === "retired") throw new Refusal(409, "member-retired", "A removed member stays removed; enroll them again under a new passkey");
      await setStatus(c, "member", id, "active", actorOf(caller), str(p, "reason")!);
      return { member_id: id, status: "active" };
    },
  },

  "member.remove": {
    label: "Remove a member",
    catalog: "admin.member-remove", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const id = str(p, "member_id")!, reason = str(p, "reason")!;
      const m = await member(c, id, caller.orgId);
      await keepAdministration(c, caller.orgId, id, null);
      // Departure rules: open delegations end, sessions end, and the membership is retired for good.
      const revoked = await revokeDelegationsOf(c, caller, id, `member removed: ${reason}`);
      await setStatus(c, "member", id, "retired", actorOf(caller), reason);
      await endAccess(c, m);
      return { member_id: id, status: "retired", delegations_revoked: revoked };
    },
  },

  "credential.revoke": {
    label: "Revoke a passkey",
    catalog: "admin.credential-revoke", signature: "direct", need: "member",
    async run(c, caller, p) {
      const credentialId = str(p, "credential_id")!, reason = str(p, "reason")!;
      const cur = await currentCredential(c, credentialId);
      if (!cur || cur.org_id !== caller.orgId) throw new Refusal(404, "not-found", "No such credential");
      if (cur.revoked) throw new Refusal(409, "already-revoked", "This credential is already revoked");
      if (cur.member_id !== caller.memberId) await authorize(c, caller, "administrator", false);
      if (await lastUsableCredential(c, cur.member_id, credentialId))
        throw new Refusal(409, "last-credential", "This is the member's last usable passkey; add another before revoking it");
      const { record } = await recordCredential(c, {
        orgId: cur.org_id, memberId: cur.member_id, credentialId, format: cur.attestation_format, ...(cur.aaguid ? { aaguid: cur.aaguid } : {}),
        userVerified: cur.user_verified, ...(cur.backup_eligible !== undefined ? { backupEligible: cur.backup_eligible } : {}),
        attestationVerified: false, revoked: true,
      }, actorOf(caller));
      await appendEvent(c, "authenticator-credential.revoked", record.id, actorOf(caller), { reason, version: record.version });
      // A registration authorized by signing with this passkey, not yet completed, is void too.
      await voidChallenges(c, await member(c, cur.member_id, caller.orgId));
      return { credential_id: credentialId, version: record.version, revoked: true };
    },
  },

  "qualification.issue": {
    label: "Issue a qualification",
    catalog: "admin.qualification-issue", signature: "direct", need: "administrator+policy",
    async run(c, caller, p) {
      const memberId = str(p, "member_id")!;
      await member(c, memberId, caller.orgId);
      const authorities = arr<SignerAuthority>(p, "authorities");
      await keepAdministration(c, caller.orgId, memberId, authorities);
      const q = await recordQualification(c, {
        id: qualificationIdFor(memberId), org_id: caller.orgId, member_id: memberId,
        licenses: arr<License>(p, "licenses"), disciplines: arr<string>(p, "disciplines"), grades: arr<SignerGrade>(p, "grades"),
        roles: arr<SignerRole>(p, "roles"), authorities, revoked: false, reason: str(p, "reason")!,
      }, actorOf(caller));
      return q.record;
    },
  },

  "qualification.revoke": {
    label: "Revoke a qualification",
    catalog: "admin.qualification-revoke", signature: "direct", need: "administrator+policy",
    async run(c, caller, p) {
      const memberId = str(p, "member_id")!;
      const target = await member(c, memberId, caller.orgId);
      const cur = await currentQualification(c, memberId);
      if (!cur || cur.org_id !== caller.orgId) throw new Refusal(404, "not-found", "This member holds no qualification");
      await keepAdministration(c, caller.orgId, memberId, null);
      const { version: _v, effective_at: _e, ...base } = cur;
      const q = await recordQualification(c, { ...base, revoked: true, reason: str(p, "reason")! }, actorOf(caller));
      // Challenges issued on the strength of the revoked qualification can no longer be redeemed.
      await voidChallenges(c, target);
      return q.record;
    },
  },

  "delegation.create": {
    label: "Delegate authority",
    catalog: "admin.delegation-create", signature: "direct", need: "member",
    async run(c, caller, p) {
      const role = str(p, "role")! as SignerRole;
      const discipline = str(p, "discipline")!;
      const mine = await currentQualification(c, caller.memberId);
      if (!mine?.roles.includes(role)) throw new Refusal(403, "role-missing", `You can delegate only a role you hold; you do not hold ${role}`);
      if (!mine.disciplines.includes(discipline)) throw new Refusal(403, "discipline-missing", `You can delegate only within a discipline you hold; you do not hold ${discipline}`);
      const startsOn = str(p, "starts_on")!, endsOn = str(p, "ends_on")!;
      const days = (Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000;
      if (!Number.isFinite(days) || days < 0 || days > 366) throw new Refusal(400, "invalid-dates", "A delegation runs forward from its start, for at most a year");
      if (p.project_id !== undefined) {
        const prj = await c.query("select 1 from projects where id = $1 and org_id = $2", [str(p, "project_id")!, caller.orgId]);
        if (!prj.rowCount) throw new Refusal(404, "not-found", "No such project");
      }
      const to = str(p, "to_member_id")!;
      const target = await member(c, to, caller.orgId);
      if (target.status !== "active") throw new Refusal(409, "member-inactive", "The delegate is not an active member");
      const d = {
        id: idFor("del"), org_id: caller.orgId, from_member_id: caller.memberId, to_member_id: to, role,
        ...(p.project_id ? { project_id: str(p, "project_id")! } : {}), discipline,
        starts_on: startsOn, ends_on: endsOn, reason: str(p, "reason")!,
      };
      return (await recordDelegation(c, d, actorOf(caller))).record;
    },
  },

  "delegation.revoke": {
    label: "Revoke a delegation",
    catalog: "admin.delegation-revoke", signature: "direct", need: "member",
    async run(c, caller, p) {
      const id = str(p, "delegation_id")!;
      const r = await c.query<{ from_member_id: string }>("select from_member_id from delegations where id = $1 and org_id = $2", [id, caller.orgId]);
      if (!r.rows[0]) throw new Refusal(404, "not-found", "No such delegation");
      if (r.rows[0].from_member_id !== caller.memberId) await authorize(c, caller, "administrator", false);
      const done = await c.query("select 1 from delegation_revocations where delegation_id = $1", [id]);
      if (done.rowCount) throw new Refusal(409, "already-revoked", "This delegation is already revoked");
      await recordRevocation(c, caller, id, str(p, "reason")!);
      return { delegation_id: id, revoked: true };
    },
  },

  "project.create": {
    label: "Create a project",
    catalog: "admin.project-create", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      return createProject(c, {
        id: idFor("prj"), org_id: caller.orgId, name: str(p, "name")!, mode: str(p, "mode")! as never,
        default_rigor: str(p, "default_rigor")! as never, lanes: arr<DataLane>(p, "lanes"), qa_overlays: arr<string>(p, "qa_overlays"),
        autonomy_level: 0, status: "active",
      }, actorOf(caller));
    },
  },

  "project.update": {
    label: "Update a project",
    catalog: "admin.project-update", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const id = str(p, "project_id")!;
      const r = await c.query<{ body: Record<string, unknown> }>("select body from projects where id = $1 and org_id = $2 for update", [id, caller.orgId]);
      if (!r.rows[0]) throw new Refusal(404, "not-found", "No such project");
      const next = { ...r.rows[0].body };
      for (const k of ["name", "default_rigor", "lanes", "qa_overlays"]) if (p[k] !== undefined) next[k] = p[k];
      checkSchema("Project.json", next);
      await c.query("update projects set body = $2 where id = $1", [id, next]);
      await appendEvent(c, "project.updated", id, actorOf(caller), { fields: Object.keys(p).filter((k) => k !== "project_id").sort() });
      return next;
    },
  },

  "project.set-autonomy": {
    label: "Set a project's autonomy",
    catalog: "admin.project-set-autonomy", signature: "direct", need: "policy",
    async run(c, caller, p) {
      const id = str(p, "project_id")!;
      const level = p.level;
      if (!Number.isInteger(level) || (level as number) < 0) throw new Refusal(400, "invalid", "level must be a whole number");
      if ((level as number) >= 4) throw new Refusal(409, "autonomy-floor", "Autonomy level 4 is never permitted");
      const ceiling = autonomyCeiling((await currentPolicySet(c, caller.orgId))?.record.settings);
      if ((level as number) > ceiling) throw new Refusal(409, "autonomy-ceiling", `The organization's policy caps autonomy at ${ceiling}`);
      const r = await c.query<{ body: Record<string, unknown> }>("select body from projects where id = $1 and org_id = $2 for update", [id, caller.orgId]);
      if (!r.rows[0]) throw new Refusal(404, "not-found", "No such project");
      const from = r.rows[0].body.autonomy_level;
      await c.query("update projects set body = jsonb_set(body, '{autonomy_level}', to_jsonb($2::int)) where id = $1", [id, level]);
      await appendEvent(c, "project.autonomy-set", id, actorOf(caller), { from, to: level });
      return { project_id: id, autonomy_level: level };
    },
  },

  "repo.bind": {
    label: "Bind a repository",
    catalog: "admin.repo-bind", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const prj = await c.query("select 1 from projects where id = $1 and org_id = $2", [str(p, "project_id")!, caller.orgId]);
      if (!prj.rowCount) throw new Refusal(404, "not-found", "No such project");
      return bindRepo(c, { id: idFor("rb"), org_id: caller.orgId, project_id: str(p, "project_id")!, url: str(p, "url")!,
        default_branch: str(p, "default_branch")!, status: "active" }, actorOf(caller));
    },
  },

  "repo.unbind": {
    label: "Unbind a repository",
    catalog: "admin.repo-unbind", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      const id = str(p, "binding_id")!;
      const r = await c.query("select 1 from repo_bindings where id = $1 and org_id = $2", [id, caller.orgId]);
      if (!r.rowCount) throw new Refusal(404, "not-found", "No such repository binding");
      await setStatus(c, "repo_binding", id, "retired", actorOf(caller), str(p, "reason")!);
      return { binding_id: id, status: "retired" };
    },
  },

  "policy.propose": {
    label: "Propose a policy change",
    catalog: "admin.policy-propose", signature: "none", need: "member",
    async run(c, caller, p) {
      const proposal = checkPolicy(p.policy);
      const cr = {
        id: idFor("cr"), org_id: caller.orgId, kind: "policy-change", subject_digest: { algorithm: "sha256", value: digest(proposal) },
        reason: str(p, "reason")!, impact: arr<string>(p, "impact"), proposed_by: actorOf(caller), status: "proposed", proposal,
      };
      await recordObject(c, "change_request", cr as never, actorOf(caller));
      return cr;
    },
  },

  "policy.approve": {
    label: "Approve a policy change",
    catalog: "admin.policy-approve", signature: "direct", need: "policy",
    async run(c, caller, p) {
      const id = str(p, "change_request_id")!;
      const cr = await getObject<{ org_id: string; kind: string; status: string; subject_digest: { value: string }; proposal?: Record<string, unknown> }>(c, "change_request", id);
      if (!cr || cr.org_id !== caller.orgId || cr.kind !== "policy-change") throw new Refusal(404, "not-found", "No such policy change request");
      if (cr.status !== "proposed") throw new Refusal(409, "not-proposed", "This change request is no longer open");
      if (!cr.proposal || digest(cr.proposal) !== cr.subject_digest.value) throw new Refusal(409, "proposal-mismatch", "The proposal does not match its digest");
      const current = await currentPolicySet(c, caller.orgId);
      const proposal = checkPolicy(cr.proposal);
      const { record } = await recordPolicySet(c, {
        id: current?.record.id ?? "pol_local", org_id: caller.orgId,
        hardware_attestation_formats: proposal.hardware_attestation_formats as never, settings: proposal.settings,
        reason: `change request ${id}`,
      }, actorOf(caller));
      await transition(c, "change_request", id, "approved", actorOf(caller), `policy set version ${record.version}`);
      return record;
    },
  },

  "marking.propose-declassification": {
    label: "Propose a declassification",
    catalog: "admin.marking-propose", signature: "none", need: "member",
    async run(c, caller, p) {
      const kind = str(p, "object_kind")!;
      const id = str(p, "object_id")!;
      const lane = p.lane;
      if (!isLane(lane)) throw new Refusal(400, "invalid", "Choose the lane to declassify to");
      const m = await markingFor(c, kind, id);
      if (covers(lane, effectiveLane(m))) throw new Refusal(409, "not-lower", `This is already ${effectiveLane(m)}; a declassification only lowers`);
      // The proposal names the exact marking version, and lists everything downstream before approval.
      const proposal = { object_kind: kind, object_id: id, version: m.version, from: effectiveLane(m), lane };
      const impact = (await downstreamOf(c, kind, id)).map((d) => `${d.kind}/${d.id}`);
      const cr = {
        id: idFor("cr"), org_id: caller.orgId, kind: "declassification", subject_digest: { algorithm: "sha256", value: digest(proposal) },
        reason: str(p, "reason")!, impact, proposed_by: actorOf(caller), status: "proposed", proposal,
      };
      await recordObject(c, "change_request", cr as never, actorOf(caller));
      return cr;
    },
  },

  "marking.approve-declassification": {
    label: "Approve a declassification",
    catalog: "admin.marking-approve", signature: "direct", need: "lane",
    async run(c, caller, p, ctx) {
      const id = str(p, "change_request_id")!;
      const cr = await getObject<{ org_id: string; kind: string; status: string; subject_digest: { value: string }; impact: string[];
        proposal?: { object_kind: string; object_id: string; version: number; lane: string } }>(c, "change_request", id);
      if (!cr || cr.org_id !== caller.orgId || cr.kind !== "declassification") throw new Refusal(404, "not-found", "No such declassification request");
      if (cr.status !== "proposed") throw new Refusal(409, "not-proposed", "This change request is no longer open");
      const prop = cr.proposal;
      if (!prop || digest(prop) !== cr.subject_digest.value || !isLane(prop.lane)) throw new Refusal(409, "proposal-mismatch", "The proposal does not match its digest");
      const impact = (await downstreamOf(c, prop.object_kind, prop.object_id)).map((d) => `${d.kind}/${d.id}`);
      if (impact.join("\n") !== cr.impact.join("\n"))
        throw new Refusal(409, "impact-changed", "What depends on this changed since the request was made; propose it again so the impact is current");
      // Same lock order as classification and the claim: the capture row, then its marking.
      if (prop.object_kind === "capture") await c.query("select 1 from captures where id = $1 for update", [prop.object_id]);
      // The approval covers the configured sources it can see now, by lane; one with no lane cannot be covered.
      const configured: { reference: string; lane: DataLane }[] = [];
      if (prop.object_kind === "package")
        for (const [reference, l] of await configuredClosure(c, prop.object_id, ctx.preparationLanes)) {
          if (!l) throw new Refusal(409, "unclassified-source", `${reference} has no data lane in the preparation config; classify it before declassifying what draws on it`);
          configured.push({ reference, lane: l });
        }
      const marking = await declassify(c, prop.object_kind, prop.object_id, prop.version, prop.lane, id, configured);
      // A capture's lane is its own record and may be corrected; a package's signed body never is.
      if (prop.object_kind === "capture")
        await c.query("update captures set body = jsonb_set(body, '{lane}', to_jsonb($2::text)) where id = $1", [prop.object_id, prop.lane]);
      await transition(c, "change_request", id, "approved", actorOf(caller), `declassified to ${prop.lane}`);
      await appendEvent(c, "marking.declassified", `${prop.object_kind}/${prop.object_id}`, actorOf(caller), {
        change_request: id, from_version: prop.version, version: marking.version, lane: prop.lane, impact,
      });
      return marking;
    },
  },

  "budget.set": {
    label: "Set a budget",
    catalog: "admin.budget-set", signature: "direct", need: "policy",
    async run(c, caller, p) {
      const existing = p.budget_id ? await getObject<Record<string, unknown>>(c, "budget", str(p, "budget_id")!) : null;
      if (p.budget_id && (!existing || existing.org_id !== caller.orgId)) throw new Refusal(404, "not-found", "No such budget");
      if (existing) {
        const next = { ...existing };
        for (const k of ["mode", "limit", "period"]) if (p[k] !== undefined) next[k] = p[k];
        checkSchema("Budget.json", next);
        checkBudget(next as never);
        await c.query("update budgets set body = $2 where id = $1", [existing.id, next]);
        await appendEvent(c, "budget.updated", String(existing.id), actorOf(caller), { mode: next.mode, limit: next.limit, period: next.period });
        return next;
      }
      const body = { id: idFor("bud"), org_id: caller.orgId, scope: str(p, "scope")!, scope_id: str(p, "scope_id")!, mode: str(p, "mode")!,
        limit: p.limit, period: str(p, "period")!, status: "active" };
      checkBudget(body as never);
      await recordObject(c, "budget", body as never, actorOf(caller));
      return body;
    },
  },

  "chain.seal": {
    label: "Seal the record",
    // Any active Member may vouch, with their passkey, for the chain as they saw it (specification 11.6).
    catalog: "admin.chain-seal", signature: "direct", need: "member",
    async run(c, caller, p, ctx) {
      if (!ctx.signed || !ctx.assertion) throw new Refusal(403, "signature-required", "A seal needs your passkey");
      return sealChain(c, caller.orgId, caller.memberId, p, { ...ctx.signed, assertion: ctx.assertion }, actorOf(caller));
    },
  },

  "scram.pull": {
    label: "Pull SCRAM",
    // Anyone active may stop the work: stopping is always safe. It is signed and has a reason.
    catalog: "admin.scram-pull", signature: "direct", need: "member",
    async run(c, caller, p, ctx) {
      return pullScram(c, caller.orgId, caller.memberId, p, ctx.assertion, actorOf(caller));
    },
  },

  "scram.review": {
    label: "Review quarantined work",
    catalog: "admin.scram-review", signature: "direct", need: "member",
    async run(c, caller, p, ctx) {
      return reviewQuarantine(c, caller.orgId, caller.memberId, p, ctx.assertion, actorOf(caller));
    },
  },

  "scram.restart": {
    label: "Restart after SCRAM",
    catalog: "admin.scram-restart", signature: "direct", need: "administrator",
    async run(c, caller, p, ctx) {
      return restartAfterScram(c, caller.orgId, caller.memberId, p, ctx.assertion, actorOf(caller));
    },
  },

  "runtime.pin": {
    label: "Pin a runtime version",
    catalog: "admin.runtime-pin", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      return { pins: await pinRuntime(c, caller.orgId, p, actorOf(caller)) };
    },
  },

  "runtime.rollback": {
    label: "Roll back a runtime pin",
    catalog: "admin.runtime-rollback", signature: "direct", need: "administrator",
    async run(c, caller, p) {
      return { pins: await rollbackRuntime(c, caller.orgId, p, actorOf(caller)) };
    },
  },

  "theme.select": {
    label: "Choose the office theme",
    catalog: "admin.theme-select", signature: "none", need: "member",
    async run(c, caller, p, ctx) {
      const themeId = str(p, "theme_id")!;
      const manifest = bundledThemes(ctx.root).get(themeId);
      if (!manifest) throw new Refusal(400, "unknown-theme", "Only bundled office themes can be selected");
      const selection = { theme_id: themeId, manifest_digest: { algorithm: "sha256", value: manifest } };
      checkSchema("OfficeThemeSelection.json", selection);
      // Only the theme changes; a concurrent status change is never overwritten.
      await c.query("update members set body = jsonb_set(body, '{office_theme}', $2::jsonb) where id = $1 and body->>'status' = 'active'", [caller.memberId, selection]);
      await appendEvent(c, "member.theme-selected", caller.memberId, actorOf(caller), selection);
      return selection;
    },
  },
};

/** What a Direct signature covers: the command, the caller and the digest of the exact payload. */
export function adminSubject(name: string, caller: Caller, payload: Record<string, unknown>): string {
  return digest({ command: name, member: caller.memberId, org: caller.orgId, payload });
}

/** The Member a passkey session belongs to. */
export async function callerFor(db: Db | Tx, userName: string): Promise<Caller> {
  const r = await db.query<{ id: string; org_id: string }>("select id, org_id from members where user_name = $1", [userName]);
  if (!r.rows[0]) throw new Refusal(403, "not-a-member", "This passkey belongs to no member");
  return { userName, memberId: r.rows[0].id, orgId: r.rows[0].org_id };
}

/**
 * True until the organization's first administrator qualification is ever issued. Bootstrap then
 * belongs to the first Member and is used up for good; losing administrators later does not reopen it.
 */
export async function needsBootstrap(c: Tx | Db, orgId: string): Promise<boolean> {
  const r = await c.query("select 1 from signer_qualifications where org_id = $1 and body->'authorities' ? 'administrator' limit 1", [orgId]);
  return !r.rowCount;
}


/** Expected database refusals become clear answers instead of server errors. */
function translate(error: unknown): unknown {
  if (error instanceof Refusal) return error;
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "";
  if (code === "23505") return new Refusal(409, "conflict", "That already exists");
  if (code === "23503") return new Refusal(404, "reference-missing", "Something this refers to does not exist in your organization");
  if (code === "23514") return new Refusal(400, "invalid", "That combination is not allowed");
  if (/\.json refused:|ends before it starts|retirement is final|cannot go from/.test(message)) return new Refusal(400, "invalid", message);
  return error;
}

/**
 * Runs an administrative command for a caller. A Direct command must arrive with `signedSubject`,
 * the subject digest its passkey assertion was verified over; anything else refuses.
 */
export async function runAdmin(db: Db, ctx: AdminContext, name: string, caller: Caller, payload: Record<string, unknown>,
  signed: { subject: string; credentialId: string; nonce?: string; assertion?: Record<string, unknown> } | null) {
  if (signed?.nonce) ctx = { ...ctx, signed: { subject: signed.subject, nonce: signed.nonce } };
  if (signed?.assertion) {
    const a = signed.assertion as { id?: unknown; response?: Record<string, unknown> };
    ctx = { ...ctx, assertion: { credential_id: String(a.id ?? ""), authenticator_data: String(a.response?.authenticatorData ?? ""),
      client_data_json: String(a.response?.clientDataJSON ?? ""), signature: String(a.response?.signature ?? "") } };
  }
  const cmd = ADMIN_COMMANDS[name];
  if (!cmd) throw new Refusal(404, "not-found", "No such administrative command");
  if (cmd.signature === "direct") {
    if (signed === null) throw new Refusal(403, "signature-required", "This command needs your passkey");
    if (signed.subject !== adminSubject(name, caller, payload)) throw new Refusal(403, "signature-mismatch", "The signature does not cover this exact request");
  }
  const signedSubject = signed?.subject ?? null;
  return command(db, cmd.catalog, async (c) => {
    // One administrative command at a time per organization: every invariant below (last
    // administrator, last passkey, bootstrap, one approval per change request) holds under it.
    await c.query("select pg_advisory_xact_lock(hashtext('controlrod-admin:' || $1))", [caller.orgId]);
    if (signed) {
      const cred = await currentCredential(c, signed.credentialId);
      if (!cred || cred.revoked || cred.member_id !== caller.memberId) throw new Refusal(403, "signature-revoked", "The passkey that signed this is no longer valid");
    }
    // Bootstrap: until the first administrator exists, the first Member may issue their own qualification.
    const bootstrap = name === "qualification.issue" && payload.member_id === caller.memberId
      && (await needsBootstrap(c, caller.orgId)) && (await firstMemberOf(c, caller.orgId)) === caller.memberId;
    await authorize(c, caller, cmd.need, bootstrap);
    // A bootstrap must create someone able to issue the next qualification, or nobody ever could.
    if (bootstrap) {
      const authorities = Array.isArray(payload.authorities) ? (payload.authorities as unknown[]) : [];
      if (!authorities.includes("administrator") || !authorities.includes("policy"))
        throw new Refusal(409, "bootstrap-authorities",
          "The first qualification must carry both administrator and policy authority, since only they can issue the next one");
    }
    const result = await cmd.run(c, caller, payload, ctx);
    await appendEvent(c, "admin.command", name, actorOf(caller), {
      signature: cmd.signature, ...(signedSubject ? { subject_digest: signedSubject, credential_id: signed!.credentialId } : {}), ...(bootstrap ? { bootstrap: true } : {}),
    });
    return result;
  }).catch((e) => { throw translate(e); });
}

/**
 * Each administrative command as an ActionDescriptor for the caller (plan task 1.11): allowed, or
 * refused with the authority they lack and what would change it. Bootstrap is not shown here; it is
 * a one time path the first Member takes from the setup screen.
 */
export async function adminActions(db: Db, caller: Caller) {
  const me = await member(db, caller.memberId, caller.orgId);
  const held = new Set<string>((await currentQualification(db, caller.memberId))?.authorities ?? []);
  return Object.entries(ADMIN_COMMANDS).map(([name, cmd]) => {
    const base = { command: name, label: cmd.label, signature: cmd.signature, ...(cmd.need === "member" ? {} : { authority: cmd.need.split("+") }) };
    if (me.status !== "active") return { ...base, allowed: false, reason_code: "member-inactive", reason: teach("member-inactive").sentence, change: teach("member-inactive").change };
    // Refused for everyone, whatever their authority: say so rather than offer it.
    if (cmd.unavailable) {
      const t = teach(cmd.unavailable);
      return { ...base, allowed: false, reason_code: cmd.unavailable, reason: t.sentence, change: t.change, ...(t.floor ? { floor: true } : {}) };
    }
    const missing = cmd.need === "member" ? [] : cmd.need.split("+").filter((a) => !held.has(a));
    if (!missing.length) return { ...base, allowed: true };
    const t = teach("authority-missing");
    return { ...base, allowed: false, missing: missing.map((a) => `${a} authority`), reason_code: "authority-missing",
      reason: `This needs ${missing.join(" and ")} authority, which your qualification does not include`, change: t.change };
  });
}

/** Commands and what they need, for the interface. */
export function adminCatalog() {
  return Object.entries(ADMIN_COMMANDS).map(([name, c]) => ({ name, label: c.label, signature: c.signature, need: c.need }));
}
