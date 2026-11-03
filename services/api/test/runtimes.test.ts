import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { type Harness, ORIGIN, VirtualAuthenticator, daemonHeaders, signIn, startHarness } from "./harness.js";
import { recordObject, recordSandboxPolicy } from "../src/workbench.js";

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
    // A rollback signs what it replaces and what it restores; a stale view is refused, changing nothing.
    const stale = await signed("runtime.rollback", { runtime: "claude", roles: [{ role: "author", current: B, restore: C }] });
    expect(stale.json().code).toBe("pin-changed");
    expect(await active()).toEqual([B]);
    expect((await signed("runtime.rollback", { runtime: "claude", role: "author" })).json().code).toBe("invalid");
    const back = await signed("runtime.rollback", { runtime: "claude", roles: [{ role: "author", current: B, restore: A }] });
    expect(back.statusCode, back.body).toBe(200);
    expect(await active()).toEqual([A]);
    expect((await signed("runtime.rollback", { runtime: "claude", roles: [{ role: "intake", current: A, restore: B }] })).json().code).toBe("no-previous-pin");
  });

  it("rolls back every role named or none: a later role that cannot roll back leaves the earlier one as it was", async () => {
    // Author is pinned to B again, so it alone has a rollback target; intake has none.
    expect((await signed("runtime.pin", { runtime: "claude", artifact_digest: B, role: "author" })).statusCode).toBe(200);
    const pinned = async (role: string) => (await h.db.query<{ v: string }>(
      "select body->'artifact_digest'->>'value' as v from runtime_pins where body->>'role' = $1 and body->>'status' = 'active'", [role])).rows.map((r) => r.v);
    const both = await signed("runtime.rollback", { runtime: "claude", roles: [{ role: "author", current: B, restore: A }, { role: "intake", current: A, restore: B }] });
    expect(both.json().code).toBe("no-previous-pin");
    // The author rollback ran first in the same transaction, and was undone with it.
    expect(await pinned("author")).toEqual([B]);
    expect(await pinned("intake")).toEqual([A]);
    expect((await signed("runtime.rollback", { runtime: "claude", roles: [{ role: "author", current: B, restore: A }, { role: "author", current: B, restore: A }] })).json().code).toBe("invalid");
    // Every entry names its role; none falls back to a default, and nothing changes.
    for (const role of [undefined, null, "", "requirements-preparer"])
      expect((await signed("runtime.rollback", { runtime: "claude", roles: [{ ...(role === undefined ? {} : { role }), current: A, restore: B }] })).json().code, String(role)).toBe("invalid");
    expect(await pinned("author")).toEqual([B]);
    expect(await pinned("intake")).toEqual([A]);
    expect((await signed("runtime.rollback", { runtime: "claude", roles: [{ role: "author", current: B, restore: A }] })).statusCode).toBe(200);
    expect((await signed("runtime.pin", { runtime: "fake", artifact_digest: A })).statusCode).toBe(400);
  });
});

