import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, ORIGIN, VirtualAuthenticator, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** Run supervision (workbench plan tasks 2.1 to 2.4; specification 22, WB-10). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
const daemon = (url: string, payload: Json) => h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: withClaim(url, payload) });
const run = async (id: string) => (await h.db.query<{ status: string; body: Json }>("select status, body from runs where id = $1", [id])).rows[0]!;
const receipt = (generation = 1, pid = 4242) => ({ pid, pgid: pid, process_start: "123456", boot_id: "boot-1", generation, started_at: new Date().toISOString(), containment: "cgroup", unit: `controlrod-run-x-g${generation}` });
/** Reading the office runs the sweep first, as the app does before showing anything. */
const sweep = async () => { await h.app.inject({ method: "GET", url: "/office", headers: { cookie } }); };

/** A released package with a queued author run, claimed by the local runtime. Returns the job. */
async function claimed(id: string) {
  await h.admin.query("update runs set status = 'stopped' where status = 'queued'");
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'released', $2)",
    [id, { ...example, id, revision: 0, status: "released", data_lane: "internal", design_inputs: [] }]);
  const r = { schema_version: "0.1.0", id: `R-${id.slice(-8).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(), generation: 1 };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [r.id, id, r]);
  const res = await h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: ["fake"] } });
  expect(res.statusCode, res.body).toBe(200);
  const job = res.json();
  claims.set(job.run.id, job.claim.token);
  return job;
}
const expire = (runId: string, ago = "1 second") => h.admin.query(`update runs set lease_expires_at = now() - interval '${ago}' where id = $1`, [runId]);

describe("ownership receipts", () => {
  it("records the spawn receipt once, and refuses another receipt or another attempt's", async () => {
    const job = await claimed("WP-SUP-RCPT");
    expect(job.run.generation).toBe(1);
    const ok = await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: receipt() });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await run(job.run.id)).body.receipt).toMatchObject({ pid: 4242, boot_id: "boot-1", generation: 1 });
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: receipt() })).statusCode).toBe(200);
    const other = await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: receipt(1, 9999) });
    expect(other.json().code).toBe("receipt-mismatch");
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: receipt(2) })).json().code).toBe("receipt-mismatch");
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: { pid: 1 } })).statusCode).toBe(400);
  });
});

describe("outcome unknown and reconcile", () => {
  it("holds requeue on a lost run until the daemon's receipt evidence settles it", async () => {
    const job = await claimed("WP-SUP-LOST");
    await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: receipt() });
    await expire(job.run.id);
    await sweep();
    const lost = await run(job.run.id);
    expect(lost.status).toBe("lost");
    expect(lost.body.outcome_unknown.reason).toMatch(/stopped renewing the lease/);
    const blocked = await post(`/packages/WP-SUP-LOST/runs/${job.run.id}/requeue`, {});
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "outcome-unknown" });
    expect(blocked.json().change).toMatch(/Restart the daemon/);

    const wrong = await daemon(`/runner/runs/${job.run.id}/evidence`, { observation: "process-gone", receipt: receipt(1, 777) });
    expect(wrong.json().code).toBe("receipt-mismatch");
    const ok = await daemon(`/runner/runs/${job.run.id}/evidence`, { observation: "process-gone", receipt: receipt() });
    expect(ok.json()).toEqual({ run_id: job.run.id, reconciled: true });
    expect((await run(job.run.id)).body.reconciliation).toMatchObject({ disposition: "process-gone", by: { kind: "agent" } });
    expect((await daemon(`/runner/runs/${job.run.id}/evidence`, { observation: "process-gone", receipt: receipt() })).json().reconciled).toBe(false);

    const rq = await post(`/packages/WP-SUP-LOST/runs/${job.run.id}/requeue`, {});
    expect(rq.statusCode, rq.body).toBe(201);
    expect(rq.json().generation).toBe(2);
  });

  it("retires a still-running run at once when its daemon restarted and found the process gone", async () => {
    const job = await claimed("WP-SUP-RESTART");
    await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: receipt() });
    const r = await daemon(`/runner/runs/${job.run.id}/evidence`, { observation: "process-gone", receipt: receipt() });
    expect(r.json().reconciled).toBe(true);
    const after = await run(job.run.id);
    expect(after.status).toBe("lost");
    expect(after.body.reconciliation.disposition).toBe("process-gone");
    // Its outbox completion arriving later is retained, never applied.
    const late = await daemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", idempotency_key: "late-key-001", outputs: [] });
    expect(late.json().code).toBe("run-lost");
  });

  it("settles an unknown outcome with a person's signed reason, once", async () => {
    const job = await claimed("WP-SUP-SIGN");
    await expire(job.run.id);
    await sweep();
    expect((await post(`/packages/WP-SUP-SIGN/runs/${job.run.id}/reconcile/options`, {})).json().code).toBe("reason-required");
    const reason = "The laptop running the daemon was wiped";
    const o = await post(`/packages/WP-SUP-SIGN/runs/${job.run.id}/reconcile/options`, { reason });
    expect(o.statusCode, o.body).toBe(200);
    const unsigned = await post(`/packages/WP-SUP-SIGN/runs/${job.run.id}/reconcile`, { reason });
    expect(unsigned.json().code).toBe("unsigned");
    const changed = await post(`/packages/WP-SUP-SIGN/runs/${job.run.id}/reconcile`, { reason: "something else", assertion: key.assert(o.json().options) });
    expect(changed.json().code).toBe("signature-mismatch");
    const o2 = await post(`/packages/WP-SUP-SIGN/runs/${job.run.id}/reconcile/options`, { reason });
    const ok = await post(`/packages/WP-SUP-SIGN/runs/${job.run.id}/reconcile`, { reason, assertion: key.assert(o2.json().options) });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().reconciliation).toMatchObject({ disposition: "abandoned", by: { kind: "human", id: "ben" } });
    expect(ok.json().reconciliation.evidence).toContain(reason);
    expect((await post(`/packages/WP-SUP-SIGN/runs/${job.run.id}/reconcile/options`, { reason })).json().code).toBe("not-unknown");
  });

  it("settles an unknown outcome when the daemon's completion arrives late", async () => {
    const job = await claimed("WP-SUP-LATE");
    await expire(job.run.id);
    await sweep();
    const late = await daemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "x", idempotency_key: "late-key-002", outputs: [] });
    expect(late.json().code).toBe("run-lost");
    expect((await run(job.run.id)).body.reconciliation.disposition).toBe("completed-late");
  });
});

describe("ordering races", () => {
  it("honors a heartbeat that reaches a lease from before a restart ahead of the first sweep", async () => {
    // A run an earlier controller started, whose daemon is alive and heartbeats first.
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-SUP-HB', 0, 'in-work', $1)",
      [{ ...example, id: "WP-SUP-HB", revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }]);
    const body = { schema_version: "0.1.0", id: "R-hbfirst1", package_id: "WP-SUP-HB", package_revision: 0, role: "author", agent_baseline: "author-fake",
      runtime: { kind: "local", provider: "fake", model: "fake" }, round: 1, status: "running", queued_at: new Date().toISOString(), generation: 1 };
    const { createHash } = await import("node:crypto");
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body, claim_token_hash, lease_expires_at) values ($1, 'WP-SUP-HB', 0, 'author', 1, 'running', $2, $3, now() - interval '5 minutes')",
      [body.id, body, createHash("sha256").update("hb-token").digest("hex")]);
    claims.set(body.id, "hb-token");
    const beat = await daemon(`/runner/runs/${body.id}/log`, { lines: ["still working"] });
    expect(beat.statusCode, beat.body).toBe(200);
    expect(beat.json().stop).toBe(false);
    await sweep();
    expect((await run(body.id)).status).toBe("running");
    await h.admin.query("update runs set status = 'stopped' where id = $1", [body.id]);
  });

  it("retires and settles a run whose late completion beats the sweep", async () => {
    const job = await claimed("WP-SUP-BEAT");
    await expire(job.run.id);
    const late = await daemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", idempotency_key: "beat-key-001", outputs: [] });
    expect(late.json().code).toBe("run-lost");
    const after = await run(job.run.id);
    expect(after.status).toBe("lost");
    expect(after.body.reconciliation.disposition).toBe("completed-late");
    expect((await post(`/packages/WP-SUP-BEAT/runs/${job.run.id}/requeue`, {})).statusCode).toBe(201);
  });
});

describe("round 2 rules", () => {
  it("records process group evidence but leaves the outcome unknown for a person", async () => {
    const job = await claimed("WP-SUP-PG");
    const pg = { ...receipt(), containment: "process-group" };
    delete (pg as Json).unit;
    await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: pg });
    const r = await daemon(`/runner/runs/${job.run.id}/evidence`, { observation: "process-gone", receipt: pg });
    expect(r.json()).toEqual({ run_id: job.run.id, reconciled: false });
    const after = await run(job.run.id);
    expect(after.status).toBe("lost");
    expect(after.body.outcome_unknown).toBeDefined();
    expect(after.body.reconciliation).toBeUndefined();
    expect((await post(`/packages/WP-SUP-PG/runs/${job.run.id}/requeue`, {})).json().code).toBe("outcome-unknown");
  });

  it("honors heartbeats that return from an outage before the sweep sees it", async () => {
    const jobs = [await claimed("WP-HBO-1"), await claimed("WP-HBO-2"), await claimed("WP-HBO-3")];
    await h.admin.query("update runs set status = 'stopped' where status = 'running' and id <> all($1::text[])", [jobs.map((j) => j.run.id)]);
    for (const j of jobs) await expire(j.run.id);
    for (const j of jobs) {
      const beat = await daemon(`/runner/runs/${j.run.id}/log`, { lines: ["back"] });
      expect(beat.statusCode, beat.body).toBe(200);
    }
    await h.admin.query("update runs set status = 'stopped' where id = any($1::text[])", [jobs.map((j) => j.run.id)]);
  });

  it("grants no second renewal without a heartbeat, even to a controller that never saw the run", async () => {
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-SUP-BOUND', 0, 'in-work', $1)",
      [{ ...example, id: "WP-SUP-BOUND", revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }]);
    // Renewed once already by an earlier controller, and never heard from since.
    const body = { schema_version: "0.1.0", id: "R-bound001", package_id: "WP-SUP-BOUND", package_revision: 0, role: "author", agent_baseline: "author-fake",
      runtime: { kind: "local", provider: "fake", model: "fake" }, round: 1, status: "running", queued_at: new Date().toISOString(), generation: 1, grace_renewals: 1 };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body, lease_expires_at) values ($1, 'WP-SUP-BOUND', 0, 'author', 1, 'running', $2, now() - interval '1 minute')", [body.id, body]);
    await sweep();
    expect((await run(body.id)).status).toBe("lost");
  });
});

describe("round 3 rules", () => {
  const pgReceipt = () => { const r: Json = { ...receipt(), containment: "process-group" }; delete r.unit; return r; };

  it("keeps a failed run under process group containment on hold, and its late completion settles nothing", async () => {
    const job = await claimed("WP-SUP-PGFAIL");
    await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt: pgReceipt() });
    const done = await daemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "boom", idempotency_key: "pg-fail-0001", outputs: [] });
    expect(done.statusCode, done.body).toBe(200);
    const after = await run(job.run.id);
    expect(after.status).toBe("failed");
    expect(after.body.outcome_unknown.reason).toMatch(/process group containment/);
    expect((await post(`/packages/WP-SUP-PGFAIL/runs/${job.run.id}/requeue`, {})).json().code).toBe("outcome-unknown");

    const late = await claimed("WP-SUP-PGLATE");
    await daemon(`/runner/runs/${late.run.id}/log`, { lines: [], receipt: pgReceipt() });
    await expire(late.run.id);
    await sweep();
    await daemon(`/runner/runs/${late.run.id}/complete`, { status: "failed", error: "x", idempotency_key: "pg-late-0001", outputs: [] });
    expect((await run(late.run.id)).body.reconciliation).toBeUndefined();
  });

  it("lets the sweep honor an outage heartbeats already recognized", async () => {
    const jobs = [await claimed("WP-REC-1"), await claimed("WP-REC-2"), await claimed("WP-REC-3")];
    await h.admin.query("update runs set status = 'stopped' where status = 'running' and id <> all($1::text[])", [jobs.map((j) => j.run.id)]);
    for (const j of jobs) await expire(j.run.id);
    for (const j of jobs.slice(0, 2)) expect((await daemon(`/runner/runs/${j.run.id}/log`, { lines: [] })).statusCode).toBe(200);
    // Only one lapsed run is left, a minority, but the outage is still within its window.
    await sweep();
    expect((await run(jobs[2].run.id)).status).toBe("running");
    expect((await daemon(`/runner/runs/${jobs[2].run.id}/log`, { lines: [] })).statusCode).toBe(200);
    await h.admin.query("update runs set status = 'stopped' where id = any($1::text[])", [jobs.map((j) => j.run.id)]);
  });
});

describe("generation fence", () => {
  it("refuses reports from an attempt a later attempt superseded", async () => {
    const job = await claimed("WP-SUP-FENCE");
    await expire(job.run.id);
    await sweep();
    await daemon(`/runner/runs/${job.run.id}/evidence`, { observation: "process-gone", receipt: receipt() });
    const next = (await post(`/packages/WP-SUP-FENCE/runs/${job.run.id}/requeue`, {})).json();
    expect(next.generation).toBe(2);
    // Even if the old attempt were somehow running again, it can no longer report. (One live attempt
    // at a time is a database rule, so the newer attempt is stopped; its generation stays on record.)
    await h.admin.query("update runs set status = 'stopped' where id = $1", [next.id]);
    await h.admin.query("update runs set status = 'running', lease_expires_at = now() + interval '1 minute' where id = $1", [job.run.id]);
    const beat = await daemon(`/runner/runs/${job.run.id}/log`, { lines: ["stale"] });
    expect(beat.json().code).toBe("superseded");
    const done = await daemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", idempotency_key: "stale-key-01", outputs: [] });
    expect(done.json().code ?? done.json().refusal?.code).toBe("superseded");
    await h.admin.query("update runs set status = 'lost' where id = $1", [job.run.id]);
  });
});

describe("reaper", () => {
  it("treats most active runs looking dead in one pass as an outage and marks none", async () => {
    const outages = async () => (await h.db.query("select count(*)::int as n from events where body->>'type' = 'runs.sweep-outage'")).rows[0].n as number;
    const jobs = [await claimed("WP-OUT-1"), await claimed("WP-OUT-2"), await claimed("WP-OUT-3")];
    await h.admin.query("update runs set status = 'stopped' where status = 'running' and id <> all($1::text[])", [jobs.map((j) => j.run.id)]);
    for (const j of jobs) await expire(j.run.id);
    const before = await outages();
    await sweep();
    for (const j of jobs) expect((await run(j.run.id)).status).toBe("running");
    expect(await outages()).toBe(before + 1);
    // They got recovery leases, so a second pass in the same outage finds nothing to do.
    await sweep();
    for (const j of jobs) expect((await run(j.run.id)).status).toBe("running");
    expect(await outages()).toBe(before + 1);
    // Each got one recovery lease. Two daemons come back and heartbeat; the third never does, so its
    // second lapse is a fact even though it is still one of the runs that looked dead together.
    for (const j of jobs.slice(1)) expect((await daemon(`/runner/runs/${j.run.id}/log`, { lines: [] })).statusCode).toBe(200);
    await expire(jobs[0].run.id);
    await sweep();
    expect((await run(jobs[0].run.id)).status).toBe("lost");
    expect((await run(jobs[0].run.id)).body.outcome_unknown).toBeDefined();
    for (const j of jobs.slice(1)) expect((await run(j.run.id)).status).toBe("running");
    await h.admin.query("update runs set status = 'stopped' where id = any($1::text[]) and status = 'running'", [jobs.map((j) => j.run.id)]);
  });

  it("renews a lease an earlier controller granted instead of declaring the run dead", async () => {
    // A run some earlier controller process started: this one never issued or renewed its lease.
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-SUP-ASLEEP', 0, 'in-work', $1)",
      [{ ...example, id: "WP-SUP-ASLEEP", revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }]);
    const body = { schema_version: "0.1.0", id: "R-asleep01", package_id: "WP-SUP-ASLEEP", package_revision: 0, role: "author", agent_baseline: "author-fake",
      runtime: { kind: "local", provider: "fake", model: "fake" }, round: 1, status: "running", queued_at: new Date().toISOString(), generation: 1 };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body, lease_expires_at) values ($1, 'WP-SUP-ASLEEP', 0, 'author', 1, 'running', $2, now() - interval '1 hour')", [body.id, body]);
    const job = { run: body };
    await sweep();
    const after = await run(job.run.id);
    expect(after.status).toBe("running");
    const ev = await h.db.query("select body->'data'->>'reason' as r from events where body->>'type' = 'run.lease-renewed' and body->>'subject' = $1", [job.run.id]);
    expect(ev.rows[0].r).toMatch(/granted before the controller restarted/);
    // Renewed once: from now on this controller holds the lease, and a lapse is a fact.
    await expire(job.run.id);
    await sweep();
    expect((await run(job.run.id)).status).toBe("lost");
  });
});
