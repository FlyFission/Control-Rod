import { randomUUID } from "node:crypto";
import type { Db, Tx } from "./db/index.js";
import { type Actor, appendEvent } from "./events.js";
import { Refusal } from "./refusal.js";
import { recordObject, transition } from "./workbench.js";

/**
 * Budgets and usage (workbench specification 26; plan task 5.2). A budget limits use per
 * organization, project or agent baseline, over a rolling period, as track, alert or hard cap.
 *
 * Units, and what each can do:
 *  - "minute": agent run time. The only unit Control Rod can reserve before dispatch, so the only
 *    one a hard cap may use. Every runtime here is a subscription CLI, so a run's reservation is its
 *    time ceiling: the run timeout the daemon reports, after which the daemon stops it on its graceful
 *    stop path. No turn ceiling exists, so none is reserved or claimed.
 *  - "token": tokens the runtimes report in their usage events. Tracked or alerted on, never capped:
 *    reported provider usage is reconciled later and never trusted alone for a hard limit.
 *  - "USD": money. No runtime here reports a cost or has a pinned price schedule, so it is tracked
 *    only, and shown as not reported rather than as zero.
 *
 * A reservation is taken for every applicable minute budget at dispatch. A dispatch whose reservation
 * would take a hard cap past its limit is held with a teaching reason. A finished run settles at its
 * measured run time, recorded as a UsageRecord; until then it counts at its full reservation. A lost
 * run, or one whose outcome is unknown, stays charged in full until it is reconciled.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

export const BUDGET_UNITS = {
  minute: { capped: true, words: "minutes of agent run time" },
  token: { capped: false, words: "tokens the runtimes report" },
  USD: { capped: false, words: "US dollars" },
} as const;
export type BudgetUnit = keyof typeof BUDGET_UNITS;

const SYSTEM: Actor = { kind: "system", id: "control-plane" };
/** The share of a limit at which a budget reads as near it: a display choice for the Usage page and Spend lens, not an engineering value. */
export const NEAR_SHARE = 0.8;
const idFor = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
/** Minutes, kept to two decimal places as a Quantity's text value. */
const minutes = (ms: number) => (Math.max(0, ms) / 60_000).toFixed(2);

/** A budget period: one whole number of days, weeks, months or years, written as ISO 8601 (P1M). */
export function parsePeriod(period: unknown): { count: number; unit: "D" | "W" | "M" | "Y" } | null {
  const m = typeof period === "string" ? /^P([1-9][0-9]{0,3})([DWMY])$/.exec(period) : null;
  return m ? { count: Number(m[1]), unit: m[2] as "D" | "W" | "M" | "Y" } : null;
}

/** The start of the rolling window a period ends at `now`. */
export function windowStart(period: string, now: Date): Date {
  const p = parsePeriod(period)!;
  const d = new Date(now);
  if (p.unit === "D") d.setUTCDate(d.getUTCDate() - p.count);
  if (p.unit === "W") d.setUTCDate(d.getUTCDate() - 7 * p.count);
  if (p.unit === "M") d.setUTCMonth(d.getUTCMonth() - p.count);
  if (p.unit === "Y") d.setUTCFullYear(d.getUTCFullYear() - p.count);
  return d;
}

/** Refuses a budget Control Rod could not honour: an unknown unit or period, or a cap on a unit it cannot reserve. */
export function checkBudget(b: { mode: string; limit: Json; period: string }): void {
  const unit = b.limit?.unit;
  if (!(unit in BUDGET_UNITS)) throw new Refusal(400, "invalid", "A budget's unit is minute (agent run time), token or USD");
  if (typeof b.limit?.value !== "string" || !/^[0-9]+(\.[0-9]+)?$/.test(b.limit.value) || Number(b.limit.value) <= 0)
    throw new Refusal(400, "invalid", "A budget's limit is a positive number");
  if (!parsePeriod(b.period)) throw new Refusal(400, "invalid", "A budget's period is a whole number of days, weeks, months or years, such as P1M");
  if (b.mode === "hard-cap" && !BUDGET_UNITS[unit as BudgetUnit].capped)
    throw new Refusal(400, "cap-unenforceable", `A hard cap needs a unit Control Rod reserves before work starts; ${BUDGET_UNITS[unit as BudgetUnit].words} cannot be, so track or alert on them instead`);
}