describe("roster (plan task 5.1)", () => {
  it("states each role's recorded baselines and pins, the versions a pin may name, and sandboxes as launched", async () => {
    // A passing probe of a runtime that cannot be pinned, recorded directly as the daemon would.
    const c0 = await h.admin.connect();
    try {
      await c0.query("begin");
      const org = (await c0.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
      await recordObject(c0, "runtime_probe", { id: "rpb_fake", org_id: org, runtime: "fake", artifact_digest: { algorithm: "sha256", value: "9".repeat(64) }, version: "0",
        auth_state: "unknown", outcome: "pass", detail: "ready", observed_at: new Date().toISOString() } as never, { kind: "agent", id: "daemon" });
      await c0.query("commit");
    } finally {
      c0.release();
    }
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
    // Author was pinned to B and rolled back to A, so B is retired: the rollback it shows is exactly
    // the one runtime.rollback would make, with both artifacts to sign.
    expect(role("author").rollback).toEqual([{ runtime: "claude", current: { algorithm: "sha256", value: A }, restore: { algorithm: "sha256", value: B } }]);
    expect(role("intake").rollback).toEqual([]);
    // What the screen shows is what the command does: signing exactly it succeeds.
    const shown = role("author").rollback[0];
    const restored = await signed("runtime.rollback", { runtime: shown.runtime, roles: [{ role: "author", current: shown.current.value, restore: shown.restore.value }] });
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json().pins.map((p: Json) => p.artifact_digest.value)).toEqual([B]);
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
    // A passing probe of a runtime no pin may name (the test runtime) is never offered.
    expect(r.versions.every((v: Json) => v.runtime === "claude" || v.runtime === "codex")).toBe(true);
    // No sandbox policy is recorded; the launch is reported as the run gave it.
    expect(r.sandbox.policies).toEqual([]);
    expect(r.sandbox.launched).toEqual([expect.objectContaining({ runtime: "claude", sandbox: "none", run_id: "R-roster01" })]);
    expect((await h.app.inject({ method: "GET", url: "/roster" })).statusCode).toBe(401);
  });

  it("breaks a tie in pin history the same way on the screen and in the command", async () => {
    // Two retired author pins of different artifacts recorded in one transaction share their time;
    // the id breaks the tie, and the roster's target must be the one the rollback then restores.
    const c = await h.admin.connect();
    const C2 = "e".repeat(64);
    try {
      await c.query("begin");
      const daemon = { kind: "agent" as const, id: "daemon" };
      const org = (await c.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
      await recordObject(c, "runtime_probe", { id: "rpb_tie", org_id: org, runtime: "claude", artifact_digest: { algorithm: "sha256", value: C2 }, version: "2.1.e",
        auth_state: "unknown", outcome: "pass", detail: "ready", observed_at: new Date().toISOString() } as never, daemon);
      await recordObject(c, "runtime_artifact_version", { id: "rav_tie", org_id: org, runtime: "claude", version: "2.1.e", artifact_digest: { algorithm: "sha256", value: C2 },
        install_path: "/opt/claude", probe_ids: ["rpb_tie"] } as never, daemon);
      const ravA = (await c.query<{ id: string }>("select body->>'artifact_version_id' as id from runtime_pins where body->'artifact_digest'->>'value' = $1 limit 1", [A])).rows[0]!.id;
      await recordObject(c, "runtime_pin", { id: "pin_tieaaaaaaaa", org_id: org, role: "author", runtime: "claude", artifact_version_id: ravA,
        artifact_digest: { algorithm: "sha256", value: A }, status: "retired" } as never, daemon);
      await recordObject(c, "runtime_pin", { id: "pin_tiezzzzzzzz", org_id: org, role: "author", runtime: "claude", artifact_version_id: "rav_tie",
        artifact_digest: { algorithm: "sha256", value: C2 }, status: "retired" } as never, daemon);
      await c.query("commit");
    } finally {
      c.release();
    }
    const tied = (await h.db.query<{ n: number }>("select count(distinct recorded_at)::int as n from runtime_pins where body->>'id' in ('pin_tieaaaaaaaa', 'pin_tiezzzzzzzz')")).rows[0]!.n;
    expect(tied).toBe(1);
    const shown = (await h.app.inject({ method: "GET", url: "/roster", headers: { cookie } })).json().roles.find((x: Json) => x.role === "author").rollback[0];
    // The later id wins the tie.
    expect(shown.restore.value).toBe(C2);
    const done = await signed("runtime.rollback", { runtime: "claude", roles: [{ role: "author", current: shown.current.value, restore: shown.restore.value }] });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json().pins.map((p: Json) => p.artifact_digest.value)).toEqual([C2]);
  });

  it("names the run that finished last for each runtime, even when it reported no sandbox or finished out of order", async () => {
    const at = (min: number) => new Date(Date.now() + min * 60e3).toISOString();
    const finished = async (id: string, finishedAt: string, trace?: Json) => {
      const body = { schema_version: "0.1.0", id, package_id: "WP-ROSTER", package_revision: 0, role: "author", agent_baseline: "author-claude",
        runtime: { kind: "subscription", provider: "claude", model: "default" }, round: 1, status: "succeeded", queued_at: at(0), finished_at: finishedAt, generation: 1,
        ...(trace ? { trace } : {}) };
      await h.admin.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, 'WP-ROSTER', 0, 'author', 1, 'succeeded', $2)", [id, body]);
    };
    // Created first but finished last, with no trace: it is the latest, and its sandbox is not reported.
    const last = at(30);
    await finished("R-roster02", last);
    await finished("R-roster03", at(20), { sandbox: "workspace-write" });
    const r = (await h.app.inject({ method: "GET", url: "/roster", headers: { cookie } })).json();
    expect(r.sandbox.launched).toEqual([{ runtime: "claude", sandbox: "not reported", run_id: "R-roster02", at: last }]);
  });

  it("shows only the viewer's organization", async () => {
    await h.admin.query(`insert into organizations (body) values ('{"id":"orgrosterother_x","name":"Other","status":"suspended"}')`);
    // Another organization's pin, probe, policy and run.
    // Recorded through the app's own record path, so each is a complete, valid record of that organization.
    const c = await h.admin.connect();
    try {
      await c.query("begin");
      const daemon = { kind: "agent" as const, id: "daemon" };
      const digest = { algorithm: "sha256", value: "d".repeat(64) };
      await recordObject(c, "runtime_probe", { id: "rpb_other", org_id: "orgrosterother_x", runtime: "codex", artifact_digest: digest, version: "9.9.9", auth_state: "unknown",
        outcome: "pass", detail: "ready", observed_at: new Date().toISOString() } as never, daemon);
      await recordObject(c, "runtime_artifact_version", { id: "rav_other", org_id: "orgrosterother_x", runtime: "codex", version: "9.9.9", artifact_digest: digest, install_path: "/elsewhere", probe_ids: ["rpb_other"] } as never, daemon);
      await recordObject(c, "runtime_pin", { id: "pin_other", org_id: "orgrosterother_x", role: "author", runtime: "codex", artifact_version_id: "rav_other", artifact_digest: digest, status: "active" } as never, daemon);
      await recordSandboxPolicy(c, { id: "sbp_other", version: 1, org_id: "orgrosterother_x", driver: "native-cli", denied_read: ["~/.secret-login"], writable_roots: [],
        allowed_hosts: [], enabled_tools: [], mandatory_claims: [] }, daemon);
      await c.query("commit");
    } finally {
      c.release();
    }
    // A run another organization owns. The ownership triggers give new rows to the one active
    // organization, so this fixture sets aside only those two triggers, inside its own transaction;
    // foreign keys and every other trigger still hold.
    const o = await h.admin.connect();
    try {
      await o.query("begin");
      await o.query("alter table packages disable trigger packages_owned");
      await o.query("alter table runs disable trigger runs_owned");
      await o.query("insert into object_owners (object_kind, object_id, org_id) values ('package', 'WP-ROSTER-OTHER', 'orgrosterother_x'), ('run', 'R-roster-other', 'orgrosterother_x')");
      await o.query("insert into packages (id, revision, status, body) values ('WP-ROSTER-OTHER', 0, 'in-work', $1)",
        [{ ...example, id: "WP-ROSTER-OTHER", revision: 0, status: "in-work", data_lane: "internal", design_inputs: [] }])
      await o.query("insert into runs (id, package_id, package_revision, role, round, status, body) values ('R-roster-other', 'WP-ROSTER-OTHER', 0, 'author', 1, 'succeeded', $1)",
        [{ schema_version: "0.1.0", id: "R-roster-other", package_id: "WP-ROSTER-OTHER", package_revision: 0, role: "author", agent_baseline: "author-secret",
          runtime: { kind: "subscription", provider: "codex", model: "default" }, round: 1, status: "succeeded", queued_at: new Date().toISOString(),
          finished_at: new Date(Date.now() + 3600e3).toISOString(), generation: 1, trace: { sandbox: "none" } }])
      await o.query("alter table packages enable trigger packages_owned");
      await o.query("alter table runs enable trigger runs_owned");
      await o.query("commit");
    } finally {
      o.release();
    }
    const res = await h.app.inject({ method: "GET", url: "/roster", headers: { cookie } });
    expect(res.statusCode, res.body).toBe(200);
    const r = res.json();
    // The viewer's own records are all there, so absence below means filtered, not failed.
    expect(r.roles.map((x: Json) => x.role)).toEqual(["intake", "requirements-preparer", "technical-preparer", "author", "pre-check"]);
    expect(r.baselines.map((b: Json) => b.id)).toContain("author-claude");
    expect(r.versions.some((v: Json) => v.runtime === "claude")).toBe(true);
    expect(r.roles.find((x: Json) => x.role === "author").pins.length).toBeGreaterThan(0);
    expect(r.sandbox.launched.map((l: Json) => l.runtime)).toEqual(["claude"]);
    expect(r.sandbox.policies).toEqual([]);
    for (const secret of ["author-secret", "R-roster-other", "pin_other", "sbp_other", "9.9.9", "d".repeat(64)]) expect(res.body, secret).not.toContain(secret);
  });
});
