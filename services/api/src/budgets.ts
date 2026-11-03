import { randomUUID } from "node:crypto";
import type { Db, Tx } from "./db/index.js";
import { type Actor, appendEvent } from "./events.js";
import { Refusal } from "./refusal.js";
import { currentPolicySet } from "./tenancy.js";
import { recordObject, transition } from "./workbench.js";
import { MAX_RUN_EVENTS } from "./work.js";

/**
 * Budgets and usage (workbench specification 26; plan task 5.2). A budget limits use per
 * organization, project or agent baseline over a rolling period, as track, alert or hard cap.
 *
 * Units, and what each can do:
 *  - "minute": agent run time. The only unit Control Rod reserves before dispatch, so the only one a
 *    hard cap may use. Every runtime here is a subscription CLI; spec 26 sizes such a run's reservation
 *    from a time and turn ceiling. No turn ceiling exists, so only time is reserved, and that is said.
 *  - "token": tokens the runtimes report in their usage events. Tracked or alerted on, never capped:
 *    reported provider usage is reconciled later and never trusted alone for a hard limit. A run that
 *    reported nothing makes the total partial, never zero.
 *  - "USD": money. No runtime here reports a cost or has a pinned price schedule, so it is tracked
 *    only, and shown as not reported rather than as zero.
 *
 * Accounting interval: from the claim (the run's started_at) to the control plane's recorded finish.
 * A run's reservation is its ceiling for that interval: the longest the daemon lets it run (its
 * timeout and graceful stop ladder, which it reports), plus one heartbeat (when it learns of a stop)
 * and one lease (when a completion that never arrives makes the run lost). The control plane also
 * asks the run to stop on the graceful path once it has run its ceiling. A finished run settles at its
 * measured interval. A lost run, or one whose outcome is unknown, stays charged in full; once
 * reconciled, it settles charged in full, since nothing measured how long it really ran.
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
const idFor = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;

/** Seconds as minutes, rounded up to the hundredth, so a reservation is never short. */
export const minutesUp = (seconds: number) => (Math.ceil(Math.max(0, seconds) / 0.6) / 100).toFixed(2);
/** A measured interval in minutes, to the hundredth. */
const minutesOf = (ms: number) => (Math.max(0, ms) / 60_000).toFixed(2);
/** Minutes as whole hundredths, the precision every minute in the ledger is kept to. */
const hundredths = (minutes: number | string) => Math.round(Number(minutes) * 100);

/**
 * The share of a limit at which a budget reads as near it, from the organization's approved policy
 * set (setting budget_near_percent, signed by policy authority). Without it, nothing is called near:
 * no model or code chooses the line.
 */
export async function nearShare(q: Db | Tx, orgId: string): Promise<number | null> {
  const v = (await currentPolicySet(q, orgId))?.record.settings?.budget_near_percent;
  return typeof v === "string" && /^[1-9][0-9]?$/.test(v) ? Number(v) / 100 : null;
}

/** A budget period: one whole number of days, weeks, months or years, written as ISO 8601 (P1M). */
export function parsePeriod(period: unknown): { count: number; unit: "D" | "W" | "M" | "Y" } | null {
  const m = typeof period === "string" ? /^P([1-9][0-9]{0,3})([DWMY])$/.exec(period) : null;
  return m ? { count: Number(m[1]), unit: m[2] as "D" | "W" | "M" | "Y" } : null;
}

/**
 * The start of the rolling window a period ends at `now`. Months and years step back by calendar
 * month, keeping the time of day and holding the day of the month at the shorter month's last day
 * (a month back from 31 March is 28 or 29 February, never 3 March).
 */
export function windowStart(period: string, now: Date): Date {
  const p = parsePeriod(period)!;
  if (p.unit === "D" || p.unit === "W") return new Date(now.getTime() - (p.unit === "D" ? 1 : 7) * p.count * 86_400_000);
  const months = p.unit === "M" ? p.count : 12 * p.count;
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), last), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
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

/** For a run a budget holds: that budget, so a view that must not show spend knows these words carry it. */
export const budgetOfHold = (body: Json): { budget_id?: string } =>
  body?.waiting_cause === "budget" && typeof body.waiting_key === "string" && body.waiting_key.startsWith("budget:") ? { budget_id: body.waiting_key.slice(7) } : {};

