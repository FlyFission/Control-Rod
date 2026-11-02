import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** SCRAM (workbench plan task 2.10; specification 22a, WB-10). */
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
const claim = () => h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: ["fake"] } });
const run = async (id: string) => (await h.db.query<{ status: string; body: Json }>("select status, body from runs where id = $1", [id])).rows[0]!;
const events = async (type: string) => (await h.db.query<{ body: Json }>("select body from events where body->>'type' = $1 order by seq", [type])).rows.map((r) => r.body);
const sweep = async () => { await h.app.inject({ method: "GET", url: "/office", headers: { cookie } }); };
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}

const quarantined = (runId: string) => h.db.query<{ name: string; sha256: string; batch_id: string }>(
  "select q.name, q.sha256, q.batch_id::text from scram_quarantine q join scram_quarantine_batches b on b.id = q.batch_id where b.run_id = $1 order by q.batch_id, q.ordinal", [runId]);
async function restartAll(scramId: string) {
  const r = await signed("scram.restart", { scram_id: scramId, scope: "all", reason: "Test done" });
  expect(r.statusCode, r.body).toBe(200);
}
/** Reviews a stopped run as a person would: read what it reported, then sign for exactly that. */
async function review(scramId: string, runId: string, disposition: "discard" | "retain", reason: string) {
  const view = await h.app.inject({ method: "GET", url: `/scrams/${scramId}`, headers: { cookie } });
  expect(view.statusCode, view.body).toBe(200);
  const entry = view.json().runs.find((r: Json) => r.run_id === runId);
  const newest = entry?.batches.at(-1)?.id;
  return signed("scram.review", { scram_id: scramId, run_id: runId, disposition, reason, ...(newest ? { covers_batch: newest } : {}) });
}

/** Settles a run's unknown outcome with a person's signed reason. */
async function reconcile(packageId: string, runId: string) {
  const reason = "Machine checked; nothing running";
  const o = await post(`/packages/${packageId}/runs/${runId}/reconcile/options`, { reason });
  expect(o.statusCode, o.body).toBe(200);
  const r = await post(`/packages/${packageId}/runs/${runId}/reconcile`, { reason, assertion: key.assert(o.json().options) });
  expect(r.statusCode, r.body).toBe(200);
}

