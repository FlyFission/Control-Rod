import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { settleEnded } from "../src/budgets.js";
import { MAX_RUN_EVENTS } from "../src/work.js";
import { command } from "../src/commands/executor.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** Budgets, reservations and the usage ledger (workbench plan task 5.2; specification 26, WB-21). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;
/** The daemon's run ceiling: its 45 minute timeout and its 12 second graceful stop ladder. */
const CEILING = 45 * 60 + 12;
/** The control plane's margins on it: one heartbeat and one lease (the harness keeps the defaults). */
const MARGIN = 30 + 90;
/** The reservation: the ceiling and its margins, in minutes rounded up to the hundredth. */
const RESERVED = (Math.ceil((CEILING + MARGIN) / 0.6) / 100).toFixed(2);

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
const get = async (url: string) => h.app.inject({ method: "GET", url, headers: { cookie } });
const daemon = (url: string, payload: Json) => h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: withClaim(url, payload) });
/** The daemon asks for work, reporting its run time ceiling, or (null) reporting none. */
const claim = (ceiling: number | null = CEILING) =>
  h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: ["fake"], ...(ceiling === null ? {} : { run_ceiling_seconds: ceiling }) } });
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
const org = async () => (await h.db.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
const run = async (id: string) => (await h.db.query<{ status: string; body: Json }>("select status, body from runs where id = $1", [id])).rows[0]!;
const reservations = async (runId: string) => (await h.db.query<{ body: Json }>("select body from budget_reservations where run_id = $1 order by id", [runId])).rows.map((r) => r.body);

/** Queues one author run; unless `alongside`, everything else queued or running is stopped first. */
async function queued(id: string, alongside = false) {
  // Stopped as a run really stops: a running one records its finish, so it is measured, not charged in full.
  if (!alongside) await h.admin.query(
    `update runs set status = 'stopped', body = body || jsonb_build_object('status', 'stopped')
       || case when body ? 'started_at' then jsonb_build_object('finished_at', to_jsonb(now()::text)) else '{}'::jsonb end
     where status in ('queued', 'running')`);
  // And is settled, as the sweep would before the next dispatch.
  if (!alongside) await sweep();
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'released', $2)",
    [id, { ...example, id, revision: 0, status: "released", data_lane: "internal", design_inputs: [] }]);
  const r = { schema_version: "0.1.0", id: `R-${id.slice(-8).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(), generation: 1 };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [r.id, id, r]);
  return r.id;
}
async function claimed(id: string) {
  const runId = await queued(id);
  const res = await claim();
  expect(res.statusCode, res.body || String((await run(runId)).body.waiting_reason)).toBe(200);
  expect(res.json().run.id).toBe(runId);
  claims.set(runId, res.json().claim.token);
  return runId;
}
const budget = async (b: Json) => {
  const r = await signed("budget.set", b);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const retire = async (id: string) => h.admin.query("update budgets set body = jsonb_set(body, '{status}', '\"retired\"') where id = $1", [id]);
const sweep = async () => { await get("/office"); };

describe("setting a budget", () => {
  it("refuses a hard cap on anything Control Rod cannot reserve before work starts, and malformed limits and periods", async () => {
    const o = await org();
    const base = { scope: "organization", scope_id: o, period: "P1M" };
    expect((await signed("budget.set", { ...base, mode: "hard-cap", limit: { value: "100", unit: "USD" } })).json().code).toBe("cap-unenforceable");
    expect((await signed("budget.set", { ...base, mode: "hard-cap", limit: { value: "100000", unit: "token" } })).json().code).toBe("cap-unenforceable");
    expect((await signed("budget.set", { ...base, mode: "track", limit: { value: "100", unit: "EUR" } })).json().code).toBe("invalid");
    expect((await signed("budget.set", { ...base, mode: "track", limit: { value: "0", unit: "minute" } })).json().code).toBe("invalid");
    expect((await signed("budget.set", { ...base, mode: "track", limit: { value: "10", unit: "minute" }, period: "1 month" })).json().code).toBe("invalid");
    // Tracking or alerting on money and tokens is fine; a cap on run time is fine.
    for (const b of [{ ...base, mode: "track", limit: { value: "100", unit: "USD" } }, { ...base, mode: "alert", limit: { value: "100000", unit: "token" } }])
      await retire((await budget(b)).id);
  });
});

describe("a hard cap on run time", () => {
  it("reserves each dispatched run's ceiling, and holds a dispatch that would pass the cap, saying why, for someone with policy authority", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "60", unit: "minute" }, period: "P1D" });
    const first = await claimed("WP-BUD-ONE");
    expect(await reservations(first)).toEqual([expect.objectContaining({ budget_id: cap.id, amount: { value: RESERVED, unit: "minute" }, status: "reserved" })]);
    // The run carries the ceiling its reservation was sized from.
    expect((await run(first)).body.budget_ceiling_seconds).toBe(CEILING);
    // One reservation is held while the first run runs; another would pass 60.
    const second = await queued("WP-BUD-TWO", true);
    expect((await run(first)).status).toBe("running");
    expect((await claim()).statusCode).toBe(204);
    const held = await run(second);
    expect(held.status).toBe("queued");
    expect(held.body).toMatchObject({ waiting_cause: "budget", waiting_key: `budget:${cap.id}` });
    expect(held.body.waiting_reason).toBe(`Held by budget ${cap.id}: reserving this run's ${RESERVED} minute ceiling would take it past its hard cap of 60 minutes in P1D (${RESERVED} used or reserved)`);
    // The package was not moved on for a run that did not start.
    expect((await h.db.query<{ status: string }>("select status from packages where id = 'WP-BUD-TWO' order by revision desc limit 1")).rows[0]!.status).toBe("released");
    expect(await reservations(second)).toEqual([]);
    await retire(cap.id);
    // With the cap gone, the held run is dispatched and its hold cleared.
    const res = await claim();
    expect(res.json().run.id).toBe(second);
    expect((await run(second)).body.waiting_cause).toBeUndefined();
    claims.set(second, res.json().claim.token);
  });

  it("holds a run under a hard cap when the daemon did not report its ceiling, rather than guess", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const id = await queued("WP-BUD-NOCEIL");
    expect((await claim(null)).statusCode).toBe(204);
    expect((await run(id)).body.waiting_reason).toMatch(/did not report its run time ceiling/);
    const res = await claim();
    expect(res.json().run.id).toBe(id);
    claims.set(id, res.json().claim.token);
    await retire(cap.id);
  });
});