/** Where a run's use counts: its organization, its project if it has one, and its agent baseline. */
interface RunScope { orgId: string; projectId: string | null; baseline: string }

async function scopeOfRun(q: Db | Tx, run: { role: string; package_id: string }, baseline: string): Promise<RunScope | null> {
  const kind = run.role === "intake" ? "capture" : "package";
  const o = (await q.query<{ org_id: string; project_id: string | null }>(
    "select org_id, project_id from object_owners where object_kind = $1 and object_id = $2", [kind, run.package_id])).rows[0];
  return o ? { orgId: o.org_id, projectId: o.project_id, baseline } : null;
}

/** The active budgets that apply to a run's scope. */
async function applicable(q: Db | Tx, s: RunScope): Promise<Json[]> {
  return (await q.query<{ body: Json }>(
    `select body from budgets where org_id = $1 and body->>'status' = 'active'
       and ((scope = 'organization' and scope_id = $1) or (scope = 'project' and scope_id = $2) or (scope = 'agent' and scope_id = $3))
     order by id`, [s.orgId, s.projectId, s.baseline])).rows.map((r) => r.body);
}

export interface BudgetUse {
  /** Used this window; null when nothing reported it. */
  used: number | null;
  /** Of that, what open reservations hold (at full size) for runs not yet settled. */
  in_flight: number;
  /** Tokens: measured runs in the window that reported no complete token counts, so the total is at least `used`. */
  unreported_runs: number;
  since: string;
}

/**
 * What a budget has used in its current window. Minutes: the measured interval of every run in its
 * scope measured in the window, whether or not anything reserved for it; plus, once per run in its
 * scope that nothing measured, the run's open reservation however old (a run still running, lost or
 * unknown stays charged) or its reservation settled in full in the window, whichever budget holds
 * it, so a budget set while work is in flight counts that work too; a run that no budget reserved
 * for counts at the reservation size it recorded (`reserve_minutes`) until it is measured. Tokens: what runs measured in the
 * window reported, and how many reported no complete counts. Money: nothing reports it.
 */
export async function budgetUse(q: Db | Tx, b: Json, now = new Date()): Promise<BudgetUse> {
  const since = windowStart(b.period, now);
  if (b.limit.unit === "minute") {
    // Measured run time of every run in scope, reserved or not; then, for runs nothing measured, the
    // full reservation: open ones however old, settled ones (charged in full) within the window.
    const r = (await q.query<{ measured: string; open: string; unmeasured: string; unreserved: string }>(
      `with scoped as (
         select r.id from runs r
           join object_owners o on o.object_kind = case when r.role = 'intake' then 'capture' else 'package' end and o.object_id = r.package_id
          where o.org_id = $1 and case $2::text when 'organization' then true when 'project' then o.project_id = $3 else r.body->>'agent_baseline' = $3 end)
       select
         (select coalesce(sum((m.body->'wall_time'->>'value')::numeric), 0) from usage_records m join scoped s on s.id = m.run_id
           where m.body->>'source' = 'measured' and m.recorded_at > $4)::text as measured,
         (select coalesce(sum(amount), 0) from (
            select max((x.body->'amount'->>'value')::numeric) as amount from budget_reservations x join scoped s on s.id = x.run_id
             where x.body->>'status' = 'reserved'
               and not exists (select 1 from usage_records m where m.run_id = x.run_id and m.body->>'source' = 'measured')
             group by x.run_id) o)::text as open,
         (select coalesce(sum(amount), 0) from (
            select max((x.body->'amount'->>'value')::numeric) as amount from budget_reservations x join scoped s on s.id = x.run_id
             where x.body->>'status' = 'settled' and x.recorded_at > $4
               and not exists (select 1 from usage_records m where m.run_id = x.run_id and m.body->>'source' = 'measured')
             group by x.run_id) u)::text as unmeasured,
         (select coalesce(sum((r.body->>'reserve_minutes')::numeric), 0) from runs r join scoped s on s.id = r.id
           where r.status <> 'queued' and r.body ? 'reserve_minutes'
             and not exists (select 1 from budget_reservations x where x.run_id = r.id)
             and not exists (select 1 from usage_records m where m.run_id = r.id and m.body->>'source' = 'measured')
             and (r.status = 'running' or coalesce((r.body->>'finished_at')::timestamptz, now()) > $4))::text as unreserved`,
      [b.org_id, b.scope, b.scope === "organization" ? null : b.scope_id, since])).rows[0]!;
    return { used: Number(r.measured) + Number(r.open) + Number(r.unmeasured) + Number(r.unreserved), in_flight: Number(r.open) + Number(r.unreserved),
      unreported_runs: 0, since: since.toISOString() };
  }
  if (b.limit.unit === "token") {
    const t = (await q.query<{ reported: number; unreported: number; total: string | null }>(
      `select count(*) filter (where complete)::int as reported, count(*) filter (where not complete)::int as unreported,
              sum(case when complete then (rep.body->'input_tokens'->>'value')::numeric + (rep.body->'output_tokens'->>'value')::numeric end)::text as total
         from (select m.run_id, rep.body, (rep.body ? 'input_tokens' and rep.body ? 'output_tokens') is true as complete
                 from usage_records m join runs r on r.id = m.run_id
                 join object_owners o on o.object_kind = case when r.role = 'intake' then 'capture' else 'package' end and o.object_id = r.package_id
                 left join usage_records rep on rep.run_id = m.run_id and rep.body->>'source' = 'reported'
                where m.body->>'source' = 'measured' and m.recorded_at > $4
                  and o.org_id = $1 and case $2::text when 'organization' then true when 'project' then o.project_id = $3 else r.body->>'agent_baseline' = $3 end
              ) rep`,
      [b.org_id, b.scope, b.scope === "organization" ? null : b.scope_id, since])).rows[0]!;
    return { used: t.reported > 0 ? Number(t.total) : null, in_flight: 0, unreported_runs: t.unreported, since: since.toISOString() };
  }
  return { used: null, in_flight: 0, unreported_runs: 0, since: since.toISOString() };
}

