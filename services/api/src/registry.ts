import { currentFloor } from "./authority.js";
import type { Db } from "./db/index.js";

/**
 * The organization's administrative records, as they stand, for the Policies and Administration
 * screens (plan task 5.4; specification 12): each Member's current qualification, every passkey's
 * current record, delegations with whether each was revoked, repository bindings, change requests
 * waiting on approval, and budgets. Read only; every change goes through a signed command. What any
 * Member may already know is shown to every Member; license numbers, reasons and attestation evidence
 * are not shown at all, and passkeys are an administrator's to see, or one's own.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

/** Whether a qualification, as it stands, carries administrator authority. */
export const isAdministrator = (q: { revoked?: boolean; authorities?: string[] } | null | undefined): boolean =>
  Boolean(q && q.revoked !== true && q.authorities?.includes("administrator"));

export async function adminRegistry(db: Db, viewer: { orgId: string; memberId: string; administrator: boolean }) {
  const orgId = viewer.orgId;
  const rows = async (sql: string) => (await db.query<{ body: Json }>(sql, [orgId])).rows.map((r) => r.body);
  const qualifications = (await rows(
    "select distinct on (member_id) body from signer_qualifications where org_id = $1 order by member_id, version desc"))
    .map((q) => ({ org_id: q.org_id, member_id: q.member_id, version: q.version, roles: q.roles ?? [], authorities: q.authorities ?? [],
      grades: q.grades ?? [], disciplines: q.disciplines ?? [], revoked: q.revoked === true }));
  const credentials = (await db.query<{ body: Json; registered_at: Date }>(
    `select * from (select distinct on (a.credential_id) a.body, c.created_at as registered_at
                      from authenticator_credentials a join credentials c on c.id = a.credential_id
                     where a.org_id = $1 order by a.credential_id, a.version desc) k
      where $2::text is null or k.body->>'member_id' = $2`, [orgId, viewer.administrator ? null : viewer.memberId])).rows
    .map(({ body: c, registered_at }) => ({ id: c.id, org_id: c.org_id, member_id: c.member_id, credential_id: c.credential_id,
      revoked: c.revoked === true, registered_at: registered_at.toISOString() }));
  // Whether each meets the hardware key floor under the policy in force now, as signing decides it.
  const credentialsNow = [];
  for (const c of credentials) credentialsNow.push({ ...c, hardware: (await currentFloor(db, c.credential_id)).eligible });
  const delegations = (await db.query<{ body: Json; revoked: boolean }>(
    `select d.body, exists (select 1 from delegation_revocations r where r.delegation_id = d.id) as revoked
       from delegations d where d.org_id = $1 order by d.recorded_at desc, d.id`, [orgId])).rows
    .map(({ body: d, revoked }) => ({ id: d.id, org_id: d.org_id, from_member_id: d.from_member_id, to_member_id: d.to_member_id, role: d.role,
      ...(d.project_id ? { project_id: d.project_id } : {}), ...(d.discipline ? { discipline: d.discipline } : {}),
      starts_on: d.starts_on, ends_on: d.ends_on, revoked }));
  const bindings = await rows("select body from repo_bindings where org_id = $1 order by created_at, id");
  const changeRequests = await rows(
    "select body from change_requests where org_id = $1 and body->>'status' = 'proposed' order by recorded_at, id");
  const budgets = await rows("select body from budgets where org_id = $1 and body->>'status' <> 'retired' order by id");
  return { qualifications, credentials: credentialsNow, delegations, bindings, change_requests: changeRequests, budgets };
}