/** A released package with a queued author run. */
async function queued(id: string, discipline?: string) {
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'released', $2)",
    [id, { ...example, id, revision: 0, status: "released", data_lane: "internal", design_inputs: [], ...(discipline ? { discipline } : {}) }]);
  const r = { schema_version: "0.1.0", id: `R-${id.slice(-8).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(), generation: 1 };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [r.id, id, r]);
  return r.id;
}

/** Queues one package and claims it, so it is the only running run. */
async function running(id: string) {
  await h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");
  const runId = await queued(id);
  const res = await claim();
  expect(res.statusCode, res.body).toBe(200);
  expect(res.json().run.id).toBe(runId);
  claims.set(runId, res.json().claim.token);
  return runId;
}

describe("pulling SCRAM", () => {
  it("needs a passkey and a reason", async () => {
    const bare = await post("/admin/commands/scram.pull", { payload: { scope: "organization", reason: "x" } });
    expect(bare.json().code).toBe("signature-required");
    expect((await signed("scram.pull", { scope: "organization", reason: " " })).json().code).toBe("reason-required");
  });

  it("stops running work, holds everything in scope, quarantines what stopped runs report, and restarts only once reviewed", async () => {
    const stopping = await running("WP-SCR-RUN");
    const waiting = await queued("WP-SCR-WAIT");

    const pulled = await signed("scram.pull", { scope: "organization", reason: "Drill: confirm everything stops", drill: true });
    expect(pulled.statusCode, pulled.body).toBe(200);
    const scram = pulled.json();
    expect(scram).toMatchObject({ scope: "organization", quarantine: [stopping], drill: true });
    expect(scram.assertion).toBeTruthy();

    // The running run is told to stop at its next heartbeat and marked for quarantine.
    const r = await run(stopping);
    expect(r.body).toMatchObject({ scram_id: scram.id, label: "Stopping" });
    expect(r.body.stop_requested_by).toBe(`SCRAM ${scram.id}`);
    expect((await daemon(`/runner/runs/${stopping}/log`, { lines: [] })).json().stop).toBe(true);

    // Nothing in scope is claimed, and the office says why.
    expect((await claim()).statusCode).toBe(204);
    expect((await run(waiting)).body.waiting_reason).toMatch(new RegExp(`^SCRAM ${scram.id} has stopped this work: Drill`));

    // Nothing in scope is released.
    const o = await post("/packages/WP-SCR-WAIT/decisions/options", { kind: "release", package_revision: 0 });
    expect(o.statusCode, o.body).toBe(200);
    const release = await post("/packages/WP-SCR-WAIT/decisions", { kind: "release", package_revision: 0, assertion: key.assert(o.json().options) });
    expect(release.json().code).toBe("scram-stopped");

    // What the stopped run reports is kept with its digests and never applied.
    const done = await daemon(`/runner/runs/${stopping}/complete`, { status: "succeeded", outputs: [{ name: "calc.md", content_base64: b64("post-SCRAM output") }] });
    expect(done.statusCode, done.body).toBe(200);
    const after = await run(stopping);
    expect(after.status).toBe("stopped");
    expect(after.body.label).toBe("Quarantined");
    expect((await h.db.query("select 1 from outputs where run_id = $1", [stopping])).rowCount).toBe(0);
    const kept = await quarantined(stopping);
    expect(kept.rows).toHaveLength(1);
    expect(kept.rows[0]!.name).toBe("calc.md");
    expect((await events("scram.quarantined")).at(-1)!.data).toMatchObject({ scrams: [scram.id], reported: "succeeded", output_count: 1, outputs: [{ name: "calc.md", sha256: kept.rows[0]!.sha256 }] });

    // The time to stop is recorded once the last run in scope stopped, drills included.
    const stopped = (await events("scram.stopped")).filter((e) => e.subject === scram.id);
    expect(stopped).toHaveLength(1);
    expect(stopped[0]!.data).toMatchObject({ runs: 1, drill: true });
    expect(Number.isInteger(stopped[0]!.data.ms_to_stop)).toBe(true);

    // Requeue is refused while SCRAM holds.
    expect((await post(`/packages/WP-SCR-RUN/runs/${stopping}/requeue`, {})).json().code).toBe("scram-stopped");

    // Restart waits for the quarantine review, which is signed and happens once.
    const early = await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "All clear" });
    expect(early.json()).toMatchObject({ code: "restart-blocked" });
    expect(early.json().message).toMatch(/unreviewed quarantine/);
    const reviewed = await review(scram.id, stopping, "discard", "Output written after the stop; discarded");
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    expect((await review(scram.id, stopping, "retain", "again")).json().code).toBe("already-reviewed");
    const restart = await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "Drill complete" });
    expect(restart.statusCode, restart.body).toBe(200);
    expect((await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "again" })).json().code).toBe("already-restarted");

    // Work flows again.
    const resumed = await claim();
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(resumed.json().run.id).toBe(waiting);
  });

  it("waits for a claim already in flight, so the run it starts is stopped too", async () => {
    await h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");
    const runId = await queued("WP-SCR-RACE");
    // A claim in flight: it holds the gate and is starting the run, not yet committed.
    const c = await h.admin.connect();
    try {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock_shared(hashtext('controlrod.scram'))");
      await c.query("update runs set status = 'running', lease_expires_at = now() + interval '90 seconds' where id = $1", [runId]);
      let settled = false;
      const pull = signed("scram.pull", { scope: "organization", reason: "Race check" }).then((r) => { settled = true; return r; });
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);
      await c.query("commit");
      const scram = (await pull).json();
      expect(scram.quarantine).toEqual([runId]);
      expect((await run(runId)).body.scram_id).toBe(scram.id);
      await h.admin.query("update runs set status = 'stopped' where id = $1", [runId]);
      await review(scram.id, runId, "discard", "Race check");
      expect((await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "Race check done" })).statusCode).toBe(200);
    } finally {
      c.release();
    }
  });

  it("restarts one discipline while the rest stays stopped", async () => {
    await h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");
    const mech = await queued("WP-SCR-MECH", "mechanical");
    const elec = await queued("WP-SCR-ELEC", "electrical");
    const scram = (await signed("scram.pull", { scope: "organization", reason: "Bad prompt shipped" })).json();
    expect(scram.quarantine).toEqual([]);
    // Nothing was running, so it stopped at once.
    expect((await events("scram.stopped")).filter((e) => e.subject === scram.id)).toHaveLength(1);
    expect((await claim()).statusCode).toBe(204);
    const part = await signed("scram.restart", { scram_id: scram.id, scope: "discipline", discipline: "mechanical", reason: "Mechanical prompts verified" });
    expect(part.statusCode, part.body).toBe(200);
    const job = await claim();
    expect(job.statusCode, job.body).toBe(200);
    expect(job.json().run.id).toBe(mech);
    expect((await claim()).statusCode).toBe(204);
    expect((await run(elec)).body.waiting_reason).toMatch(/^SCRAM /);
    expect((await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "All verified" })).statusCode).toBe(200);
    expect((await claim()).json().run.id).toBe(elec);
  });

  it("scopes a project SCRAM to the project, and counts a daemon out of contact for a lease as stopped with an unknown outcome", async () => {
    const project = await signed("project.create", { name: "SCRAM project", mode: "software", default_rigor: "standard", lanes: ["internal"], qa_overlays: [] });
    expect(project.statusCode, project.body).toBe(200);
    const projectId = project.json().id;
    // The package belongs to the project from the start (owner rows are append only).
    const org = (await h.db.query<{ org_id: string }>("select org_id from projects where id = $1", [projectId])).rows[0]!.org_id;
    await h.admin.query("insert into object_owners (object_kind, object_id, org_id, project_id) values ('package', 'WP-SCR-PROJ', $1, $2)", [org, projectId]);
    const inside = await running("WP-SCR-PROJ");
    const outside = await queued("WP-SCR-ELSEWHERE");

    const scram = (await signed("scram.pull", { scope: "project", project_id: projectId, reason: "Project credentials leaked" })).json();
    expect(scram.quarantine).toEqual([inside]);
    // Work outside the project is still handed out.
    const job = await claim();
    expect(job.statusCode, job.body).toBe(200);
    expect(job.json().run.id).toBe(outside);

    // The daemon never answers again: one lapsed lease and the sweep counts the run stopped,
    // with no grace renewal, and the outcome unknown.
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [inside]);
    await sweep();
    const lost = await run(inside);
    expect(lost.status).toBe("lost");
    expect(lost.body.outcome_unknown).toBeTruthy();
    expect(lost.body.grace_renewals).toBeUndefined();
    expect((await events("scram.stopped")).filter((e) => e.subject === scram.id)).toHaveLength(1);

    await review(scram.id, inside, "discard", "Nothing reported");
    const blocked = await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "Rotated" });
    expect(blocked.json().code).toBe("restart-blocked");
    expect(blocked.json().message).toMatch(/unknown outcome/);
    await reconcile("WP-SCR-PROJ", inside);
    await restartAll(scram.id);
  });

  it("needs a fresh review for anything a stopped run reports after its last review", async () => {
    const runId = await running("WP-SCR-LATE");
    const scram = (await signed("scram.pull", { scope: "organization", reason: "Late report check" })).json();
    // The daemon goes quiet: the run is counted stopped with an unknown outcome, and reviewed.
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [runId]);
    await sweep();
    expect((await run(runId)).status).toBe("lost");
    const first = await review(scram.id, runId, "discard", "Nothing reported yet");
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().covers_batch).toBeUndefined();
    // Then its completion arrives late, with output: kept as a new batch, and it settles the outcome.
    const late = await daemon(`/runner/runs/${runId}/complete`, { status: "succeeded", outputs: [{ name: "late.md", content_base64: b64("late") }] });
    expect(late.statusCode).toBe(409);
    expect((await quarantined(runId)).rows.map((r) => r.name)).toEqual(["late.md"]);
    expect((await run(runId)).body.reconciliation?.disposition).toBe("completed-late");
    // The earlier review does not cover it.
    const blocked = await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "Too soon" });
    expect(blocked.json().message).toMatch(/unreviewed quarantine/);
    const second = await review(scram.id, runId, "retain", "Late output kept for reference");
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json().covers_batch).toBe(Number((await quarantined(runId)).rows[0]!.batch_id));
    await restartAll(scram.id);
  });

  it("records the time to stop for every SCRAM that reached a run, even when pulls overlap", async () => {
    const runId = await running("WP-SCR-TWICE");
    const a = (await signed("scram.pull", { scope: "organization", reason: "First" })).json();
    const b = (await signed("scram.pull", { scope: "organization", reason: "Second" })).json();
    expect(a.quarantine).toEqual([runId]);
    expect(b.quarantine).toEqual([runId]);
    expect((await run(runId)).body.scram_id).toBe(a.id);
    await daemon(`/runner/runs/${runId}/complete`, { status: "stopped", outputs: [] });
    const stoppedFor = (await events("scram.stopped")).map((e) => e.subject);
    expect(stoppedFor).toEqual(expect.arrayContaining([a.id, b.id]));
    for (const s of [a, b]) {
      await review(s.id, runId, "discard", "Stopped cleanly");
      await restartAll(s.id);
    }
  });

  it("blocks a restart on any run in scope with an unknown outcome, not only the ones it stopped", async () => {
    const earlier = await running("WP-SCR-EARLIER");
    // Lost before the pull, outcome unknown: SCRAM did not stop it, but it may still be running.
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [earlier]);
    await sweep();
    expect((await run(earlier)).body.outcome_unknown).toBeTruthy();
    const scram = (await signed("scram.pull", { scope: "organization", reason: "Unknown outcome check" })).json();
    expect(scram.quarantine).toEqual([]);
    const blocked = await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "Too soon" });
    expect(blocked.json().code).toBe("restart-blocked");
    expect(blocked.json().message).toContain(`${earlier} has an unknown outcome`);
    // Settled by a person, signed, the restart goes ahead.
    await reconcile("WP-SCR-EARLIER", earlier);
    await restartAll(scram.id);
  });

  it("keeps every output a stopped run reports, however many", async () => {
    const runId = await running("WP-SCR-MANY");
    const scram = (await signed("scram.pull", { scope: "organization", reason: "Many outputs" })).json();
    const outputs = Array.from({ length: 250 }, (_, i) => ({ name: `out-${i}.md`, content_base64: b64(`file ${i}`) }));
    expect((await daemon(`/runner/runs/${runId}/complete`, { status: "succeeded", outputs })).statusCode).toBe(200);
    expect((await quarantined(runId)).rows).toHaveLength(250);
    expect((await events("scram.quarantined")).at(-1)!.data.output_count).toBe(250);
    await review(scram.id, runId, "discard", "Discarded");
    await restartAll(scram.id);
  });

  it("never reaches work another organization owns", async () => {
    await h.admin.query(`insert into organizations (body) values ('{"id":"org_scram_other","name":"Other","status":"suspended"}')`);
    await h.admin.query(`insert into members (body) values ('{"id":"mem_scram_other","org_id":"org_scram_other","user_name":"other","display_name":"Other","status":"active"}')`);
    await h.admin.query("insert into scram_events (body) values ($1)",
      [{ id: "scr_foreign", org_id: "org_scram_other", scope: "organization", pulled_by: "mem_scram_other", reason: "Their own emergency", assertion: {}, quarantine: [] }]);
    await h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");
    const mine = await queued("WP-SCR-MINE");
    const job = await claim();
    expect(job.statusCode, job.body).toBe(200);
    expect(job.json().run.id).toBe(mine);
  });

  it("refuses a review signed before the run reported more", async () => {
    const runId = await running("WP-SCR-STALE");
    const scram = (await signed("scram.pull", { scope: "organization", reason: "Stale review check" })).json();
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [runId]);
    await sweep();
    // The reviewer looked when nothing had arrived; then a late report lands before they submit.
    await daemon(`/runner/runs/${runId}/complete`, { status: "succeeded", outputs: [{ name: "x.md", content_base64: b64("x") }] });
    const stale = await signed("scram.review", { scram_id: scram.id, run_id: runId, disposition: "discard", reason: "Nothing reported" });
    expect(stale.json().code).toBe("quarantine-changed");
    expect((await review(scram.id, runId, "discard", "Reviewed the late output")).statusCode).toBe(200);
    await restartAll(scram.id);
  });

  it("quarantines a late report from a run lost before the pull, and holds the restart for its review", async () => {
    const runId = await running("WP-SCR-PRELOST");
    await h.admin.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [runId]);
    await sweep();
    expect((await run(runId)).status).toBe("lost");
    const scram = (await signed("scram.pull", { scope: "organization", reason: "Pre-lost check" })).json();
    expect(scram.quarantine).toEqual([]);
    // Its daemon reports late while SCRAM holds: the report is quarantined under this SCRAM.
    await daemon(`/runner/runs/${runId}/complete`, { status: "succeeded", outputs: [{ name: "late.md", content_base64: b64("late") }] });
    expect((await run(runId)).body.scram_id).toBe(scram.id);
    expect((await quarantined(runId)).rows.map((r) => r.name)).toEqual(["late.md"]);
    const view = (await h.app.inject({ method: "GET", url: `/scrams/${scram.id}`, headers: { cookie } })).json();
    expect(view.runs.map((r: Json) => r.run_id)).toEqual([runId]);
    expect(view.runs[0].batches[0]).toMatchObject({ reported: "succeeded", output_count: 1, outputs: [{ name: "late.md" }] });
    const blocked = await signed("scram.restart", { scram_id: scram.id, scope: "all", reason: "Too soon" });
    expect(blocked.json().message).toContain(`${runId} has unreviewed quarantine`);
    expect((await review(scram.id, runId, "discard", "Late output discarded")).statusCode).toBe(200);
    await restartAll(scram.id);
  });

  it("shows a SCRAM only to its own organization", async () => {
    const r = await h.app.inject({ method: "GET", url: "/scrams/scr_foreign", headers: { cookie } });
    expect(r.statusCode).toBe(404);
  });
});
