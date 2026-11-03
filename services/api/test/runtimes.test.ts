import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";

/** Runtime artifacts, probes and pins (workbench plan task 2.5; specification 21, WB-12). */
let h: Harness;
let cookie: string;
const key = new VirtualAuthenticator();
const example = parse(readFileSync(new URL("../../../spec/examples/work-package.hvac-load-calc.yaml", import.meta.url), "utf8"));
type Json = Record<string, any>;
const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64);

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, key);
}, 120_000);
afterAll(async () => h?.stop());

const post = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: { cookie, origin: ORIGIN }, payload: payload as object });
async function signed(name: string, payload: Json) {
  const o = await post(`/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return post(`/admin/commands/${name}`, { payload, assertion: key.assert(o.json().options) });
}
const status = (digest: string, ready = true) => [{ runtime: "claude", ready, version: `2.1.${digest[0]}`, login_checked: false, artifact: { path: "/usr/local/lib/claude/cli.js", digest: { algorithm: "sha256", value: digest } } }];
const claim = (digest: string, ready = true) => h.app.inject({ method: "POST", url: "/runner/claim", headers: daemonHeaders, payload: { runtimes: ["claude"], runtime_status: status(digest, ready) } });
const probes = async () => (await h.db.query<{ body: Json }>("select body from runtime_probes order by body->>'observed_at'")).rows.map((r) => r.body);

async function queued(id: string) {
  await h.admin.query("update runs set status = 'stopped' where status in ('queued', 'running')");
  await h.admin.query("insert into packages (id, revision, status, body) values ($1, 0, 'released', $2)",
    [id, { ...example, id, revision: 0, status: "released", data_lane: "internal", design_inputs: [] }]);
  const r = { schema_version: "0.1.0", id: `R-${id.slice(-8).toLowerCase()}`, package_id: id, package_revision: 0, role: "author", agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" }, round: 1, status: "queued", queued_at: new Date().toISOString(), generation: 1 };
  await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 1, 'queued', $3)", [r.id, id, r]);
  return r.id;
}

describe("probes", () => {
  it("records a probe each time a runtime's artifact, version or readiness changes", async () => {
    await claim(A);
    await claim(A);
    expect((await probes()).filter((p) => p.artifact_digest.value === A)).toHaveLength(1);
    await claim(A, false);
    await claim(B);
    const all = await probes();
    expect(all.map((p) => [p.artifact_digest.value[0], p.outcome])).toEqual([["a", "pass"], ["a", "fail"], ["b", "pass"]]);
    expect((await h.app.inject({ method: "GET", url: "/runtimes", headers: { cookie } })).json().runtimes[0].artifact.digest.value).toBe(B);
  });
});

describe("pins", () => {
  it("pins only an artifact a passing probe saw, and only with a passkey", async () => {
    expect((await post("/admin/commands/runtime.pin", { payload: { runtime: "claude", artifact_digest: A } })).json().code).toBe("signature-required");
    expect((await signed("runtime.pin", { runtime: "claude", artifact_digest: C })).json().code).toBe("artifact-not-qualified");
    const ok = await signed("runtime.pin", { runtime: "claude", artifact_digest: A });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().pins.map((p: Json) => p.role).sort()).toEqual(["author", "intake", "pre-check"]);
    // The roster reads the active pins beside the daemon's report.
    const roster = (await h.app.inject({ method: "GET", url: "/runtimes", headers: { cookie } })).json();
    expect(roster.pins.map((p: Json) => [p.runtime, p.role, p.artifact_digest.value])).toEqual([["claude", "author", A], ["claude", "intake", A], ["claude", "pre-check", A]]);
  });

  it("hands the pin to the daemon, and holds work when the installed artifact is not the pinned one", async () => {
    const runId = await queued("WP-PIN-1");
    const held = await claim(B);
    expect(held.statusCode).toBe(204);
    const reason = (await h.db.query("select body->>'waiting_reason' as r from runs where id = $1", [runId])).rows[0].r;
    expect(reason).toMatch(/claude here is not the pinned version \(bbbbbbbbbbbb, pinned aaaaaaaaaaaa\)/);
    // The hold names the pin it waits on: this role and the runtimes it was offered.
    expect((await h.db.query("select body->>'waiting_key' as k from runs where id = $1", [runId])).rows[0].k).toBe("runtime-pin:author:claude");
    const job = await claim(A);
    expect(job.statusCode, job.body).toBe(200);
    expect(job.json().runtime_pin).toEqual({ runtime: "claude", digest: { algorithm: "sha256", value: A } });
  });

  it("updates atomically and rolls back to the previous pin, signed", async () => {
    const up = await signed("runtime.pin", { runtime: "claude", artifact_digest: B, role: "author" });
    expect(up.json().pins).toHaveLength(1);
    const active = async () => (await h.db.query<{ v: string }>("select body->'artifact_digest'->>'value' as v from runtime_pins where body->>'role' = 'author' and body->>'status' = 'active'")).rows.map((r) => r.v);
    expect(await active()).toEqual([B]);
    const back = await signed("runtime.rollback", { runtime: "claude", role: "author" });
    expect(back.statusCode, back.body).toBe(200);
    expect(await active()).toEqual([A]);
    expect((await signed("runtime.rollback", { runtime: "claude", role: "intake" })).json().code).toBe("no-previous-pin");
    expect((await signed("runtime.pin", { runtime: "fake", artifact_digest: A })).statusCode).toBe(400);
  });
});

describe("roster (plan task 5.1)", () => {
  it("states each role's recorded baselines and pins, the versions a pin may name, and sandboxes as launched", async () => {
    // A completed author run, as the daemon reports it: its baseline, runtime and launch sandbox.
    await h.admin.query("insert into packages (id, revision, status, body) values ('WP-ROSTER', 0, 'in-work', $1)",
      [{ ...example, id: "WP-ROSTER", revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }]);
    const done = { schema_version: "0.1.0", id: "R-roster01", package_id: "WP-ROSTER", package_revision: 0, role: "author", agent_baseline: "author-claude",
      runtime: { kind: "subscription", provider: "claude", model: "default" }, round: 1, status: "succeeded", queued_at: new Date().toISOString(),
      finished_at: new Date().toISOString(), generation: 1, trace: { sandbox: "none" } };
    await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ('R-roster01', 'WP-ROSTER', 0, 'author', 1, 'succeeded', $1)", [done]);
    const res = await h.app.inject({ method: "GET", url: "/roster", headers: { cookie } });
    expect(res.statusCode, res.body).toBe(200);
    const r = res.json();
    const role = (name: string) => r.roles.find((x: Json) => x.role === name);
    // Baselines come from what runs recorded, never from a naming rule.
    expect(role("author").baselines).toEqual([{ runtime: "claude", baseline: "author-claude" }]);
    expect(role("author").pins.map((p: Json) => p.artifact_digest.value)).toEqual([A]);
    // Author was pinned to B and rolled back to A, so B is retired and a rollback target exists.
    expect(role("author").rollback).toEqual(["claude"]);
    expect(role("intake").rollback).toEqual([]);
    expect(role("requirements-preparer")).toMatchObject({ pinnable: false, baselines: [], runs: 0, pins: [] });
    // Earlier tests in this file left a running author-claude run, so the counts include it.
    expect(r.baselines.map((b: Json) => b.id)).toEqual(["author-claude"]);
    expect(r.baselines[0]).toMatchObject({ roles: ["author"], runs: 2, statuses: { succeeded: 1, running: 1 } });
    expect(r.baselines_recorded).toBe(false);
    // Only artifacts a passing probe saw, each once, with the roles pinning it now.
    const versions = r.versions.filter((v: Json) => v.runtime === "claude");
    expect(versions.map((v: Json) => v.digest.value).sort()).toEqual([A, B].sort());
    expect(versions.find((v: Json) => v.digest.value === A).pinned_for).toEqual(["author", "intake", "pre-check"]);
    expect(versions.find((v: Json) => v.digest.value === B).pinned_for).toEqual([]);
    expect(r.versions.some((v: Json) => v.digest.value === C)).toBe(false);
    // No sandbox policy is recorded; the launch is reported as the run gave it.
    expect(r.sandbox.policies).toEqual([]);
    expect(r.sandbox.launched).toEqual([expect.objectContaining({ runtime: "claude", sandbox: "none", run_id: "R-roster01" })]);
    expect((await h.app.inject({ method: "GET", url: "/roster" })).statusCode).toBe(401);
  });
});
