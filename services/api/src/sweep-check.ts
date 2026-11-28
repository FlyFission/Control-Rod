import type { Db } from "./db/index.js";
import { pendingCrossings } from "./budgets.js";

/**
 * Whether the lost-run sweep has anything to do, read without locks. The sweep takes the SCRAM gate
 * and the budget lock, so a page load that called it every time would queue behind claims and
 * completions even when nothing had lapsed. Each test here matches one step of sweepLost: a lapsed
 * lease, a run past its budget ceiling, a finished run not yet measured, a reservation ready to
 * settle, and a budget crossing not yet recorded.
 */
export async function sweepNeeded(db: Db): Promise<boolean> {
  const r = await db.query<{ due: boolean }>(
    `select
       exists (select 1 from runs where status = 'running' and lease_expires_at < now())
    or exists (select 1 from runs where status = 'running' and body ? 'budget_ceiling_seconds' and not body ? 'stop_requested_at'
                 and (body->>'started_at')::timestamptz + make_interval(secs => (body->>'budget_ceiling_seconds')::int) < now())
    or exists (select 1 from runs r join object_owners o on o.object_kind = 'run' and o.object_id = r.id
                where r.status in ('succeeded', 'failed', 'stopped') and r.body ? 'started_at' and r.body ? 'finished_at'
                  and not r.body ? 'outcome_unknown'
                  and not exists (select 1 from usage_records u where u.run_id = r.id and u.body->>'source' = 'measured'))
    or exists (select 1 from budget_reservations x join runs r on r.id = x.run_id
                where x.body->>'status' = 'reserved' and r.status not in ('queued', 'running')
                  and (not r.body ? 'started_at' or (r.body ? 'outcome_unknown' and r.body ? 'reconciliation')
                       or exists (select 1 from usage_records m where m.run_id = x.run_id and m.body->>'source' = 'measured')))
       as due`);
  if (r.rows[0]?.due) return true;
  const orgs = (await db.query<{ org_id: string }>("select distinct org_id from budgets where body->>'status' = 'active' order by org_id")).rows;
  for (const { org_id } of orgs) if ((await pendingCrossings(db, org_id)).length > 0) return true;
  return false;
}
