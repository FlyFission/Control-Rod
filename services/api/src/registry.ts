import type { Db } from "./db/index.js";

/**
 * The organization's administrative records, as they stand, for the Policies and Administration
 * screens (plan task 5.4; specification 12): each Member's current qualification, every passkey's
 * current record, delegations with whether each was revoked, repository bindings, change requests
 * waiting on approval, and budgets. Read only; every change goes through a signed command.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

export async function adminRegistry(db: Db, orgId: string) {
  const rows = async (sql: string) => (await db.query<{ body: Json }>(sql, [orgId])).rows.map((r) => r.body);
  const qualifications = await rows(
    "select distinct on (member_id) body from signer_qualifications where org_id = $1 order by member_id, version desc");
  const credentials = (await db.query<{ body: Json; registered_at: Date }>(
    `select distinct on (a.credential_id) a.body, c.created_at as registered_at
       from authenticator_credentials a join credentials c on c.id = a.credential_id
      where a.org_id = $1 order by a.credential_id, a.version desc`, [orgId])).rows
    .map((r) => ({ ...r.body, registered_at: r.registered_at.toISOString() }));
  const delegations = (await db.query<{ body: Json; revoked: boolean }>(
    `select d.body, exists (select 1 from delegation_revocations r where r.delegation_id = d.id) as revoked
       from delegations d where d.org_id = $1 order by d.recorded_at desc, d.id`, [orgId])).rows
    .map((r) => ({ ...r.body, revoked: r.revoked }));
  const bindings = await rows("select body from repo_bindings where org_id = $1 order by created_at, id");
  const changeRequests = await rows(
    "select body from change_requests where org_id = $1 and body->>'status' = 'proposed' order by recorded_at, id");
  const budgets = await rows("select body from budgets where org_id = $1 and body->>'status' <> 'retired' order by id");
  return { qualifications, credentials, delegations, bindings, change_requests: changeRequests, budgets };
}