describe("settlement", () => {
  it("settles a finished run at its measured run time, records reported tokens, and frees the cap for what it did not use", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "60", unit: "minute" }, period: "P1D" });
    const id = await claimed("WP-BUD-SETTLE");
    const cursor = (await get("/inbox")).json().digest.head;
    // The run reports usage events, then completes.
    const log = await daemon(`/runner/runs/${id}/log`, { lines: [], events: [{ kind: "usage", at: new Date().toISOString(), input_tokens: 1200, output_tokens: 300, cached_tokens: 50 }], events_from: 0 });
    expect(log.statusCode, log.body).toBe(200);
    const done = await daemon(`/runner/runs/${id}/complete`, { status: "succeeded", outputs: [{ name: "calc.md", content_base64: b64("x") }] });
    expect(done.statusCode, done.body).toBe(200);
    // Until settled it counts in full; the sweep settles it.
    await sweep();
    expect((await reservations(id)).map((r) => r.status)).toEqual(["settled"]);
    const usage = (await h.db.query<{ body: Json }>("select body from usage_records where run_id = $1 order by body->>'source'", [id])).rows.map((r) => r.body);
    expect(usage).toEqual([
      expect.objectContaining({ source: "measured", wall_time: expect.objectContaining({ unit: "minute" }) }),
      expect.objectContaining({ source: "reported", input_tokens: { value: "1200", unit: "token" }, output_tokens: { value: "300", unit: "token" }, cache_read_tokens: { value: "50", unit: "token" } }),
    ]);
    expect(Number(usage[0]!.wall_time.value)).toBeLessThan(1);
    // The Inbox digest reports it since the person last looked.
    const digest = (await get(`/inbox?since=${cursor}`)).json().digest.lines.find((l: Json) => l.topic === "spend");
    expect(digest.text).toMatch(/^1 run settled, 0\.\d\d minutes of agent run time\.$/);
    // Settling again changes nothing.
    await sweep();
    expect((await h.db.query("select 1 from usage_records where run_id = $1", [id])).rowCount).toBe(2);
    // The cap now counts the measured minutes, not the 45 reserved, so another run fits.
    const next = await claimed("WP-BUD-AFTER");
    expect((await reservations(next))[0]).toMatchObject({ status: "reserved" });
    await retire(cap.id);
  });

  it("keeps a lost run charged in full; reconciled, it settles in full, never as measured", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const id = await claimed("WP-BUD-LOST");
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [id]);
    await sweep();
    expect((await run(id)).status).toBe("lost");
    expect((await reservations(id)).find((r) => r.budget_id === cap.id)).toMatchObject({ status: "reserved", amount: { value: RESERVED } });
    const before = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === cap.id);
    expect(before.in_flight).toBeGreaterThanOrEqual(Number(RESERVED));
    // Reconciled: settled, still charged in full, and no measured usage, since nothing measured it.
    const lost = (await run(id)).body;
    await h.admin.query("update runs set body = $2 where id = $1", [id, { ...lost, reconciliation: { disposition: "process-gone", recorded_at: new Date().toISOString() } }]);
    await sweep();
    expect((await reservations(id)).find((r) => r.budget_id === cap.id)).toMatchObject({ status: "settled" });
    expect((await h.db.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'measured'", [id])).rowCount).toBe(0);
    const after = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === cap.id);
    expect(after.used).toBeGreaterThanOrEqual(Number(RESERVED));
    await retire(cap.id);
  });

  it("records usage for every finished run, with no budget at all", async () => {
    const id = await claimed("WP-BUD-NOBUDGET");
    const done = await daemon(`/runner/runs/${id}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] });
    expect(done.statusCode, done.body).toBe(200);
    await sweep();
    expect((await h.db.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'measured'", [id])).rowCount).toBe(1);
    expect(await reservations(id)).toEqual([]);
  });

  it("counts measured run time against a minute budget that reserved nothing for it", async () => {
    const t = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const runId = await queued("WP-BUD-NORESERVE");
    // A daemon that reports no ceiling: a track budget lets it run, unreserved.
    const res = await claim(null);
    expect(res.json().run.id).toBe(runId);
    claims.set(runId, res.json().claim.token);
    expect(await reservations(runId)).toEqual([]);
    await h.admin.query("update runs set body = jsonb_set(body, '{started_at}', to_jsonb((now() - interval '6 minutes')::text)) where id = $1", [runId]);
    const done = await daemon(`/runner/runs/${runId}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] });
    expect(done.statusCode, done.body).toBe(200);
    await sweep();
    const measured = (await h.db.query<{ v: string }>("select body->'wall_time'->>'value' as v from usage_records where run_id = $1 and body->>'source' = 'measured'", [runId])).rows[0]!.v;
    expect(Number(measured)).toBeGreaterThanOrEqual(6);
    const use = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === t.id);
    expect(use.used).toBeGreaterThanOrEqual(Number(measured));
    expect(use.in_flight).toBe(0);
    await retire(t.id);
  });

  it("measures a run once when two sweeps race", async () => {
    const id = await claimed("WP-BUD-TWOSWEEP");
    const done = await daemon(`/runner/runs/${id}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] });
    expect(done.statusCode, done.body).toBe(200);
    await Promise.all([command(h.db, "run.sweep-lost", (c) => settleEnded(c)), command(h.db, "run.sweep-lost", (c) => settleEnded(c))]);
    expect((await h.db.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'measured'", [id])).rowCount).toBe(1);
  });

  it("settles finished runs queued behind a full batch of runs whose outcome is still unknown", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    // Sorted first: a lost run nobody has reconciled, which must stay charged.
    const stuck = await claimed("WP-BUD-AAAAAAAA");
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [stuck]);
    await sweep();
    expect((await run(stuck)).status).toBe("lost");
    const later = await claimed("WP-BUD-ZZZZZZZZ");
    const done = await daemon(`/runner/runs/${later}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] });
    expect(done.statusCode, done.body).toBe(200);
    // A batch of one: the unknown run must not take the only place.
    await command(h.db, "run.sweep-lost", (c) => settleEnded(c, 1));
    expect((await reservations(later)).map((r) => r.status)).toEqual(["settled"]);
    expect((await reservations(stuck)).map((r) => r.status)).toEqual(["reserved"]);
    await retire(cap.id);
  });

  it("settles a finish recorded past its reservation at the reservation, never above it", async () => {
    const t = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "6000", unit: "minute" }, period: "P1D" });
    const id = await claimed("WP-BUD-LATE");
    // As if the controller was away two hours and accepted the completion on recovery.
    await h.admin.query("update runs set body = jsonb_set(body, '{started_at}', to_jsonb((now() - interval '2 hours')::text)) where id = $1", [id]);
    const done = await daemon(`/runner/runs/${id}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] });
    expect(done.statusCode, done.body).toBe(200);
    await sweep();
    const wall = (await h.db.query<{ v: string }>("select body->'wall_time'->>'value' as v from usage_records where run_id = $1 and body->>'source' = 'measured'", [id])).rows[0]!.v;
    expect(wall).toBe(RESERVED);
    await retire(t.id);
  });

  it("never records a second measured record for a run, even written directly", async () => {
    const id = await claimed("WP-BUD-ONCE");
    const done = await daemon(`/runner/runs/${id}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] });
    expect(done.statusCode, done.body).toBe(200);
    await sweep();
    const one = (await h.admin.query<{ body: Json }>("select body from usage_records where run_id = $1 and body->>'source' = 'measured'", [id])).rows[0]!.body;
    await expect(h.admin.query("insert into usage_records (body) values ($1)", [{ ...one, id: "use_dup" }])).rejects.toThrow(/usage_records_once/);
  });

  it("counts a reported zero as reported, and a run whose usage events were lost as reporting none", async () => {
    const at = new Date().toISOString();
    const zero = await claimed("WP-BUD-ZERO");
    expect((await daemon(`/runner/runs/${zero}/log`, { lines: [], events: [{ kind: "usage", at, input_tokens: 5, output_tokens: 0 }], events_from: 0 })).statusCode).toBe(200);
    expect((await daemon(`/runner/runs/${zero}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] })).statusCode).toBe(200);
    await sweep();
    const reported = (await h.db.query<{ body: Json }>("select body from usage_records where run_id = $1 and body->>'source' = 'reported'", [zero])).rows[0]!.body;
    expect(reported).toMatchObject({ input_tokens: { value: "5" }, output_tokens: { value: "0" } });
    // The daemon's admission dropped some events: no total is known, so none is recorded.
    const gap = await claimed("WP-BUD-GAP");
    const events = [{ kind: "usage", at, input_tokens: 9, output_tokens: 4 }, { kind: "dropped", at, dropped: 3 }];
    expect((await daemon(`/runner/runs/${gap}/log`, { lines: [], events, events_from: 0 })).statusCode).toBe(200);
    expect((await daemon(`/runner/runs/${gap}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] })).statusCode).toBe(200);
    await sweep();
    expect((await h.db.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'reported'", [gap])).rowCount).toBe(0);
    expect((await h.db.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'measured'", [gap])).rowCount).toBe(1);
  });

  it("takes a runtime's cumulative usage as the run's total, never adding the steps to it", async () => {
    const at = new Date().toISOString();
    const id = await claimed("WP-BUD-CUMUL");
    // Claude: two steps, then the result's totals for the whole run.
    const events = [{ kind: "usage", at, input_tokens: 100, output_tokens: 10 }, { kind: "usage", at, input_tokens: 150, output_tokens: 20 },
      { kind: "usage", at, input_tokens: 250, output_tokens: 30, cumulative: true }];
    expect((await daemon(`/runner/runs/${id}/log`, { lines: [], events, events_from: 0 })).statusCode).toBe(200);
    expect((await daemon(`/runner/runs/${id}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] })).statusCode).toBe(200);
    await sweep();
    const reported = (await h.db.query<{ body: Json }>("select body from usage_records where run_id = $1 and body->>'source' = 'reported'", [id])).rows[0]!.body;
    expect(reported).toMatchObject({ input_tokens: { value: "250" }, output_tokens: { value: "30" } });
  });

  it("keeps a token report for a run that ended exactly at the event limit, and drops it past the limit", async () => {
    const at = new Date().toISOString();
    const fill = (runId: string, upTo: number) => h.admin.query(
      `insert into run_events (run_id, seq, body) select $1, g, case when g = 1 then $2::jsonb else $3::jsonb end from generate_series(1, $4) g`,
      [runId, { kind: "usage", at, input_tokens: 7, output_tokens: 3 }, { kind: "message", at, text: "x" }, upTo]);
    const exact = await claimed("WP-BUD-EXACT");
    await fill(exact, MAX_RUN_EVENTS);
    expect((await daemon(`/runner/runs/${exact}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] })).statusCode).toBe(200);
    const past = await claimed("WP-BUD-PAST");
    await fill(past, MAX_RUN_EVENTS + 1);
    expect((await daemon(`/runner/runs/${past}/complete`, { status: "succeeded", outputs: [{ name: "a.md", content_base64: b64("a") }] })).statusCode).toBe(200);
    await sweep();
    const reports = async (runId: string) => (await h.db.query("select 1 from usage_records where run_id = $1 and body->>'source' = 'reported'", [runId])).rowCount;
    expect(await reports(exact)).toBe(1);
    expect(await reports(past)).toBe(0);
  });

  it("asks a run that has run its reserved ceiling to stop, on the graceful path", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const id = await claimed("WP-BUD-LONG");
    const body = (await run(id)).body;
    await h.admin.query("update runs set body = $2 where id = $1", [id, { ...body, started_at: new Date(Date.now() - (CEILING + 5) * 1000).toISOString() }]);
    // While another transaction holds the run (a completion or heartbeat in flight), the sweep passes it by.
    const other = await h.admin.connect();
    try {
      await other.query("begin");
      await other.query("select 1 from runs where id = $1 for update", [id]);
      await sweep();
      expect((await run(id)).body.stop_requested_at).toBeUndefined();
      await other.query("commit");
    } finally {
      other.release();
    }
    await sweep();
    expect((await run(id)).body).toMatchObject({ stop_requested_by: "its budget ceiling", label: "Stopping" });
    expect((await daemon(`/runner/runs/${id}/log`, { lines: [] })).json().stop).toBe(true);
    await retire(cap.id);
  });
});

