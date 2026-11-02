import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, VirtualAuthenticator, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** Run stories and interim waiting detection (workbench plan tasks 2.6 and 2.9; specification 20 and 22, WB-09). */
let h: Harness;
let cookie: string;
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, new VirtualAuthenticator());
}, 120_000);
afterAll(async () => h?.stop());

const daemon = (url: string, payload: Json) => h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: withClaim(url, payload) });
async function claimed(id: string, runtime: string) {
  await h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'released', $2)",
    [id, { ...example, id, revision: 0, status: "released", data_lane: "internal", design_inputs: [] }]);
  const r = { schema_version: "0.1.0", id: `R-${id.slice(-8).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(), generation: 1 };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [r.id, id, r]);
  const res = await h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: [runtime] } });
  expect(res.statusCode, res.body).toBe(200);
  claims.set(res.json().run.id, res.json().claim.token);
  return res.json();
}
const at = () => new Date().toISOString();

describe("run stories", () => {
  it("keeps normalized events in order and serves them after a sequence number", async () => {
    const job = await claimed("WP-EV-1", "fake");
    const events = [
      { kind: "message", at: at(), text: "Reading the brief" },
      { kind: "tool_start", at: at(), tool: "Read", summary: "Read: BRIEF.md", input_digest: "a".repeat(64), call_id: "t1" },
      { kind: "tool_end", at: at(), call_id: "t1", ok: true },
    ];
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: ["raw"], events })).statusCode).toBe(200);
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], events: [{ kind: "exit", at: at(), text: "exited" }] })).statusCode).toBe(200);
    const all = (await h.app.inject({ method: "GET", url: `/packages/WP-EV-1/runs/${job.run.id}/events`, headers: { cookie } })).json();
    expect(all.events.map((e: Json) => [e.seq, e.event.kind])).toEqual([[1, "message"], [2, "tool_start"], [3, "tool_end"], [4, "exit"]]);
    const later = (await h.app.inject({ method: "GET", url: `/packages/WP-EV-1/runs/${job.run.id}/events?after=2`, headers: { cookie } })).json();
    expect(later.events.map((e: Json) => e.seq)).toEqual([3, 4]);
    expect((await h.app.inject({ method: "GET", url: `/packages/WP-OTHER/runs/${job.run.id}/events`, headers: { cookie } })).statusCode).toBe(404);
  });

  it("keeps each daemon event once when a batch is resent, marks a gap, and takes the rest from the completion", async () => {
    const job = await claimed("WP-EV-DUP", "fake");
    const kinds = async () => (await h.app.inject({ method: "GET", url: `/packages/WP-EV-DUP/runs/${job.run.id}/events`, headers: { cookie } })).json().events.map((e: Json) => e.event.kind + (e.event.text ? `:${e.event.text}` : ""));
    const msg = (text: string) => ({ kind: "message", at: at(), text });
    const first = { lines: [], events: [msg("a"), msg("b")], events_from: 0 };
    expect((await daemon(`/runner/runs/${job.run.id}/log`, first)).statusCode).toBe(200);
    // The answer was lost; the daemon resends the same batch with one more event behind it.
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], events: [msg("a"), msg("b"), msg("c")], events_from: 0 })).statusCode).toBe(200);
    expect(await kinds()).toEqual(["message:a", "message:b", "message:c"]);
    // Events the daemon counted as delivered but the control plane never saw show as dropped.
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], events: [msg("f")], events_from: 5 })).statusCode).toBe(200);
    expect((await kinds()).slice(3)).toEqual(["dropped", "message:f"]);
    expect((await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], events: [msg("x")], events_from: -1 })).statusCode).toBe(400);
    // The last events ride with the completion, and a retried completion adds nothing.
    const done = { status: "failed", error: "x", outputs: [], idempotency_key: "events-key-001", events: [msg("f"), { kind: "exit", at: at(), text: "exited" }], events_from: 5 };
    expect((await daemon(`/runner/runs/${job.run.id}/complete`, done)).statusCode).toBe(200);
    expect((await daemon(`/runner/runs/${job.run.id}/complete`, done)).statusCode).toBe(200);
    expect((await kinds()).slice(3)).toEqual(["dropped", "message:f", "exit:exited"]);
  });

  it("keeps the exit event even past the per-run cap", async () => {
    const job = await claimed("WP-EV-CAP", "fake");
    await h.admin.query(
      "insert into run_events (run_id, seq, body) select $1, n, jsonb_build_object('kind', 'message', 'at', now()::text, 'text', 'x') from generate_series(1, 20000) n", [job.run.id]);
    const post = await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], events: [{ kind: "message", at: at(), text: "late" }, { kind: "exit", at: at(), text: "exited" }], events_from: 0 });
    expect(post.statusCode, post.body).toBe(200);
    const tail = (await h.db.query<{ body: Json }>("select body from run_events where run_id = $1 and seq > 20000 order by seq", [job.run.id])).rows.map((r) => r.body.kind);
    expect(tail).toEqual(["notice", "exit"]);
  });

  it("refuses an event outside the contract, keeping the whole post out", async () => {
    const job = await claimed("WP-EV-2", "fake");
    const bad = await daemon(`/runner/runs/${job.run.id}/log`, { lines: ["x"], events: [{ kind: "message", at: at(), text: "ok" }, { kind: "telepathy", at: at() }] });
    expect(bad.statusCode).toBe(400);
    expect((await h.db.query("select count(*)::int as n from run_events where run_id = $1", [job.run.id])).rows[0].n).toBe(0);
    const tooLong = await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], events: [{ kind: "tool_start", at: at(), input_digest: "not-a-digest" }] });
    expect(tooLong.statusCode).toBe(400);
  });

  it("records a permission request as run.waiting and a breaker notice as run.breaker", async () => {
    const job = await claimed("WP-EV-3", "fake");
    await daemon(`/runner/runs/${job.run.id}/log`, { lines: [], events: [
      { kind: "permission_request", at: at(), tool: "Bash", summary: "Run: rm", input_digest: "b".repeat(64) },
      { kind: "notice", at: at(), text: "Breaker tripped: the same Bash call with the same input 8 times in a row. The run is being stopped." },
    ] });
    const ev = await h.db.query("select body->>'type' as t, body->'data' as d from events where body->>'subject' = $1 and body->>'type' in ('run.waiting', 'run.breaker') order by seq", [job.run.id]);
    expect(ev.rows.map((r) => r.t)).toEqual(["run.waiting", "run.breaker"]);
    expect(ev.rows[0].d).toMatchObject({ tool: "Bash", input_digest: "b".repeat(64) });
    expect(ev.rows[1].d.text).toMatch(/^Breaker tripped/);
  });
});

describe("permission waits", () => {
  it("marks Claude Code runs as observed and Codex runs as not observable", async () => {
    const claude = await claimed("WP-EV-CL", "claude");
    expect(claude.run.permission_waits).toBe("observed");
    const codex = await claimed("WP-EV-CX", "codex");
    expect(codex.run.permission_waits).toBe("not-observable");
    const fake = await claimed("WP-EV-FK", "fake");
    expect(fake.run.permission_waits).toBeUndefined();
  });
});