/** Whether a run in a budget's scope is running with no reservation and no recorded size, so no cap can account for it. */
async function unsizedInFlight(q: Db | Tx, s: RunScope, b: Json): Promise<boolean> {
  const r = await q.query(
    `select 1 from runs r join object_owners o on o.object_kind = case when r.role = 'intake' then 'capture' else 'package' end and o.object_id = r.package_id
      where r.status = 'running' and not r.body ? 'reserve_minutes' and not exists (select 1 from budget_reservations x where x.run_id = r.id)
        and o.org_id = $1 and case $2::text when 'organization' then true when 'project' then o.project_id = $3 else r.body->>'agent_baseline' = $3 end
      limit 1`, [s.orgId, b.scope, b.scope === "organization" ? null : b.scope_id]);
  return Boolean(r.rowCount);
}

/** A budget's state from its use: over and near only when established, partial or not reported otherwise. */
export function budgetState(b: Json, use: BudgetUse, near: number | null): "within" | "near" | "over" | "partial" | "not-reported" {
  const limit = Number(b.limit.value);
  if (use.used === null) return "not-reported";
  if (use.used >= limit) return "over";
  if (use.unreported_runs > 0) return "partial";
  if (near !== null && use.used >= near * limit) return "near";
  return "within";
}

/**
 * Takes the reservations a run needs before it is dispatched, or says which hard cap holds it. The
 * caller holds the budget lock (taken at the start of the claim, before any event is written), so two
 * dispatches cannot both take the last room. The reservation is the run's ceiling for the accounting
 * interval; with no ceiling reported, a run under a hard cap cannot be sized and is held, not guessed.
 */
