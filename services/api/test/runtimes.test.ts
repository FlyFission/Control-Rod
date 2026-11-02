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
