import type { Db, Tx } from "./db/index.js";
import type { components } from "./preparation/schema.js";
import { Refusal } from "./refusal.js";

type Run = components["schemas"]["ControlRod.Records.Run"];

const OWNED_RUNS = `from runs r
  join object_owners r_owner on r_owner.object_kind = 'run'
    and r_owner.object_id = r.id and r_owner.org_id = $1
  join object_owners subject_owner on subject_owner.object_id = r.package_id
    and subject_owner.object_kind = case when r.role = 'intake' then 'capture' else 'package' end
    and subject_owner.org_id = r_owner.org_id`;
const RUN_SCOPE = "where r.package_id = $2 and r.id = $3";

function missingRun(): never {
  throw new Refusal(404, "not-found", "No such run");
}

type RunIdentity = { id: string; package_revision: number; role: Run["role"] };

/** The run and its subject must both belong to the caller's organization. */
export async function requireOwnedRun(db: Db | Tx, orgId: string, packageId: string, runId: string): Promise<RunIdentity> {
  const result = await db.query<RunIdentity>(
    `select r.id, r.package_revision, r.role ${OWNED_RUNS} ${RUN_SCOPE}`,
    [orgId, packageId, runId],
  );
  return result.rows[0] ?? missingRun();
}

/** Return an exact attempt regardless of which revision is current. */
export async function runDetail(db: Db, orgId: string, packageId: string, runId: string): Promise<Run> {
  const { rows } = await db.query<RunIdentity & { body: Run; status: Run["status"] }>(
    `select r.id, r.package_revision, r.role, r.body, r.status ${OWNED_RUNS} ${RUN_SCOPE}`,
    [orgId, packageId, runId],
  );
  const row = rows[0] ?? missingRun();
  return { ...row.body, id: row.id, package_id: packageId, package_revision: row.package_revision, role: row.role, status: row.status };
}
