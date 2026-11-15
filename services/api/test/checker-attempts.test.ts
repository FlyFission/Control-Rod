import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { command } from "../src/commands/executor.js";
import { backfillCheckerAttempts, STICKY_FAIL_CHANGE, STICKY_FAIL_REASON, classifyCheckerOutcome, recordCheckerAttempt } from "../src/checker-attempts.js";
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
    run_id?: string;
    outcome: string;
    counts_as: string;
    checker_runtime: string;
    reported_model?: string;
    seq?: number;
    deliverable_digest?: { value: string };
    digest_unknown?: boolean;
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
  it("refuses a re-run on the same digest and shows why", async () => {
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

    await author(id, "version one");
    expect(await claim(["codex"])).toBeNull();
    const held = await asOwner("GET", `/packages/${id}`);
    expect(held.json().check_blocked).toMatchObject({ code: "sticky-fail", reason: STICKY_FAIL_REASON, change: STICKY_FAIL_CHANGE });
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(409);
    await settleOpenRuns();
  });

  it("spends a signed override on one recheck, and a timeout does not hide the fail", async () => {
    const id = await releasedPackage("OVR");
    await author(id, "version one");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "version one");
    expect(await claim(["codex"])).toBeNull();
    const signed = await signOverride(id, "The fail was on a criterion we have now clarified");
    expect(signed.recorded.override).toMatchObject({ by: "ben", reason: "The fail was on a criterion we have now clarified" });
    const rerun = await asOwner("POST", `/packages/${id}/checks`);
    expect(rerun.statusCode, rerun.body).toBe(201);
    expect(rerun.json().role).toBe("pre-check");
    expect((await h.admin.query("select 1 from checker_recheck_uses where run_id = $1", [rerun.json().id])).rowCount).toBe(0);

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
    expect(listed[0]?.deliverable_digest?.value).toBe(listed[1]?.deliverable_digest?.value);
    expect((await asOwner("POST", `/packages/${id}/runs/${timed.run.id}/requeue`)).json().code).toBe("sticky-fail");
    expect((await asOwner("POST", `/packages/${id}/checks`)).json().code).toBe("sticky-fail");
    const accept = (await asOwner("GET", `/packages/${id}/actions`)).json().find((a: { command: string }) => a.command === "accept");
    expect(accept.allowed).toBe(false);
    await settleOpenRuns();
  });

  it("keeps quota and inconclusive attempts on the record under the fail", async () => {
    const id = await releasedPackage("LIST");
    await author(id, "version one");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "version one");
    expect(await claim(["codex"])).toBeNull();
    await signOverride(id, "Quota was the provider, not the work");
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(201);
    await check(id, { status: "failed", error: "quota exceeded", outputs: [] }, "codex-quota-model");
    await signOverride(id, "One more look, recorded as inconclusive");
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(201);
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "inconclusive", findings: [] } });

    const all = await attempts(id);
    expect(all.map((a) => a.outcome)).toEqual(["fail", "quota", "inconclusive"]);
    expect(all.map((a) => a.counts_as)).toEqual(["fail", "inconclusive", "inconclusive"]);
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.pre_check.outcome).toBe("fail");
    expect(view.checker_attempts.map((a: { id: string }) => a.id)).toEqual(all.map((a) => a.id));
    expect(view.recheck_overrides).toHaveLength(2);
    const events = ((await asOwner("GET", "/events")).json() as { type: string; subject: string; data?: { outcome?: string } }[])
      .filter((e) => e.subject === id && e.type === "package.checker-attempt");
    expect(events.map((e) => e.data?.outcome)).toEqual(["fail", "quota", "inconclusive"]);
    await settleOpenRuns();
  });

  it("rejects update, delete and truncate of the checker history", async () => {
    await expect(h.admin.query("update checker_attempts set body = body")).rejects.toThrow(/append only/);
    await expect(h.admin.query("delete from checker_recheck_overrides")).rejects.toThrow(/append only/);
    await expect(h.admin.query("delete from checker_recheck_uses")).rejects.toThrow(/append only/);
    await expect(h.admin.query("truncate checker_attempts")).rejects.toThrow(/append only/);
    await expect(h.admin.query("truncate checker_recheck_uses, checker_recheck_overrides")).rejects.toThrow(/append only/);
    await expect(h.admin.query("truncate checker_queued_digests")).rejects.toThrow(/append only/);
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
    expect(listed[0]?.deliverable_digest?.value).not.toBe(listed[1]?.deliverable_digest?.value);
    expect((await asOwner("GET", `/packages/${id}`)).json().pre_check.outcome).toBe("pass");
    expect((await asOwner("GET", `/packages/${id}`)).json().check_blocked).toBeUndefined();
  });

  it("copies a fail from the verification the checker run wrote", async () => {
    const id = await releasedPackage("LEGACY");
    await author(id, "legacy report");
    const job = await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    const written = (await h.admin.query<{ value: string }>(
      "select body->'output'->'digest'->>'value' as value from verifications where run_id = $1",
      [job.run.id],
    )).rows[0]?.value;
    expect(written).toMatch(/^[0-9a-f]{64}$/);
    await h.admin.query("alter table checker_attempts disable trigger checker_attempts_frozen");
    await h.admin.query("delete from checker_attempts where run_id = $1", [job.run.id]);
    await h.admin.query("alter table checker_attempts enable trigger checker_attempts_frozen");
    await h.admin.query("alter table checker_queued_digests disable trigger checker_queued_digests_frozen");
    await h.admin.query("delete from checker_queued_digests where run_id = $1", [job.run.id]);
    await h.admin.query("alter table checker_queued_digests enable trigger checker_queued_digests_frozen");
    const refused = await asOwner("POST", `/packages/${id}/checks`);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json().code).toBe("sticky-fail");

    const copied = await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    expect(copied).toBeGreaterThanOrEqual(1);
    const again = await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    expect(again).toBe(0);
    const listed = await attempts(id);
    expect(listed).toEqual([expect.objectContaining({
      run_id: job.run.id, outcome: "fail", counts_as: "fail",
      deliverable_digest: { algorithm: "sha256", value: written },
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

  it("attributes a timeout to the digest captured when the check was queued", async () => {
    const id = await releasedPackage("PINNED");
    await author(id, "first bytes");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const pinned = (await h.admin.query<{ deliverable_digest: string }>("select deliverable_digest from checker_queued_digests where run_id = $1", [job.run.id])).rows[0]?.deliverable_digest;
    expect(pinned).toMatch(/^[0-9a-f]{64}$/);
    await h.admin.query("update outputs set sha256 = $2, bytes = $3 where package_id = $1", [id, "b".repeat(64), Buffer.from("changed")]);
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "timeout", outputs: [], trace: trace(job, "codex-test-model") });
    expect(done.statusCode, done.body).toBeLessThan(300);
    expect((await attempts(id))[0]?.deliverable_digest?.value).toBe(pinned);
    await settleOpenRuns();
  });

  it("does not spend an override that was signed for another revision", async () => {
    const id = await releasedPackage("OVREV");
    await author(id, "held bytes");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    const digestValue = (await attempts(id))[0]?.deliverable_digest?.value;
    await h.admin.query(
      "insert into checker_recheck_overrides (id, package_id, package_revision, deliverable_digest, body) values ($1, $2, 9, $3, $4)",
      ["RO-otherrev", id, digestValue, {
        by: "ben", at: new Date().toISOString(), reason: "A different revision",
        subject_digest: { algorithm: "sha256", value: "a".repeat(64) },
        assertion: { credential_id: "k", authenticator_data: "a", client_data_json: "c", signature: "s" },
      }],
    );
    expect((await asOwner("POST", `/packages/${id}/checks`)).json().code).toBe("sticky-fail");
    await settleOpenRuns();
  });

  it("refuses to requeue a check from an earlier author round", async () => {
    const id = await releasedPackage("OLDROUND");
    await author(id, "round one");
    const timed = await check(id, { status: "failed", error: "timeout", outputs: [] });
    const at = new Date().toISOString();
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'author', 2, 'succeeded', $3)",
      ["R-laterauthor", id, {
        schema_version: "0.1.0", id: "R-laterauthor", package_id: id, package_revision: 0, role: "author",
        agent_baseline: "author", runtime: { kind: "local", provider: "fake", model: "fake" },
        round: 2, status: "succeeded", queued_at: at,
      }],
    );
    const again = await asOwner("POST", `/packages/${id}/runs/${timed.run.id}/requeue`);
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json().code).toBe("wrong-state");
    await settleOpenRuns();
  });

  it("records a queued check that a return stops", async () => {
    const id = await releasedPackage("RETURNED");
    await author(id, "send it back");
    const returned = await decide(id, "return", 0, "Send it back before the check starts");
    expect(returned.statusCode, returned.body).toBe(201);
    const listed = await attempts(id);
    expect(listed.map((a) => a.counts_as)).toEqual(["inconclusive"]);
    expect(listed[0]?.outcome).toBe("cancelled");
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

  it("stops a check that was queued before the fail, including one with no captured digest", async () => {
    const id = await releasedPackage("QUEUED");
    await author(id, "queued bytes");
    const queued = (await h.admin.query<{ id: string }>(
      "select id from runs where package_id = $1 and role = 'pre-check' and status = 'queued'",
      [id],
    )).rows[0];
    if (!queued) throw new Error("expected a queued check");
    const pinned = (await h.admin.query<{ deliverable_digest: string }>(
      "select deliverable_digest from checker_queued_digests where run_id = $1",
      [queued.id],
    )).rows[0]?.deliverable_digest;
    const at = "2026-11-02T00:00:00.000Z";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 1, 'succeeded', $3)",
      ["R-sidefail", id, {
        schema_version: "0.1.0", id: "R-sidefail", package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 1, status: "succeeded", queued_at: at, started_at: at, finished_at: at,
      }],
    );
    await h.admin.query(
      "insert into verifications (run_id, package_id, package_revision, round, body) values ($1, $2, 0, 1, $3)",
      ["R-sidefail", id, {
        schema_version: "0.1.0", package_id: id, package_revision: 0,
        output: { path: "report.md", digest: { algorithm: "sha256", value: pinned } },
        method: "agent-pre-check", verifier: "checker", evidence: [], findings: [], outcome: "fail",
      }],
    );
    expect((await asOwner("POST", `/packages/${id}/checks`)).json().code).toBe("check-active");
    expect(await claim(["codex"])).toBeNull();
    expect((await h.admin.query<{ status: string }>("select status from runs where id = $1", [queued.id])).rows[0]?.status).toBe("stopped");
    expect((await attempts(id)).some((a) => a.run_id === queued.id && a.outcome === "cancelled")).toBe(true);
    expect((await asOwner("GET", `/packages/${id}`)).json().check_blocked.code).toBe("sticky-fail");

    const late = "R-premigrate";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 1, 'queued', $3)",
      [late, id, {
        schema_version: "0.1.0", id: late, package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "unassigned", runtime: { kind: "local", provider: "any", model: "any" },
        round: 1, status: "queued", queued_at: at,
      }],
    );
    await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    expect((await h.admin.query<{ status: string }>("select status from runs where id = $1", [late])).rows[0]?.status).toBe("stopped");
    const copied = (await attempts(id)).find((a) => a.run_id === late);
    expect(copied?.digest_unknown).toBe(true);
    expect(copied?.deliverable_digest).toBeUndefined();
    await settleOpenRuns();
  });

  it("does not admit a pass once a fail governs, unless that run spent an override", async () => {
    const id = await releasedPackage("ADMIT");
    await author(id, "admit bytes");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const pinned = (await h.admin.query<{ deliverable_digest: string }>(
      "select deliverable_digest from checker_queued_digests where run_id = $1",
      [job.run.id],
    )).rows[0]?.deliverable_digest;
    const at = "2026-11-03T00:00:00.000Z";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 2, 'succeeded', $3)",
      ["R-alreadyfail", id, {
        schema_version: "0.1.0", id: "R-alreadyfail", package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 2, status: "succeeded", queued_at: at, started_at: at, finished_at: at,
      }],
    );
    await h.admin.query(
      "insert into verifications (run_id, package_id, package_revision, round, body) values ($1, $2, 0, 2, $3)",
      ["R-alreadyfail", id, {
        schema_version: "0.1.0", package_id: id, package_revision: 0,
        output: { path: "report.md", digest: { algorithm: "sha256", value: pinned } },
        method: "agent-pre-check", verifier: "checker", evidence: [], findings: [], outcome: "fail",
      }],
    );
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded", outputs: [], trace: trace(job, "codex-test-model"), verification: { outcome: "pass", findings: [] },
    });
    expect(done.statusCode, done.body).toBeLessThan(300);
    expect((await h.admin.query("select 1 from verifications where run_id = $1", [job.run.id])).rowCount).toBe(0);
    expect((await attempts(id)).find((a) => a.run_id === job.run.id)?.counts_as).toBe("inconclusive");
    expect((await asOwner("GET", `/packages/${id}`)).json().pre_check.outcome).toBe("fail");
    await settleOpenRuns();
  });

  it("clears the block after an overridden recheck passes", async () => {
    const id = await releasedPackage("CLEAR");
    await author(id, "clear bytes");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "clear bytes");
    expect(await claim(["codex"])).toBeNull();
    await signOverride(id, "The criterion was misread");
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(201);
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.pre_check.outcome).toBe("pass");
    expect(view.check_blocked).toBeUndefined();
    await settleOpenRuns();
  });

  it("does not reuse a pass after the acceptance criteria change and the files do not", async () => {
    const id = await releasedPackage("CRITERIA");
    await author(id, "same bytes");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });
    const oldDigest = (await attempts(id))[0]?.deliverable_digest?.value;
    expect((await decide(id, "return", 0, "Add a source criterion")).statusCode).toBe(201);
    const draft = await asOwner("GET", `/packages/${id}`);
    const body = draft.json();
    expect(body.package.revision).toBe(1);
    const edited = await h.app.inject({
      method: "PUT",
      url: `/packages/${id}`,
      headers: { cookie, origin: ORIGIN, "if-match": body.draft_etag },
      payload: { ...body.package, acceptance_criteria: ["The report exists", "The report names its sources"] },
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect((await decide(id, "release", 1)).statusCode).toBe(201);
    await author(id, "same bytes");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const pinned = (await h.admin.query<{ deliverable_digest: string }>(
      "select deliverable_digest from checker_queued_digests where run_id = $1",
      [job.run.id],
    )).rows[0]?.deliverable_digest;
    expect(pinned).toBe(oldDigest);
    expect((await asOwner("GET", `/packages/${id}`)).json().pre_check).toBeUndefined();
    await settleOpenRuns();
  });

  it("does not let one package's fail stick to a new package with the same bytes", async () => {
    const id = await releasedPackage("STICKA");
    await author(id, "shared bytes");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "shared bytes");
    const other = await releasedPackage("STICKB");
    await author(other, "shared bytes");
    const job = await claimRole(other, "pre-check", ["codex"]);
    expect(job.run.package_id).toBe(other);
    await settleOpenRuns();
  });

  it("stops a claimed check when the deliverable changes before the result is admitted", async () => {
    const id = await releasedPackage("DRIFT");
    await author(id, "first bytes");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const pinned = (await h.admin.query<{ deliverable_digest: string }>(
      "select deliverable_digest from checker_queued_digests where run_id = $1",
      [job.run.id],
    )).rows[0]?.deliverable_digest;
    await h.admin.query("update outputs set sha256 = $2, bytes = $3 where package_id = $1", [id, "b".repeat(64), Buffer.from("changed")]);
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded", outputs: [], trace: trace(job, "codex-test-model"), verification: { outcome: "pass", findings: [] },
    });
    expect(done.statusCode, done.body).toBeLessThan(300);
    const listed = await attempts(id);
    expect(listed[0]?.deliverable_digest?.value).toBe(pinned);
    expect(listed[0]?.counts_as).toBe("inconclusive");
    expect((await h.admin.query("select 1 from verifications where run_id = $1", [job.run.id])).rowCount).toBe(0);
    await settleOpenRuns();
  });

  it("stops a queued check when the deliverable changes before it is claimed", async () => {
    const id = await releasedPackage("DRIFTQ");
    await author(id, "first bytes");
    await h.admin.query("update outputs set sha256 = $2, bytes = $3 where package_id = $1", [id, "c".repeat(64), Buffer.from("changed again")]);
    expect(await claim(["codex"])).toBeNull();
    const listed = await attempts(id);
    expect(listed[0]?.outcome).toBe("cancelled");
    expect(listed[0]?.digest_unknown).not.toBe(true);
    await settleOpenRuns();
  });

  it("keeps an override when the queued check is stopped before it is claimed", async () => {
    const id = await releasedPackage("UNBURN");
    await author(id, "held");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "held");
    expect(await claim(["codex"])).toBeNull();
    await signOverride(id, "One check, not spent until it starts");
    const rerun = await asOwner("POST", `/packages/${id}/checks`);
    expect(rerun.statusCode, rerun.body).toBe(201);
    const stop = await asOwner("POST", `/packages/${id}/runs/${rerun.json().id}/stop`);
    expect(stop.statusCode, stop.body).toBe(200);
    expect((await h.admin.query(
      "select count(*)::int as n from checker_recheck_uses u join checker_recheck_overrides o on o.id = u.override_id where o.package_id = $1",
      [id],
    )).rows[0]?.n).toBe(0);
    const again = await asOwner("POST", `/packages/${id}/checks`);
    expect(again.statusCode, again.body).toBe(201);
    await settleOpenRuns();
  });

  it("refuses a second check while one is already queued", async () => {
    const id = await releasedPackage("ACTIVE");
    await author(id, "in progress");
    const again = await asOwner("POST", `/packages/${id}/checks`);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("check-active");
    await settleOpenRuns();
  });

  it("records one attempt when two connections record the same run", async () => {
    const id = await releasedPackage("RACE");
    await author(id, "race");
    const at = new Date().toISOString();
    const run = {
      id: "R-race", package_id: id, package_revision: 0, role: "pre-check", round: 9, status: "failed",
      body: {
        schema_version: "0.1.0", id: "R-race", package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 9, status: "failed", queued_at: at, finished_at: at, error: "timeout",
      },
    };
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 9, 'failed', $3)",
      [run.id, id, run.body],
    );
    await Promise.all([
      command(h.db, "migration.backfill-checker-attempts", (c) => recordCheckerAttempt(c, loadValidator(), run)),
      command(h.db, "migration.backfill-checker-attempts", (c) => recordCheckerAttempt(c, loadValidator(), run)),
    ]);
    expect((await h.admin.query("select count(*)::int as n from checker_attempts where run_id = $1", [run.id])).rows[0]?.n).toBe(1);
    await settleOpenRuns();
  });

  it("marks a legacy run with no captured digest as unknown instead of today's bytes", async () => {
    const id = await releasedPackage("UNKNOWN");
    await author(id, "today");
    const at = "2026-11-04T00:00:00.000Z";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 4, 'failed', $3)",
      ["R-unknown", id, {
        schema_version: "0.1.0", id: "R-unknown", package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 4, status: "failed", queued_at: at, finished_at: at, error: "timeout",
      }],
    );
    await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    const listed = (await attempts(id)).find((a) => a.run_id === "R-unknown");
    expect(listed?.digest_unknown).toBe(true);
    expect(listed?.deliverable_digest).toBeUndefined();
    await settleOpenRuns();
  });

  it("records a minimal attempt when a legacy run cannot be validated, and continues", async () => {
    const id = await releasedPackage("MALFORM");
    await author(id, "kept");
    const at = "2026-11-05T00:00:00.000Z";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 4, 'failed', $3)",
      ["R-malformed", id, {
        schema_version: "0.1.0", id: "R-malformed", package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 4, status: "failed", queued_at: at, started_at: "not-a-date", finished_at: at, error: "timeout",
      }],
    );
    await expect(command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()))).resolves.toBeGreaterThanOrEqual(1);
    const listed = (await attempts(id)).find((a) => a.run_id === "R-malformed");
    expect(listed?.digest_unknown).toBe(true);
    expect(listed?.counts_as).toBe("inconclusive");
    await settleOpenRuns();
  });

  it("warns after repeated inconclusive checks and still allows another", async () => {
    const id = await releasedPackage("WARN");
    await author(id, "flaky");
    let last = await check(id, { status: "failed", error: "timeout", outputs: [] });
    for (let i = 0; i < 2; i++) {
      expect((await asOwner("POST", `/packages/${id}/runs/${last.run.id}/requeue`)).statusCode).toBe(201);
      last = await check(id, { status: "failed", error: "timeout", outputs: [] });
    }
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.check_blocked).toBeUndefined();
    expect(view.check_warning).toMatchObject({ code: "repeated-inconclusive" });
    expect(view.check_warning.count).toBeGreaterThanOrEqual(3);
    const page = await asOwner("GET", `/packages/${id}/checker-attempts?limit=1`);
    expect(page.statusCode, page.body).toBe(200);
    expect(page.json()).toHaveLength(1);
    const older = await asOwner("GET", `/packages/${id}/checker-attempts?before=${page.json()[0].seq}`);
    expect(older.json().length).toBeGreaterThanOrEqual(1);
    await settleOpenRuns();
  });

  it("refuses a long reason, a second unused override, a replayed assertion, a swapped reason, and a deliverable that changed before signing", async () => {
    const id = await releasedPackage("CEREMONY");
    await author(id, "ceremony");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "ceremony");
    expect(await claim(["codex"])).toBeNull();

    const long = await asOwner("POST", `/packages/${id}/recheck-overrides/options`, { reason: "x".repeat(2001) });
    expect(long.statusCode).toBe(400);
    expect(long.json().code).toBe("invalid");

    const reason = "The criterion was ambiguous";
    const swappedOptions = await asOwner("POST", `/packages/${id}/recheck-overrides/options`, { reason });
    expect(swappedOptions.statusCode, swappedOptions.body).toBe(200);
    const swappedAssertion = passkey.assert(swappedOptions.json().options);
    const swapped = await asOwner("POST", `/packages/${id}/recheck-overrides`, { reason: "A different reason", assertion: swappedAssertion });
    expect(swapped.statusCode).toBe(403);
    expect(swapped.json().code).toBe("unsigned");

    const options = await asOwner("POST", `/packages/${id}/recheck-overrides/options`, { reason });
    expect(options.statusCode, options.body).toBe(200);
    const assertion = passkey.assert(options.json().options);
    const first = await asOwner("POST", `/packages/${id}/recheck-overrides`, { reason, assertion });
    expect(first.statusCode, first.body).toBe(200);
    const replay = await asOwner("POST", `/packages/${id}/recheck-overrides`, { reason, assertion });
    expect(replay.statusCode).toBe(403);
    const second = await asOwner("POST", `/packages/${id}/recheck-overrides/options`, { reason: "Another unused override" });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe("override-unused");

    const rerun = await asOwner("POST", `/packages/${id}/checks`);
    expect(rerun.statusCode, rerun.body).toBe(201);
    await check(id, { status: "failed", error: "timeout", outputs: [] });

    const moved = await asOwner("POST", `/packages/${id}/recheck-overrides/options`, { reason: "Bytes moved" });
    expect(moved.statusCode, moved.body).toBe(200);
    await h.admin.query("update outputs set sha256 = $2, bytes = $3 where package_id = $1", [id, "d".repeat(64), Buffer.from("moved")]);
    const late = passkey.assert(moved.json().options);
    const refused = await asOwner("POST", `/packages/${id}/recheck-overrides`, { reason: "Bytes moved", assertion: late });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe("unsigned");
    await settleOpenRuns();
  });

  it("keeps an override when a claim is held by a budget, and when startup runs before the claim", async () => {
    const id = await releasedPackage("BUDGET");
    await author(id, "budget bytes");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "budget bytes");
    expect(await claim(["codex"])).toBeNull();
    await signOverride(id, "One check after the budget lets it start");
    const rerun = await asOwner("POST", `/packages/${id}/checks`);
    expect(rerun.statusCode, rerun.body).toBe(201);
    const uses = async () => (await h.admin.query(
      "select count(*)::int as n from checker_recheck_uses u join checker_recheck_overrides o on o.id = u.override_id where o.package_id = $1",
      [id],
    )).rows[0]?.n;
    expect(await uses()).toBe(0);

    await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    expect(await uses()).toBe(0);
    expect((await h.admin.query<{ status: string }>("select status from runs where id = $1", [rerun.json().id])).rows[0]?.status).toBe("queued");

    const org = (await h.admin.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]?.id;
    const payload = { scope: "organization", scope_id: org, mode: "hard-cap", limit: { value: "60", unit: "minute" }, period: "P1D" };
    const options = await asOwner("POST", "/admin/commands/budget.set/options", { payload });
    expect(options.statusCode, options.body).toBe(200);
    const set = await asOwner("POST", "/admin/commands/budget.set", { payload, assertion: passkey.assert(options.json().options) });
    expect(set.statusCode, set.body).toBe(200);
    try {
      expect(await claim(["codex"])).toBeNull();
      expect(await uses()).toBe(0);
      expect((await h.admin.query<{ status: string }>("select status from runs where id = $1", [rerun.json().id])).rows[0]?.status).toBe("queued");
    } finally {
      await h.admin.query("update budgets set body = jsonb_set(body, '{status}', '\"retired\"') where id = $1", [set.json().id]);
    }
    await settleOpenRuns();
  });

  it("does not let a running check spend an override at admission", async () => {
    const id = await releasedPackage("STEAL");
    await author(id, "steal bytes");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const pinned = (await h.admin.query<{ deliverable_digest: string }>(
      "select deliverable_digest from checker_queued_digests where run_id = $1",
      [job.run.id],
    )).rows[0]?.deliverable_digest;
    const at = "2026-11-06T00:00:00.000Z";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 2, 'succeeded', $3)",
      ["R-stealfail", id, {
        schema_version: "0.1.0", id: "R-stealfail", package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 2, status: "succeeded", queued_at: at, started_at: at, finished_at: at,
      }],
    );
    await h.admin.query(
      "insert into verifications (run_id, package_id, package_revision, round, body) values ($1, $2, 0, 2, $3)",
      ["R-stealfail", id, {
        schema_version: "0.1.0", package_id: id, package_revision: 0,
        output: { path: "report.md", digest: { algorithm: "sha256", value: pinned } },
        method: "agent-pre-check", verifier: "checker", evidence: [], findings: [], outcome: "fail",
      }],
    );
    await signOverride(id, "For a later check, not this one");
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded", outputs: [], trace: trace(job, "codex-test-model"), verification: { outcome: "pass", findings: [] },
    });
    expect(done.statusCode, done.body).toBeLessThan(300);
    expect((await h.admin.query("select 1 from verifications where run_id = $1", [job.run.id])).rowCount).toBe(0);
    expect((await h.admin.query(
      "select count(*)::int as n from checker_recheck_uses u join checker_recheck_overrides o on o.id = u.override_id where o.package_id = $1",
      [id],
    )).rows[0]?.n).toBe(0);
    expect((await attempts(id)).find((a) => a.run_id === job.run.id)?.counts_as).toBe("inconclusive");
    const again = await asOwner("POST", `/packages/${id}/checks`);
    expect(again.statusCode, again.body).toBe(201);
    await settleOpenRuns();
  });

  it("keeps a fail from a malformed legacy run that still has a valid verification", async () => {
    const id = await releasedPackage("MALFAIL");
    await author(id, "malformed fail");
    const queued = (await h.admin.query<{ id: string }>(
      "select id from runs where package_id = $1 and role = 'pre-check' and status = 'queued'",
      [id],
    )).rows[0];
    const pinned = (await h.admin.query<{ deliverable_digest: string }>(
      "select deliverable_digest from checker_queued_digests where run_id = $1",
      [queued?.id],
    )).rows[0]?.deliverable_digest;
    const at = "2026-11-07T00:00:00.000Z";
    await h.admin.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, 0, 'pre-check', 4, 'succeeded', $3)",
      ["R-malfail", id, {
        schema_version: "0.1.0", id: "R-malfail", package_id: id, package_revision: 0, role: "pre-check",
        agent_baseline: "checker", runtime: { kind: "subscription", provider: "codex", model: "default" },
        round: 4, status: "succeeded", queued_at: at, started_at: "not-a-date", finished_at: at,
      }],
    );
    await h.admin.query(
      "insert into verifications (run_id, package_id, package_revision, round, body) values ($1, $2, 0, 4, $3)",
      ["R-malfail", id, {
        schema_version: "0.1.0", package_id: id, package_revision: 0,
        output: { path: "report.md", digest: { algorithm: "sha256", value: pinned } },
        method: "agent-pre-check", verifier: "checker", evidence: [], findings: [], outcome: "fail",
      }],
    );
    await command(h.db, "migration.backfill-checker-attempts", (c) => backfillCheckerAttempts(c, loadValidator()));
    const listed = (await attempts(id)).find((a) => a.run_id === "R-malfail");
    expect(listed?.outcome).toBe("fail");
    expect(listed?.counts_as).toBe("fail");
    expect(listed?.deliverable_digest?.value).toBe(pinned);
    expect(listed?.digest_unknown).not.toBe(true);
    const refused = await asOwner("POST", `/packages/${id}/checks`);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json().code).toBe("sticky-fail");
    await settleOpenRuns();
  });

  it("pins a pre-migration check at claim, and does not admit a running check with no pin after the bytes change", async () => {
    const id = await releasedPackage("UNPIN");
    await author(id, "unpin bytes");
    const queued = (await h.admin.query<{ id: string }>(
      "select id from runs where package_id = $1 and role = 'pre-check' and status = 'queued'",
      [id],
    )).rows[0];
    await h.admin.query("alter table checker_queued_digests disable trigger checker_queued_digests_frozen");
    await h.admin.query("delete from checker_queued_digests where run_id = $1", [queued?.id]);
    await h.admin.query("alter table checker_queued_digests enable trigger checker_queued_digests_frozen");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const pinned = (await h.admin.query<{ deliverable_digest: string }>(
      "select deliverable_digest from checker_queued_digests where run_id = $1",
      [job.run.id],
    )).rows[0]?.deliverable_digest;
    expect(pinned).toMatch(/^[0-9a-f]{64}$/);
    await h.admin.query("alter table checker_queued_digests disable trigger checker_queued_digests_frozen");
    await h.admin.query("delete from checker_queued_digests where run_id = $1", [job.run.id]);
    await h.admin.query("alter table checker_queued_digests enable trigger checker_queued_digests_frozen");
    await h.admin.query("update outputs set sha256 = $2, bytes = $3 where package_id = $1", [id, "e".repeat(64), Buffer.from("drifted")]);
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded", outputs: [], trace: trace(job, "codex-test-model"), verification: { outcome: "pass", findings: [] },
    });
    expect(done.statusCode, done.body).toBeLessThan(300);
    const listed = (await attempts(id)).find((a) => a.run_id === job.run.id);
    expect(listed?.counts_as).toBe("inconclusive");
    expect(listed?.outcome).not.toBe("pass");
    expect((await h.admin.query("select 1 from verifications where run_id = $1", [job.run.id])).rowCount).toBe(0);
    await settleOpenRuns();
  });

  it("lets an overridden pass on the earlier revision clear that fail when the same bytes come back", async () => {
    const id = await releasedPackage("CLEARED");
    await author(id, "same bytes");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "same bytes");
    expect(await claim(["codex"])).toBeNull();
    await signOverride(id, "The fail was misread");
    expect((await asOwner("POST", `/packages/${id}/checks`)).statusCode).toBe(201);
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });
    expect((await decide(id, "return", 0, "One more revision of the same bytes")).statusCode).toBe(201);
    expect((await decide(id, "release", 1)).statusCode).toBe(201);
    await author(id, "same bytes");
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.package.revision).toBe(1);
    expect(view.pre_check).toBeUndefined();
    expect(view.check_blocked).toBeUndefined();
    const job = await claimRole(id, "pre-check", ["codex"]);
    expect(job.run.package_id).toBe(id);
    await settleOpenRuns();
  });

  it("does not show an earlier revision's fail as this revision's pre-check", async () => {
    const id = await releasedPackage("OLDFAIL");
    await author(id, "same bytes");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    expect((await decide(id, "return", 0, "Same bytes, new revision")).statusCode).toBe(201);
    expect((await decide(id, "release", 1)).statusCode).toBe(201);
    await author(id, "same bytes");
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.pre_check).toBeUndefined();
    expect(view.check_blocked.code).toBe("sticky-fail");
    expect(await claim(["codex"])).toBeNull();
    await settleOpenRuns();
  });

  it("does not record a stop for a check that was claimed before the stop landed", async () => {
    const id = await releasedPackage("CLAIMED");
    await author(id, "already claimed");
    const job = await claimRole(id, "pre-check", ["codex"]);
    const returned = await decide(id, "return", 0, "Return after the check was claimed");
    expect(returned.statusCode, returned.body).toBe(201);
    expect((await h.admin.query<{ status: string }>("select status from runs where id = $1", [job.run.id])).rows[0]?.status).toBe("running");
    expect((await attempts(id)).some((a) => a.run_id === job.run.id)).toBe(false);
    const stopped = ((await asOwner("GET", "/events")).json() as { type: string; subject: string }[])
      .filter((e) => e.type === "run.stopped" && e.subject === job.run.id);
    expect(stopped).toEqual([]);
    await settleOpenRuns();
  });

  it("refuses another override while the recheck that spent one is still running", async () => {
    const id = await releasedPackage("LIVEOVR");
    await author(id, "live override");
    await check(id, { status: "succeeded", outputs: [], verification: { outcome: "fail", findings: [] } });
    await author(id, "live override");
    expect(await claim(["codex"])).toBeNull();
    await signOverride(id, "The one check now running");
    const rerun = await asOwner("POST", `/packages/${id}/checks`);
    expect(rerun.statusCode, rerun.body).toBe(201);
    await claimRole(id, "pre-check", ["codex"]);
    const again = await asOwner("POST", `/packages/${id}/recheck-overrides/options`, { reason: "A second signature" });
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json().code).toBe("recheck-running");
    await settleOpenRuns();
  });
});