export async function reserveForRun(c: Tx, run: { id: string; role: string; package_id: string }, baseline: string,
  ceiling: { runSeconds: number; marginSeconds: number } | undefined):
  Promise<{ held: { budget: string; reason: string } } | { reservedSeconds: number | null }> {
  const scope = await scopeOfRun(c, run, baseline);
  if (!scope) return { reservedSeconds: null };
  const budgets = (await applicable(c, scope)).filter((b) => b.limit.unit === "minute");
  if (!budgets.length) return { reservedSeconds: null };
  const amount = ceiling ? minutesUp(ceiling.runSeconds + ceiling.marginSeconds) : null;
  for (const b of budgets) {
    if (b.mode !== "hard-cap") continue;
    if (await unsizedInFlight(c, scope, b))
      return { held: { budget: b.id, reason: `Held by budget ${b.id}: a run already in flight under it reported no run time ceiling, so what is left under the hard cap is not known until it ends` } };
    if (amount === null)
      return { held: { budget: b.id, reason: `Held by budget ${b.id}: the daemon did not report its run time ceiling, so this run's reservation cannot be sized against the hard cap` } };
    const { used } = await budgetUse(c, b);
    // In whole hundredths of a minute, the ledger's precision, so a reservation that exactly fills a cap fits.
    if (hundredths(used ?? 0) + hundredths(amount) > Math.floor(Number(b.limit.value) * 100 + 1e-6))
      return { held: { budget: b.id, reason: `Held by budget ${b.id}: reserving this run's ${amount} minute ceiling would take it past its hard cap of ${b.limit.value} minutes in ${b.period} (${(used ?? 0).toFixed(2)} used or reserved)` } };
  }
  if (amount === null) return { reservedSeconds: null };
  for (const b of budgets)
    await recordObject(c, "budget_reservation", { id: idFor("bres"), org_id: scope.orgId, budget_id: b.id, run_id: run.id,
      amount: { value: amount, unit: "minute" }, status: "reserved" } as never, SYSTEM);
  return { reservedSeconds: ceiling!.runSeconds };
}

/**
 * Records usage for every finished run that has none yet, whether or not a budget reserved for it,
 * and settles reservations. A run that finished with a known outcome is measured: its interval from
 * claim to recorded finish, bounded by its reservation where it has one, and the tokens its usage events reported (a token field some events lack
 * is left out, never summed as zero). A lost run is never measured. Reservations: a run that never
 * started releases them; a run with an unknown, unreconciled outcome keeps them open; otherwise they
 * settle, at the measured interval where there is one and in full where there is not. Idempotent.
 */
export async function settleEnded(c: Tx, batch = 500): Promise<void> {
  // The budget lock, so two sweeps never both measure one run (and claims never size against a half-settled ledger).
  await c.query("select pg_advisory_xact_lock(hashtext('controlrod-budget'))");
  const finished = (await c.query<{ id: string; org_id: string; body: Json }>(
    `select r.id, o.org_id, r.body from runs r join object_owners o on o.object_kind = 'run' and o.object_id = r.id
      where r.status in ('succeeded', 'failed', 'stopped') and r.body ? 'started_at' and r.body ? 'finished_at'
        and not r.body ? 'outcome_unknown'
        and not exists (select 1 from usage_records u where u.run_id = r.id and u.body->>'source' = 'measured')
      order by r.created_at, r.id limit $1`, [batch])).rows;
  for (const r of finished) {
    const ms = Date.parse(r.body.finished_at) - Date.parse(r.body.started_at);
    if (Number.isNaN(ms)) continue;
    // The accounting deadline: a reserved run cannot have run past its reservation (the daemon stops
    // it at its ceiling, and the reservation adds a heartbeat and a lease), so a finish recorded later
    // (a completion accepted after a controller outage) is controller delay, and settles at the
    // reservation, in full, never above it.
    const reserved = (await c.query<{ v: string | null }>(
      "select max((body->'amount'->>'value')::numeric)::text as v from budget_reservations where run_id = $1", [r.id])).rows[0]!.v;
    const minutes = reserved !== null && Number(minutesOf(ms)) > Number(reserved) ? reserved : minutesOf(ms);
    await recordObject(c, "usage_record", { id: idFor("use"), org_id: r.org_id, run_id: r.id, source: "measured",
      wall_time: { value: minutes, unit: "minute" } } as never, SYSTEM);
    await recordReportedUsage(c, r.id, r.org_id);
  }
  const open = (await c.query<{ run_id: string; body: Json }>(
    `select distinct x.run_id, r.body from budget_reservations x join runs r on r.id = x.run_id
      where x.body->>'status' = 'reserved' and r.status not in ('queued', 'running')
        and (not r.body ? 'outcome_unknown' or r.body ? 'reconciliation') order by x.run_id limit $1`, [batch])).rows;
  for (const r of open) {
    const reservations = (await c.query<{ id: string }>(
      "select id from budget_reservations where run_id = $1 and body->>'status' = 'reserved' order by id for update", [r.run_id])).rows;
    const never = !r.body.started_at;
    for (const x of reservations)
      await transition(c, "budget_reservation", x.id, never ? "released" : "settled", SYSTEM,
        never ? "the run never ran" : r.body.outcome_unknown ? "reconciled with no measured run time: charged in full" : "settled at its measured run time");
  }
}

