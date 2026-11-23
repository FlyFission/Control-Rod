import type { Db, Tx } from "./db/index.js";
import type { components } from "./preparation/schema.js";
import { Refusal } from "./refusal.js";

type Run = components["schemas"]["ControlRod.Records.Run"];
type ActiveRunSummary = components["schemas"]["ActiveRunSummary"];

const OWNED_RUNS = `from runs r
  join object_owners r_owner on r_owner.object_kind = 'run'
    and r_owner.object_id = r.id and r_owner.org_id = $1
  join object_owners subject_owner on subject_owner.object_id = r.package_id
    and subject_owner.object_kind = case when r.role = 'intake' then 'capture' else 'package' end
    and subject_owner.org_id = r_owner.org_id`;
const RUN_SCOPE = "where r.package_id = $2 and r.id = $3";
const ACTIVE_RUNS = "where r.status in ('queued', 'running') order by r.created_at, r.id limit 200";
const RUN_EVENT_PAGE_LIMIT = 2000;
/** Match the existing run label's display budget in spec/work.tsp. */
const SUMMARY_TITLE_LIMIT = 120;
const INT32_MAX = 0x7fffffff;

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

export async function runLogLines(db: Db, orgId: string, packageId: string, runId: string): Promise<string[]> {
  const { rows } = await db.query<{ log: string[] }>(
    `select r.log ${OWNED_RUNS} ${RUN_SCOPE}`, [orgId, packageId, runId],
  );
  return (rows[0] ?? missingRun()).log;
}

export type RunEventQuery = { after?: string; before?: string; recent?: string; limit?: string };

function integerParam(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Refusal(400, "invalid", `${name} must be a whole number from ${min} to ${max}`);
  return parsed;
}

/** Return chronological records for the latest window, an older window, or a forward delta. */
export async function runEvents(db: Db, orgId: string, packageId: string, runId: string, query: RunEventQuery) {
  await requireOwnedRun(db, orgId, packageId, runId);

  const after = integerParam(query.after, "after", 0, INT32_MAX);
  const before = integerParam(query.before, "before", 1, INT32_MAX);
  const limit = integerParam(query.limit, "limit", 1, RUN_EVENT_PAGE_LIMIT) ?? RUN_EVENT_PAGE_LIMIT;
  if (query.recent !== undefined && query.recent !== "true" && query.recent !== "false")
    throw new Refusal(400, "invalid", "recent must be true or false");
  const recent = query.recent === "true";
  if ((after !== undefined && before !== undefined) || (recent && (after !== undefined || before !== undefined)))
    throw new Refusal(400, "invalid", "Choose at most one of after, before, or recent");

  const select = "select seq, body from run_events where run_id = $1";
  const backwards = before !== undefined || recent;
  const pgQuery = before !== undefined
    ? { text: `${select} and seq < $2 order by seq desc limit $3`, values: [runId, before, limit] }
    : recent
      ? { text: `${select} order by seq desc limit $2`, values: [runId, limit] }
      : { text: `${select} and seq > $2 order by seq limit $3`, values: [runId, after ?? 0, limit] };
  const { rows } = await db.query<{ seq: number; body: unknown }>(pgQuery);
  if (backwards) rows.reverse();
  return { events: rows.map(({ seq, body }) => ({ seq, event: body })) };
}

/** Retain the full run body at the existing endpoint. */
export async function activeRuns(db: Db, orgId: string): Promise<Run[]> {
  const { rows } = await db.query<{ body: Run; status: Run["status"] }>(
    `select r.body, r.status ${OWNED_RUNS} ${ACTIVE_RUNS}`, [orgId],
  );
  return rows.map(({ body, status }) => ({ ...body, status }));
}

/** One bounded workspace list using titles from each attempt's recorded package revision. */
export async function activeRunSummaries(db: Db, orgId: string): Promise<ActiveRunSummary[]> {
  const { rows } = await db.query<ActiveRunSummary & { title: string | null }>(
    `select r.id, r.package_id, r.package_revision, r.role, r.status,
        r.body->'runtime' as runtime, left(p.body->>'title', $2) as title,
        r.body->>'label' as label, r.body->>'waiting_reason' as waiting_reason,
        r.body->>'waiting_cause' as waiting_cause, r.body->>'stop_requested_at' as stop_requested_at
      ${OWNED_RUNS}
      left join packages p on r.role <> 'intake' and p.id = r.package_id and p.revision = r.package_revision
      ${ACTIVE_RUNS}`,
    [orgId, SUMMARY_TITLE_LIMIT],
  );
  return rows.map(({ title, label, waiting_reason, waiting_cause, stop_requested_at, ...row }) => ({
    ...row,
    ...(title ? { title } : {}),
    ...(label ? { label } : {}),
    ...(waiting_reason ? { waiting_reason } : {}),
    ...(waiting_cause ? { waiting_cause } : {}),
    ...(stop_requested_at ? { stop_requested_at } : {}),
  }));
}
