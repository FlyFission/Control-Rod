import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { command } from "../src/commands/executor.js";
import { backfillCheckerAttempts, STICKY_FAIL_CHANGE, STICKY_FAIL_REASON, classifyCheckerOutcome } from "../src/checker-attempts.js";
import { digest } from "../src/kernel.js";
import { REASONS } from "../src/refusals.js";
import { loadValidator } from "../src/schemas.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/**
 * Sticky checker fails (milestone 3). A fail stays on the deliverable digest. Timeout, error,
 * quota and cancelled attempts are inconclusive: they are listed, they are not a pass, and they
 * do not hide the fail.
 */
let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

type Method = "GET" | "POST" | "PUT";
const asOwner = (method: Method, url: string, payload?: unknown) =>
  h.app.inject({
    method,
    url,
    headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN }) },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
const asDaemon = (url: string, payload: unknown) =>
  h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: withClaim(url, payload as Record<string, unknown>) });

interface Job {
  run: { id: string; role: string; package_id: string; round: number; generation?: number; agent_baseline: string; runtime: { provider: string; model: string } };
  claim: { token: string };
}

async function claim(runtimes = ["fake"]): Promise<Job | null> {
  const r = await asDaemon("/runner/claim", { runtimes });
  if (r.statusCode === 204) return null;
  const job = r.json() as Job;
  claims.set(job.run.id, job.claim.token);
  return job;
}

function draft(id: string) {
  return {
    schema_version: "0.1.0",
    id,
    revision: 0,
    title: `Package ${id}`,
    project: "PRJ-TEST",
    mode: "capital-projects",
    status: "draft",
    rigor_mode: "standard",
    data_lane: "internal",
    objective: `Produce ${id}`,
    deliverables: [{ id: `${id}-D1`, type: "report", format: ["md"] }],
    design_inputs: [],
    agent_assignment: [{ role: "general-author", agent_baseline: "author", baseline_revision: 0 }],
    acceptance_criteria: ["The report exists"],
    verification: {
      method: "agent-pre-check",
      verifier: "checker",
      verifier_receives: ["deliverables"],
      required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
    },
  };
}

async function decide(id: string, kind: string, revision: number, reason?: string) {
  const o = await asOwner("POST", `/packages/${id}/decisions/options`, { kind, package_revision: revision });
  expect(o.statusCode, o.body).toBe(200);
  const assertion = passkey.assert(o.json().options);
  return asOwner("POST", `/packages/${id}/decisions`, { kind, package_revision: revision, ...(reason ? { reason } : {}), assertion });
}

async function releasedPackage(key: string): Promise<string> {
  const c = await asOwner("POST", "/captures", { lane: "internal", text: `Make ${key}` });
  expect(c.statusCode, c.body).toBe(201);
  const job = await claim();
  if (!job || job.run.role !== "intake") throw new Error(`expected intake, got ${job?.run.role ?? "nothing"}`);
  const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
    status: "succeeded",
    outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(draft(key))) }],
  });
  expect(r.statusCode, r.body).toBeLessThan(300);
  const pkgs = (await asOwner("GET", "/packages")).json() as { id: string }[];
  const id = pkgs.find((p) => p.id.endsWith(`-${key}`))?.id;
  if (!id) throw new Error("package not drafted");
  expect((await decide(id, "release", 0)).statusCode).toBe(201);
  return id;
}

async function claimRole(id: string, role: string, runtimes: string[]): Promise<Job> {
  const job = await claim(runtimes);
  if (!job || job.run.package_id !== id || job.run.role !== role) {
    throw new Error(`expected ${role} on ${id}, got ${job ? `${job.run.role} on ${job.run.package_id}` : "nothing"}`);
  }
  return job;
}

function trace(job: Job, reported: string) {
  const at = new Date().toISOString();
  return {
    schema_version: "0.1.0",
    run_id: job.run.id,
    package_id: job.run.package_id,
    package_revision: 0,
    agent_baseline: job.run.agent_baseline,
    baseline_revision: 0,
    tool: { name: "fake", version: "test" },
    inputs: [],
    outputs: [],
    started_at: at,
    finished_at: at,
    reported_model: reported,
  };
}

const report = (text: string) => ({ name: "report.md", content_base64: b64(text) });