/** Where a run's use counts: its organization, its project if it has one, and its agent baseline. */
export interface RunScope { orgId: string; projectId: string | null; baseline: string }

async function scopeOfRun(q: Db | Tx, run: { id: string; role: string; package_id: string; baseline?: string | null }): Promise<RunScope | null> {
  const kind = run.role === "intake" ? "capture" : "package";
  const o = (await q.query<{ org_id: string; project_id: string | null }>(
    "select org_id, project_id from object_owners where object_kind = $1 and object_id = $2", [kind, run.package_id])).rows[0];
  return o ? { orgId: o.org_id, projectId: o.project_id, baseline: run.baseline ?? "" } : null;
}

/** The active budgets that apply to a run's scope. */
async function applicable(q: Db | Tx, s: RunScope): Promise<Json[]> {
  return (await q.query<{ body: Json }>(
    `select body from budgets where org_id = $1 and body->>'status' = 'active'
       and ((scope = 'organization' and scope_id = $1) or (scope = 'project' and scope_id = $2) or (scope = 'agent' and scope_id = $3))
     order by id`, [s.orgId, s.projectId, s.baseline])).rows.map((r) => r.body);
}

/** The runs a budget covers, as a SQL condition on a runs row aliased r (with owners o) and parameters from $2. */
const COVERS = `o.org_id = $1 and case $2::text
     when 'organization' then true
     when 'project' then o.project_id = $3
     else r.body->>'agent_baseline' = $3 end`;

/**
 * What a budget has used in its current window. Minutes: each reservation taken in the window, at its
 * measured run time once settled and at its full size until then. Tokens: what runs settled in the
 * window reported. Money: nothing reports it, so it is not known.
 */
export async function budgetUse(q: Db | Tx, b: Json, now = new Date()): Promise<{ used: number | null; in_flight: number; since: string }> {
  const since = windowStart(b.period, now);
  if (b.limit.unit === "minute") {
    const r = (await q.query<{ settled: string | null; open: string | null }>(
      `select coalesce(sum(case when x.body->>'status' = 'settled' then (u.body->'wall_time'->>'value')::numeric end), 0)::text as settled,
              coalesce(sum(case when x.body->>'status' = 'reserved' then (x.body->'amount'->>'value')::numeric end), 0)::text as open
         from budget_reservations x
         left join usage_records u on u.run_id = x.run_id and u.body->>'source' = 'measured'
        where x.budget_id = $1 and x.recorded_at > $2`, [b.id, since])).rows[0]!;
    return { used: Number(r.settled) + Number(r.open), in_flight: Number(r.open), since: since.toISOString() };
  }
  if (b.limit.unit === "token") {
    const r = (await q.query<{ n: string }>(
      `select coalesce(sum(coalesce((u.body->'input_tokens'->>'value')::numeric, 0) + coalesce((u.body->'output_tokens'->>'value')::numeric, 0)), 0)::text as n
         from usage_records u join runs r on r.id = u.run_id join object_owners o on o.object_kind = case when r.role = 'intake' then 'capture' else 'package' end and o.object_id = r.package_id
        where u.body->>'source' = 'reported' and u.recorded_at > $4 and ${COVERS}`,
      [b.org_id, b.scope, b.scope === "organization" ? null : b.scope_id, since])).rows[0]!;
    return { used: Number(r.n), in_flight: 0, since: since.toISOString() };
  }
  return { used: null, in_flight: 0, since: since.toISOString() };
}

/**
 * Takes the reservations a run needs before it is dispatched, or says which hard cap holds it. The
 * reservation is the run's time ceiling; with no ceiling reported, a run under a hard cap cannot be
 * sized and is held rather than let through.
 */