/**
 * The tokens a run's events reported, once. Where the runtime reported the whole run's counts (a
 * cumulative usage event, such as Claude's result), the last of those is the run's total and the
 * steps' counts are not added to it; otherwise the steps are summed. Only fields every counted event
 * carried are recorded, and nothing is recorded when any event was lost.
 */
async function recordReportedUsage(c: Tx, runId: string, orgId: string): Promise<void> {
  if ((await c.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'reported'", [runId])).rowCount) return;
  // Usage events lost on the way (the daemon's admission dropped some, or the run passed the most
  // events one run keeps, after which a notice follows) leave every total unknown: no report is
  // recorded, so the run counts as reporting none and token use reads as at least what others reported.
  const lost = await c.query("select 1 from run_events where run_id = $1 and (body->>'kind' = 'dropped' or seq > $2) limit 1", [runId, MAX_RUN_EVENTS]);
  if (lost.rowCount) return;
  const t = (await c.query<{ n: number; ni: number; no: number; nk: number; i: string | null; o: string | null; k: string | null }>(
    `with usage as (select seq, body from run_events where run_id = $1 and body->>'kind' = 'usage'),
          counted as (
            select body from usage where (body->>'cumulative')::boolean is true and seq = (select max(seq) from usage where (body->>'cumulative')::boolean is true)
            union all
            select body from usage where not exists (select 1 from usage where (body->>'cumulative')::boolean is true))
     select count(*)::int as n,
            count(body->'input_tokens')::int as ni, count(body->'output_tokens')::int as no, count(body->'cached_tokens')::int as nk,
            sum((body->>'input_tokens')::numeric)::text as i, sum((body->>'output_tokens')::numeric)::text as o, sum((body->>'cached_tokens')::numeric)::text as k
       from counted`, [runId])).rows[0]!;
  if (!t.n) return;
  const field = (count: number, sum: string | null) => (count === t.n && sum !== null ? { value: sum, unit: "token" } : undefined);
  const input = field(t.ni, t.i);
  const output = field(t.no, t.o);
  const cached = field(t.nk, t.k);
  await recordObject(c, "usage_record", { id: idFor("use"), org_id: orgId, run_id: runId, source: "reported",
    ...(input ? { input_tokens: input } : {}), ...(output ? { output_tokens: output } : {}), ...(cached ? { cache_read_tokens: cached } : {}) } as never, SYSTEM);
}

/** Every budget of an organization with what it has used in its current window, for Usage and the Spend lens. */
export async function budgetStatuses(q: Db | Tx, orgId: string, now = new Date()) {
  const near = await nearShare(q, orgId);
  const budgets = (await q.query<{ body: Json }>("select body from budgets where org_id = $1 and body->>'status' <> 'retired' order by id", [orgId])).rows.map((r) => r.body);
  const out = [];
  for (const b of budgets) {
    const use = await budgetUse(q, b, now);
    out.push({ budget: b, ...use, state: budgetState(b, use, near) });
  }
  return out;
}

/** Records that a budget crossed into near or over, once per window, so alert budgets reach people. */
export async function noteBudgetCrossings(c: Tx, orgId: string): Promise<void> {
  for (const s of await budgetStatuses(c, orgId)) {
    // A suspended budget governs nothing, so it alerts no one.
    if (s.budget.status !== "active" || (s.state !== "near" && s.state !== "over")) continue;
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
  // Per runtime: measured runs, and how many of them reported tokens.
  const telemetry = (await db.query<{ runtime: string; runs: number; reported: number }>(
    `select r.body->'runtime'->>'provider' as runtime, count(*)::int as runs,
            count(*) filter (where exists (select 1 from usage_records u where u.run_id = r.id and u.body->>'source' = 'reported'))::int as reported
       from runs r join usage_records m on m.run_id = r.id and m.body->>'source' = 'measured'
      where m.org_id = $1 group by 1 order by 1`, [orgId])).rows;
  return { budgets, records, telemetry, near_share: await nearShare(db, orgId) };
}