async function author(id: string, text: string) {
  const job = await claimRole(id, "author", ["fake"]);
  const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", outputs: [report(text)] });
  expect(r.statusCode, r.body).toBeLessThan(300);
  return job;
}

async function check(id: string, payload: Record<string, unknown>, reported = "codex-test-model") {
  const job = await claimRole(id, "pre-check", ["codex"]);
  const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, { ...payload, trace: trace(job, reported) });
  expect(r.statusCode, r.body).toBeLessThan(300);
  return job;
}

async function attempts(id: string) {
  const r = await asOwner("GET", `/packages/${id}/checker-attempts`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as {
    id: string;
    outcome: string;
    counts_as: string;
    checker_runtime: string;
    reported_model?: string;
    deliverable_digest: { value: string };
    started_at: string;
    finished_at: string;
    evidence: string;
    recheck_override?: { by: string; reason: string };
  }[];
}

async function signOverride(id: string, reason: string) {
  const o = await asOwner("POST", `/packages/${id}/recheck-overrides/options`, { reason });
  expect(o.statusCode, o.body).toBe(200);
  const assertion = passkey.assert(o.json().options);
  const r = await asOwner("POST", `/packages/${id}/recheck-overrides`, { reason, assertion });
  expect(r.statusCode, r.body).toBe(200);
  return { options: o.json(), recorded: r.json() };
}

/** Completes whatever is still queued so the next test's intake is the next claim. */
async function settleOpenRuns() {
  for (let i = 0; i < 8; i++) {
    const job = await claim(["fake", "codex"]);
    if (!job) return;
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "settled by the test", outputs: [] });
    expect(r.statusCode, r.body).toBeLessThan(300);
  }
}

describe("classify a checker outcome", () => {
  it("counts timeout, error, quota and cancelled as inconclusive, and a checker verdict as itself", () => {
    expect(classifyCheckerOutcome("failed", "timeout", undefined)).toEqual({ outcome: "timeout", counts_as: "inconclusive" });
    expect(classifyCheckerOutcome("failed", "quota exceeded", undefined)).toEqual({ outcome: "quota", counts_as: "inconclusive" });
    expect(classifyCheckerOutcome("failed", "rate limited", undefined)).toEqual({ outcome: "quota", counts_as: "inconclusive" });
    expect(classifyCheckerOutcome("failed", "cancelled", undefined)).toEqual({ outcome: "cancelled", counts_as: "inconclusive" });
    expect(classifyCheckerOutcome("stopped", "Stopped by the owner", undefined)).toEqual({ outcome: "cancelled", counts_as: "inconclusive" });
    expect(classifyCheckerOutcome("failed", "agent exited with status 1", undefined)).toEqual({ outcome: "error", counts_as: "inconclusive" });
    expect(classifyCheckerOutcome("lost", "runner lost", undefined).counts_as).toBe("inconclusive");
    expect(classifyCheckerOutcome("succeeded", undefined, "pass")).toEqual({ outcome: "pass", counts_as: "pass" });
    expect(classifyCheckerOutcome("succeeded", undefined, "fail")).toEqual({ outcome: "fail", counts_as: "fail" });
    expect(classifyCheckerOutcome("succeeded", undefined, "inconclusive")).toEqual({ outcome: "inconclusive", counts_as: "inconclusive" });
    // A failed run cannot become a pass by also carrying a verdict.
    expect(classifyCheckerOutcome("failed", "timeout", "pass").counts_as).toBe("inconclusive");
  });
});