export async function reserveForRun(c: Tx, run: { id: string; role: string; package_id: string }, baseline: string, ceilingSeconds: number | undefined):
  Promise<{ budget: string; reason: string } | null> {
  const scope = await scopeOfRun(c, { ...run, baseline });
  if (!scope) return null;
  const budgets = (await applicable(c, scope)).filter((b) => b.limit.unit === "minute");
  if (!budgets.length) return null;
  // One reservation decision at a time per organization, so two dispatches cannot both fit the last room.
  await c.query("select pg_advisory_xact_lock(hashtext('controlrod-budget:' || $1))", [scope.orgId]);
  const ceiling = ceilingSeconds && ceilingSeconds > 0 ? Number((ceilingSeconds / 60).toFixed(2)) : null;
  for (const b of budgets) {
    if (b.mode !== "hard-cap") continue;
    if (ceiling === null)
      return { budget: b.id, reason: `Held by budget ${b.id}: the daemon did not report its run time ceiling, so this run's reservation cannot be sized against the hard cap` };
    const { used } = await budgetUse(c, b);
    if ((used ?? 0) + ceiling > Number(b.limit.value))
      return { budget: b.id, reason: `Held by budget ${b.id}: reserving this run's ${ceiling} minute ceiling would take it past its hard cap of ${b.limit.value} minutes in ${b.period} (${(used ?? 0).toFixed(2)} used or reserved)` };
  }
  if (ceiling === null) return null;
  for (const b of budgets)
    await recordObject(c, "budget_reservation", { id: idFor("bres"), org_id: scope.orgId, budget_id: b.id, run_id: run.id,
      amount: { value: ceiling.toFixed(2), unit: "minute" }, status: "reserved" } as never, SYSTEM);
  return null;
}

/**
 * Settles every reservation whose run has finished with a known outcome: records the run's measured
 * run time (and any tokens it reported) as usage, then marks its reservations settled. A run that
 * never started has its reservations released. Lost runs and runs whose outcome is unknown stay
 * reserved, charged in full, until reconciled. Safe to call again: settled runs are skipped.
 */