describe("tracking, alerting and the Usage view", () => {
  it("counts reported tokens against a token budget, records a crossing once per window, and shows money as not reported", async () => {
    const o = await org();
    const tokens = await budget({ scope: "organization", scope_id: o, mode: "alert", limit: { value: "1000", unit: "token" }, period: "P1D" });
    const money = await budget({ scope: "organization", scope_id: o, mode: "track", limit: { value: "50", unit: "USD" }, period: "P1M" });
    const roomy = await budget({ scope: "organization", scope_id: o, mode: "track", limit: { value: "1000000000", unit: "token" }, period: "P1D" });
    await sweep();
    await sweep();
    const view = (await get("/usage")).json();
    const t = view.budgets.find((b: Json) => b.budget.id === tokens.id);
    expect(t.used).toBeGreaterThanOrEqual(1500);
    expect(t.state).toBe("over");
    // Other finished runs reported no tokens: the total is at least what was reported, never complete.
    expect(t.unreported_runs).toBeGreaterThan(0);
    const r = view.budgets.find((b: Json) => b.budget.id === roomy.id);
    expect(r).toMatchObject({ state: "partial" });
    expect(r.used).toBeGreaterThanOrEqual(1500);
    const m = view.budgets.find((b: Json) => b.budget.id === money.id);
    expect(m).toMatchObject({ used: null, state: "not-reported" });
    const crossings = (await h.db.query("select 1 from events where body->>'type' = 'budget.crossed' and body->>'subject' = $1", [tokens.id])).rowCount;
    expect(crossings).toBe(1);
    expect(view.records.some((r: Json) => r.source === "reported")).toBe(true);
    expect(view.telemetry).toEqual(expect.arrayContaining([expect.objectContaining({ runtime: "fake" })]));
    // No policy draws the near line, so nothing is called near.
    expect(view.near_share).toBeNull();
    // Each agent on the floor carries its tightest budget, the token budget it is over; never while presenting.
    await queued("WP-BUD-FLOOR");
    const floor = (await get("/office/figures")).json();
    const f = floor.figures.find((x: Json) => x.package_id === "WP-BUD-FLOOR");
    expect(f.spend).toMatchObject({ budget_id: tokens.id, unit: "token", mode: "alert", state: "over" });
    expect(Number(f.spend.used)).toBeGreaterThanOrEqual(1500);
    const presenting = (await get("/office/figures?presenting=true")).json();
    expect(presenting.figures.every((x: Json) => x.spend === undefined)).toBe(true);
    await retire(tokens.id);
    await retire(money.id);
    await retire(roomy.id);
  });

  it("calls a budget near only where the approved policy draws the line", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "alert", limit: { value: "10", unit: "minute" }, period: "P1D" });
    // Some use: a run dispatched under it reserves its ceiling. Far below a large limit: within.
    await h.admin.query("update budgets set body = jsonb_set(body, '{limit,value}', '\"1000\"') where id = $1", [cap.id]);
    await claimed("WP-BUD-NEAR");
    const use = async () => (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === cap.id);
    const used = (await use()).used as number;
    expect((await use()).state).toBe("within");
    // A limit just above the use, and a policy that draws the line at half: near.
    await h.admin.query("update budgets set body = jsonb_set(body, '{limit,value}', to_jsonb($2::text)) where id = $1", [cap.id, String(Math.ceil(used) + 1)]);
    const proposed = await post("/admin/commands/policy.propose", { payload: { policy: { hardware_attestation_formats: [], settings: { budget_near_percent: "50" } }, reason: "Alert budgets at half" } });
    expect(proposed.statusCode, proposed.body).toBe(200);
    expect((await signed("policy.approve", { change_request_id: proposed.json().id })).statusCode).toBe(200);
    const v = (await get("/usage")).json();
    expect(v.near_share).toBe(0.5);
    expect(v.budgets.find((b: Json) => b.budget.id === cap.id).state).toBe("near");
    expect((await signed("policy.approve", { change_request_id: proposed.json().id })).json().code).toBe("not-proposed");
    await retire(cap.id);
  });

  it("applies a project budget only to that project's runs, and an agent budget only to that baseline", async () => {
    const project = (await signed("project.create", { name: "Budget project", mode: "software", default_rigor: "standard", lanes: ["internal"], qa_overlays: [] })).json().id;
    const projectCap = await budget({ scope: "project", scope_id: project, mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const agentCap = await budget({ scope: "agent", scope_id: "author-fake", mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const outside = await claimed("WP-BUD-OUTSIDE");
    const ids = (await reservations(outside)).map((r) => r.budget_id);
    expect(ids).toContain(agentCap.id);
    expect(ids).not.toContain(projectCap.id);
    await retire(projectCap.id);
    await retire(agentCap.id);
  });
});

describe("calendar windows", () => {
  it("steps back a month to the shorter month's last day, and across leap years", async () => {
    const { windowStart } = await import("../src/budgets.js");
    const at = (iso: string) => new Date(iso);
    expect(windowStart("P1M", at("2026-03-31T10:00:00.000Z")).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(windowStart("P1M", at("2028-03-31T10:00:00.000Z")).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(windowStart("P1Y", at("2028-02-29T10:00:00.000Z")).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(windowStart("P3M", at("2026-05-31T00:00:00.000Z")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(windowStart("P2W", at("2026-03-15T00:00:00.000Z")).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("presenting and racing", () => {
  it("never shows a budget hold's spend while presenting, on any path", async () => {
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "1", unit: "minute" }, period: "P1D" });
    const id = await queued("WP-BUD-PRESENT");
    expect((await claim()).statusCode).toBe(204);
    expect((await run(id)).body.waiting_cause).toBe("budget");
    const text = (await get("/office/figures?presenting=true")).body;
    expect(text).not.toContain("Held by budget");
    expect(text).not.toContain(cap.id);
    expect(JSON.parse(text).figures.find((f: Json) => f.package_id === "WP-BUD-PRESENT").cause).toBe("Author run is held by a budget; spend is not shown while presenting");
    // Not presenting, the figure names the holding budget.
    const plain = (await get("/office/figures")).json().figures.find((f: Json) => f.package_id === "WP-BUD-PRESENT");
    expect(plain.spend.budget_id).toBe(cap.id);
    await retire(cap.id);
  });

  it("records no crossing for a suspended budget", async () => {
    const live = await budget({ scope: "organization", scope_id: await org(), mode: "alert", limit: { value: "100000", unit: "minute" }, period: "P1D" });
    const paused = await budget({ scope: "organization", scope_id: await org(), mode: "alert", limit: { value: "0.01", unit: "minute" }, period: "P1D" });
    await h.admin.query("update budgets set body = jsonb_set(body, '{status}', '\"suspended\"') where id = $1", [paused.id]);
    // Earlier runs measured today put it past its limit; suspended, it alerts no one.
    expect((await get("/usage")).json().budgets.find((b: Json) => b.budget.id === paused.id).state).toBe("over");
    await sweep();
    expect((await h.db.query("select 1 from events where body->>'type' = 'budget.crossed' and body->>'subject' = $1", [paused.id])).rowCount).toBe(0);
    await retire(live.id);
    await retire(paused.id);
  });

  it("never lets a suspended budget drive a figure's spend", async () => {
    const live = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "600", unit: "minute" }, period: "P1D" });
    const paused = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "1", unit: "minute" }, period: "P1D" });
    await h.admin.query("update budgets set body = jsonb_set(body, '{status}', '\"suspended\"') where id = $1", [paused.id]);
    await queued("WP-BUD-SUSPENDED");
    const fig = (await get("/office/figures")).json().figures.find((f: Json) => f.package_id === "WP-BUD-SUSPENDED");
    expect(fig.spend.budget_id).toBe(live.id);
    // Usage still lists it.
    expect((await get("/usage")).json().budgets.map((b: Json) => b.budget.id)).toContain(paused.id);
    await retire(live.id);
    await retire(paused.id);
  });

  it("counts work already in flight against a hard cap set after it was dispatched", async () => {
    const before = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "100000", unit: "minute" }, period: "P1D" });
    const running = await claimed("WP-BUD-INFLIGHT");
    expect((await reservations(running)).map((r) => r.budget_id)).toEqual([before.id]);
    const used = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === before.id).used as number;
    // Room for one ceiling over everything so far, the running run's included: another run must not fit.
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: (used + 1).toFixed(2), unit: "minute" }, period: "P1D" });
    const after = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === cap.id);
    expect(after.in_flight).toBeGreaterThanOrEqual(Number(RESERVED));
    const next = await queued("WP-BUD-INFLIGHT-2", true);
    expect((await claim()).statusCode).toBe(204);
    expect((await run(next)).body.waiting_cause).toBe("budget");
    await retire(cap.id);
    await retire(before.id);
  });

  it("counts a run dispatched before any minute budget existed at its recorded size, and holds behind a run of unknown size", async () => {
    // No minute budget: nothing is reserved, but the run records what a reservation would take.
    const sized = await claimed("WP-BUD-PRE");
    expect(await reservations(sized)).toEqual([]);
    expect((await run(sized)).body.reserve_minutes).toBe(RESERVED);
    const probe = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "100000", unit: "minute" }, period: "P1D" });
    const seen = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === probe.id);
    expect(seen.in_flight).toBeGreaterThanOrEqual(Number(RESERVED));
    await retire(probe.id);
    // A run of unknown size in flight: a hard cap cannot know what is left, so it holds.
    const unsized = await queued("WP-BUD-UNSIZED", true);
    const res = await claim(null);
    expect(res.json().run.id).toBe(unsized);
    claims.set(unsized, res.json().claim.token);
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: "100000", unit: "minute" }, period: "P1D" });
    const next = await queued("WP-BUD-BEHINDUNK", true);
    expect((await claim()).statusCode).toBe(204);
    expect((await run(next)).body.waiting_reason).toMatch(/a run already in flight under it reported no run time ceiling/);
    await retire(cap.id);
  });

  it("admits a run whose reservation fills a hard cap exactly", async () => {
    await queued("WP-BUD-EXACTFILL-A");
    const probe = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "100000", unit: "minute" }, period: "P1D" });
    const used = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === probe.id).used as number;
    await retire(probe.id);
    // Three reservations' worth over today's use: in floating point, 47.2 three times passes 141.6.
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: (used + 3 * Number(RESERVED)).toFixed(2), unit: "minute" }, period: "P1D" });
    for (const id of ["WP-BUD-EXACTFILL-B", "WP-BUD-EXACTFILL-C"]) await queued(id, true);
    for (let i = 0; i < 3; i++) expect((await claim()).statusCode).toBe(200);
    expect((await h.db.query("select 1 from budget_reservations where body->>'budget_id' = $1", [cap.id])).rowCount).toBe(3);
    await retire(cap.id);
  });

  it("lets only one of two racing dispatches take a hard cap's last room", async () => {
    await queued("WP-BUD-RACE-A");
    await queued("WP-BUD-RACE-B", true);
    // Room for exactly one more reservation over what earlier runs used today.
    const probe = await budget({ scope: "organization", scope_id: await org(), mode: "track", limit: { value: "100000", unit: "minute" }, period: "P1D" });
    const used = (await get("/usage")).json().budgets.find((b: Json) => b.budget.id === probe.id).used as number;
    await retire(probe.id);
    const cap = await budget({ scope: "organization", scope_id: await org(), mode: "hard-cap", limit: { value: (used + Number(RESERVED) + 1).toFixed(2), unit: "minute" }, period: "P1D" });
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 204]);
    expect((await h.db.query("select 1 from budget_reservations where body->>'budget_id' = $1", [cap.id])).rowCount).toBe(1);
    await retire(cap.id);
  });
});