describe("sticky checker fails", () => {
  afterEach(async () => {
    await settleOpenRuns();
  });
  it("refuses a re-run on the same digest, allows one after a signed override, and lists every attempt", async () => {
    const id = await releasedPackage("STICKY");
    await author(id, "version one");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [{ text: "The report is short" }] } });

    const again = await asOwner("POST", `/packages/${id}/checks`);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: "sticky-fail", message: STICKY_FAIL_REASON, change: STICKY_FAIL_CHANGE });
    expect(REASONS["sticky-fail"]?.sentence).toBe(STICKY_FAIL_REASON);

    const bare = await asOwner("POST", `/packages/${id}/recheck-overrides`, { reason: "Look again" });
    expect(bare.statusCode).toBe(403);
    expect(bare.json().code).toBe("unsigned");

    // The author revises without changing the deliverable. The check stays refused.
    await author(id, "version one");
    expect(await claim(["codex"])).toBeNull();
    const held = await asOwner("GET", `/packages/${id}`);
    expect(held.json().check_blocked).toMatchObject({
      code: "sticky-fail",
      reason: STICKY_FAIL_REASON,
      change: STICKY_FAIL_CHANGE,
    });
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(409);

    const signed = await signOverride(id, "The fail was on a criterion we have now clarified");
    expect(signed.recorded.override).toMatchObject({ by: "ben", reason: "The fail was on a criterion we have now clarified" });
    const rerun = await asOwner("POST", `/packages/${id}/checks`);
    expect(rerun.statusCode, rerun.body).toBe(200);
    expect(rerun.json().role).toBe("pre-check");

    const timed = await check(id, { status: "failed", error: "timeout", outputs: [] });
    const afterTimeout = await asOwner("GET", `/packages/${id}`);
    expect(afterTimeout.json().pre_check.outcome).toBe("fail");
    const listed = await attempts(id);
    expect(listed.map((a) => a.outcome)).toEqual(["fail", "timeout"]);
    expect(listed.map((a) => a.counts_as)).toEqual(["fail", "inconclusive"]);
    expect(listed[1]).toMatchObject({
      checker_runtime: "codex",
      reported_model: "codex-test-model",
      evidence: `/packages/${id}/runs/${timed.run.id}/log`,
      recheck_override: { by: "ben", reason: "The fail was on a criterion we have now clarified" },
    });
    expect(listed[0]?.deliverable_digest.value).toBe(listed[1]?.deliverable_digest.value);
    expect(listed[0]?.started_at).toBeTruthy();
    expect(listed[1]?.finished_at).toBeTruthy();
    expect(afterTimeout.json().checker_attempts.map((a: { id: string }) => a.id)).toEqual(listed.map((a) => a.id));
    const accept = (await asOwner("GET", `/packages/${id}/actions`)).json().find((a: { command: string }) => a.command === "accept");
    expect(accept.allowed).toBe(false);

    // The override was spent on the timeout. Requeue and a fresh request are refused again.
    expect((await asOwner("POST", `/packages/${id}/runs/${timed.run.id}/requeue`)).json().code).toBe("sticky-fail");
    expect((await asOwner("POST", `/packages/${id}/checks`)).json().code).toBe("sticky-fail");

    await signOverride(id, "Quota was the provider, not the work");
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(200);
    await check(id, { status: "failed", error: "quota exceeded", outputs: [] }, "codex-quota-model");

    await signOverride(id, "One more look, recorded as inconclusive");
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(200);
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "inconclusive", findings: [] } });

    const all = await attempts(id);
    expect(all.map((a) => a.outcome)).toEqual(["fail", "timeout", "quota", "inconclusive"]);
    expect(all.map((a) => a.counts_as)).toEqual(["fail", "inconclusive", "inconclusive", "inconclusive"]);
    expect(all.every((a) => a.counts_as !== "pass")).toBe(true);
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.pre_check.outcome).toBe("fail");
    expect(view.recheck_overrides).toHaveLength(3);
    expect(view.recheck_overrides.map((o: { override: { reason: string } }) => o.override.reason)).toEqual([
      "The fail was on a criterion we have now clarified",
      "Quota was the provider, not the work",
      "One more look, recorded as inconclusive",
    ]);

    const events = ((await asOwner("GET", "/events")).json() as { type: string; subject: string; data?: { outcome?: string } }[])
      .filter((e) => e.subject === id && e.type === "package.checker-attempt");
    expect(events.map((e) => e.data?.outcome)).toEqual(["fail", "timeout", "quota", "inconclusive"]);

    await expect(h.admin.query("update checker_attempts set body = body")).rejects.toThrow(/append only/);
    await expect(h.admin.query("delete from checker_recheck_overrides")).rejects.toThrow(/append only/);
    await expect(h.admin.query("delete from checker_recheck_uses")).rejects.toThrow(/append only/);

    await settleOpenRuns();
  });

  it("allows a check after the deliverable digest changes", async () => {
    const id = await releasedPackage("REVISED");
    await author(id, "version one");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(409);

    await author(id, "version two, rewritten");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [],
      trace: trace(job, "codex-revised-model"),
      verification: { outcome: "pass", findings: [] },
    });
    expect(done.statusCode, done.body).toBeLessThan(300);

    const listed = await attempts(id);
    expect(listed.map((a) => a.outcome)).toEqual(["fail", "pass"]);
    expect(listed[0]?.deliverable_digest.value).not.toBe(listed[1]?.deliverable_digest.value);
    expect((await asOwner("GET", `/packages/${id}`)).json().pre_check.outcome).toBe("pass");
    expect((await asOwner("GET", `/packages/${id}`)).json().check_blocked).toBeUndefined();
  });

  it("keeps a fail that was recorded before attempts existed, and copies it into the history", async () => {
    const id = await releasedPackage("LEGACY");
    await author(id, "legacy report");
    const outs = (await h.admin.query<{ name: string; sha256: string }>(
      "select name, sha256 from outputs where package_id = $1 order by name",
      [id],
    )).rows;
    const value = digest(outs.map((o) => ({ name: o.name, sha256: o.sha256 })));
    const runId = "R-legacyfail";
    const at = "2026-11-01T00:00:00.000Z";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 1, 'succeeded', $3)",
      [runId, id, {
        schema_version: "0.1.0", id: runId, package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 1, status: "succeeded", queued_at: at, started_at: at, finished_at: at,
        trace: { reported_model: "legacy-model" },
      }],
    );
    await h.admin.query(
      "insert into verifications (run_id, package_id, package_revision, round, body) values ($1, $2, 0, 1, $3)",
      [runId, id, {
        schema_version: "0.1.0", package_id: id, package_revision: 0,
        output: { path: "report.md", digest: { algorithm: "sha256", value } },
        method: "agent-pre-check", verifier: "checker", evidence: [], findings: [], outcome: "fail",
      }],
    );
    expect((await h.db.query("select 1 from checker_attempts where run_id = $1", [runId])).rowCount).toBe(0);
    const refused = await asOwner("POST", `/packages/${id}/checks`);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json().code).toBe("sticky-fail");

    const copied = await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    expect(copied).toBeGreaterThanOrEqual(1);
    const again = await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    expect(again).toBe(0);
    const listed = await attempts(id);
    expect(listed).toEqual([expect.objectContaining({
      run_id: runId, outcome: "fail", counts_as: "fail", checker_runtime: "codex", reported_model: "legacy-model",
      deliverable_digest: { algorithm: "sha256", value },
    })]);
    await settleOpenRuns();
  });

  it("records an attempt when a restart reports the checker process gone", async () => {
    const id = await releasedPackage("RESTART");
    await author(id, "still running");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const receipt = {
      pid: 4242, pgid: 4242, process_start: "123456", boot_id: "boot-1",
      generation: job.run.generation ?? 1, started_at: new Date().toISOString(), containment: "cgroup", unit: "controlrod-run-restart",
    };
    expect((await asDaemon(`/runner/runs/${job.run.id}/log`, { lines: [], receipt })).statusCode).toBe(200);
    const ev = await asDaemon(`/runner/runs/${job.run.id}/evidence`, { observation: "process-gone", receipt });
    expect(ev.statusCode, ev.body).toBe(200);
    const listed = await attempts(id);
    expect(listed).toEqual([expect.objectContaining({ run_id: job.run.id, counts_as: "inconclusive" })]);
    expect(listed[0]?.outcome).not.toBe("pass");
    await settleOpenRuns();
  });

  it("lets a timeout with no earlier fail be requeued, and still does not count it as a pass", async () => {
    const id = await releasedPackage("TIMEOUT");
    await author(id, "only version");
    const timed = await check(id, { status: "failed", error: "timeout", outputs: [] });
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.pre_check).toBeUndefined();
    expect(view.checker_attempts).toMatchObject([{ outcome: "timeout", counts_as: "inconclusive" }]);
    const again = await asOwner("POST", `/packages/${id}/runs/${timed.run.id}/requeue`);
    expect(again.statusCode, again.body).toBe(201);
    expect(again.json().role).toBe("pre-check");
    await settleOpenRuns();
  });
});