export async function settleEnded(c: Tx): Promise<number> {
  const open = (await c.query<{ run_id: string; org_id: string; status: string; body: Json }>(
    `select distinct x.run_id, x.org_id, r.status, r.body from budget_reservations x join runs r on r.id = x.run_id
      where x.body->>'status' = 'reserved' and r.status not in ('queued', 'running')
      order by x.run_id`)).rows;
  let settled = 0;
  for (const r of open) {
    const unknown = r.body.outcome_unknown && !r.body.reconciliation;
    if (unknown) continue;
    const started = Date.parse(r.body.started_at ?? "");
    const finished = Date.parse(r.body.finished_at ?? r.body.reconciliation?.at ?? "");
    const reservations = (await c.query<{ id: string }>(
      "select id from budget_reservations where run_id = $1 and body->>'status' = 'reserved' order by id for update", [r.run_id])).rows;
    if (Number.isNaN(started) || Number.isNaN(finished)) {
      for (const x of reservations) await transition(c, "budget_reservation", x.id, "released", SYSTEM, "the run never ran");
      continue;
    }
    if (!(await c.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'measured'", [r.run_id])).rowCount)
      await recordObject(c, "usage_record", { id: idFor("use"), org_id: r.org_id, run_id: r.run_id, source: "measured",
        wall_time: { value: minutes(finished - started), unit: "minute" } } as never, SYSTEM);
    await recordReportedUsage(c, r.run_id, r.org_id);
    for (const x of reservations) await transition(c, "budget_reservation", x.id, "settled", SYSTEM, "settled at measured run time");
    settled++;
  }
  return settled;
}

/** The tokens a run's events reported, once, as a reported UsageRecord. Nothing reported, nothing recorded. */
async function recordReportedUsage(c: Tx, runId: string, orgId: string): Promise<void> {
  if ((await c.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'reported'", [runId])).rowCount) return;
  const t = (await c.query<{ n: number; i: string; o: string; k: string }>(
    `select count(*)::int as n, coalesce(sum((body->>'input_tokens')::numeric), 0)::text as i, coalesce(sum((body->>'output_tokens')::numeric), 0)::text as o,
            coalesce(sum((body->>'cached_tokens')::numeric), 0)::text as k
       from run_events where run_id = $1 and body->>'kind' = 'usage'`, [runId])).rows[0]!;
  if (!t.n) return;
  await recordObject(c, "usage_record", { id: idFor("use"), org_id: orgId, run_id: runId, source: "reported",
    input_tokens: { value: t.i, unit: "token" }, output_tokens: { value: t.o, unit: "token" }, cache_read_tokens: { value: t.k, unit: "token" } } as never, SYSTEM);
}

/** Every budget of an organization with what it has used in its current window, for Usage and the Spend lens. */
export async function budgetStatuses(q: Db | Tx, orgId: string, now = new Date()) {
  const budgets = (await q.query<{ body: Json }>("select body from budgets where org_id = $1 and body->>'status' <> 'retired' order by id", [orgId])).rows.map((r) => r.body);
  const out = [];
  for (const b of budgets) {
    const use = await budgetUse(q, b, now);
    const limit = Number(b.limit.value);
    out.push({
      budget: b, ...use,
      // How far along, in words a person reads, never a guessed number when use is not reported.
      state: use.used === null ? "not-reported" : use.used >= limit ? "over" : use.used >= NEAR_SHARE * limit ? "near" : "within",
    });
  }
  return out;
}

/** Records that a budget crossed into near or over, once per window, so alert budgets reach people. */
export async function noteBudgetCrossings(c: Tx, orgId: string): Promise<void> {
  for (const s of await budgetStatuses(c, orgId)) {
    if (s.state !== "near" && s.state !== "over") continue;
    // Once per window: the window rolls, so a crossing already recorded within it is the same crossing.
    const seen = await c.query(
      "select 1 from events where body->>'type' = 'budget.crossed' and body->>'subject' = $1 and body->'data'->>'state' = $2 and (body->>'at')::timestamptz > $3::timestamptz limit 1",
      [s.budget.id, s.state, s.since]);
    if (seen.rowCount) continue;
    await appendEvent(c, "budget.crossed", s.budget.id, SYSTEM, { state: s.state, since: s.since, used: String(s.used), limit: s.budget.limit.value, unit: s.budget.limit.unit, mode: s.budget.mode });
  }
}

/**
 * The Usage view (plan task 5.2): every budget with its use this window, the latest usage records, and
 * for each runtime whether it reports tokens at all, so missing telemetry reads as missing, not zero.
 */
export async function usageView(db: Db, orgId: string) {
  const budgets = await budgetStatuses(db, orgId);
  const records = (await db.query<{ body: Json; recorded_at: Date; package_id: string; role: string; runtime: string | null; baseline: string | null }>(
    `select u.body, u.recorded_at, r.package_id, r.role, r.body->'runtime'->>'provider' as runtime, r.body->>'agent_baseline' as baseline
       from usage_records u join runs r on r.id = u.run_id
      where u.org_id = $1 order by u.recorded_at desc, u.id desc limit 50`, [orgId])).rows
    .map((x) => ({ ...x.body, recorded_at: x.recorded_at.toISOString(), package_id: x.package_id, role: x.role, runtime: x.runtime, baseline: x.baseline }));
  // Per runtime: finished runs, and how many of them reported any tokens.
  const telemetry = (await db.query<{ runtime: string; runs: number; reported: number }>(
    `select r.body->'runtime'->>'provider' as runtime, count(*)::int as runs,
            count(*) filter (where exists (select 1 from usage_records u where u.run_id = r.id and u.body->>'source' = 'reported'))::int as reported
       from runs r join object_owners o on o.object_kind = 'run' and o.object_id = r.id
      where o.org_id = $1 and r.status not in ('queued', 'running') and exists (select 1 from usage_records u where u.run_id = r.id and u.body->>'source' = 'measured')
      group by 1 order by 1`, [orgId])).rows;
  return { budgets, records, telemetry, near_share: NEAR_SHARE };
}
