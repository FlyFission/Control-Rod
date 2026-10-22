import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** Run custody, launch inputs and serving: what the daemon and the owner see around a run. */
const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const sitePack = join(repo, "packs", "capital-projects", "site-concept");
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
  run: { id: string; role: string; package_id: string; round: number; agent_baseline: string; runtime: { provider: string; model: string } };
  inputs: { name: string; content_base64: string }[];
  claim: { token: string; lease_expires_at: string; heartbeat_seconds: number };
}

async function claim(runtimes = ["fake"]): Promise<Job | null> {
  const r = await asDaemon("/runner/claim", { runtimes });
  if (r.statusCode === 204) return null;
  const job = r.json() as Job;
  claims.set(job.run.id, job.claim.token);
  return job;
}

const input = (job: Job, name: string) => {
  const f = job.inputs.find((i) => i.name === name);
  return f ? Buffer.from(f.content_base64, "base64").toString() : undefined;
};

function draft(id: string, role = "general-author") {
  return {
    schema_version: "0.1.0",
    id,
    revision: 0,
    title: `Package ${id}`,
    project: "BM-TEST",
    mode: "capital-projects",
    status: "draft",
    rigor_mode: "standard",
    data_lane: "internal",
    objective: `Produce ${id}`,
    deliverables: [{ id: `${id}-D1`, type: "report", format: ["md"] }],
    design_inputs: [],
    agent_assignment: [{ role, agent_baseline: "author", baseline_revision: 0 }],
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

/** Captures a request, lets intake draft one package with the given role, and releases it. */
async function releasedPackage(key: string, role = "general-author"): Promise<string> {
  const c = await asOwner("POST", "/captures", { text: `Make ${key}` });
  expect(c.statusCode, c.body).toBe(201);
  const job = await claim();
  if (!job) throw new Error("no intake job");
  const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
    status: "succeeded",
    outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(draft(key, role))) }],
  });
  expect(r.statusCode, r.body).toBeLessThan(300);
  const pkgs = (await asOwner("GET", "/packages")).json() as { id: string }[];
  const id = pkgs.find((p) => p.id.endsWith(`-${key}`))?.id;
  if (!id) throw new Error("package not drafted");
  expect((await decide(id, "release", 0)).statusCode).toBe(201);
  return id;
}

describe("launch inputs", () => {
  it("gives network only to the author runs of roles whose tools ask for it", async () => {
    const id = await releasedPackage("NET", "site-constraints");
    const author = await claim();
    expect(author?.run.role).toBe("author");
    expect(input(author as Job, "TOOLS.txt")).toMatch(/^network: on$/m);
    await asDaemon(`/runner/runs/${author?.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "constraints.md", content_base64: b64("# Constraints") }],
    });
    const check = await claim(["codex"]);
    expect(check?.run.role).toBe("pre-check");
    expect(check?.run.package_id).toBe(id);
    const tools = input(check as Job, "TOOLS.txt") ?? "";
    expect(tools).not.toMatch(/^\s*network\s*:/im);
    expect(tools).toContain("Bash(cr-site:*)");
    await asDaemon(`/runner/runs/${check?.run.id}/complete`, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });

    await releasedPackage("PLAIN");
    const plain = await claim();
    expect(input(plain as Job, "TOOLS.txt")).not.toMatch(/^\s*network\s*:/im);
  });
});

/** Answers every queued intake, so later claims see only the runs a test made. */
async function drainIntake() {
  for (;;) {
    const job = await claim();
    if (!job) return;
    expect(job.run.role).toBe("intake");
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", outputs: [{ name: "answer.md", content_base64: b64("ok") }] });
  }
}

function trace(job: Job, extra: object = {}) {
  const at = new Date().toISOString();
  return {
    schema_version: "0.1.0",
    run_id: job.run.id,
    package_id: job.run.package_id,
    package_revision: 0,
    agent_baseline: "intake-fake",
    baseline_revision: 0,
    tool: { name: "fake", version: "test" },
    inputs: [],
    outputs: [],
    started_at: at,
    finished_at: at,
    ...extra,
  };
}

async function eventsOf(subject: string) {
  const all = (await asOwner("GET", "/events")).json() as { type: string; subject: string; data?: Record<string, unknown> }[];
  return all.filter((e) => e.subject === subject);
}

describe("what actually ran", () => {
  it("keeps runtime mode and models in the trace and flags a model the run did not ask for", async () => {
    await asOwner("POST", "/captures", { text: "Which model ran?" });
    const job = (await claim()) as Job;
    expect(job.run.role).toBe("intake");
    const t = trace(job, {
      runtime_mode: "print",
      requested_model: "claude-opus-4-1",
      reported_model: "claude-haiku-4",
      permission_mode: "acceptEdits",
      allowed_tools: ["Read", "Write"],
      sandbox: "none",
    });
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      trace: t,
      outputs: [{ name: "answer.md", content_base64: b64("Opus was asked for.") }],
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const stored = await h.db.query<{ body: { trace?: Record<string, unknown> } }>("select body from runs where id = $1", [job.run.id]);
    expect(stored.rows[0]?.body.trace).toMatchObject({ runtime_mode: "print", requested_model: "claude-opus-4-1", reported_model: "claude-haiku-4" });
    const mismatch = (await eventsOf(job.run.id)).find((e) => e.type === "run.model-mismatch");
    expect(mismatch?.data).toMatchObject({ requested: "claude-opus-4-1", reported: "claude-haiku-4" });
  });
});

describe("serving outputs", () => {
  it("re-hashes stored bytes and refuses, on the record, an output that changed", async () => {
    const pkgs = (await asOwner("GET", "/packages")).json() as { id: string }[];
    const id = pkgs.find((p) => p.id.endsWith("-NET"))?.id as string;
    const ok = await asOwner("GET", `/packages/${id}/outputs/constraints.md`);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("# Constraints");
    await h.db.query("update outputs set bytes = $1 where package_id = $2 and name = 'constraints.md'", [Buffer.from("# Edited"), id]);
    const bad = await asOwner("GET", `/packages/${id}/outputs/constraints.md`);
    expect(bad.statusCode).toBe(409);
    expect(bad.json().code).toBe("output-changed");
    expect(bad.body).not.toContain("Edited");
    const ev = (await eventsOf(id)).find((e) => e.type === "output.mismatch");
    expect(ev?.data).toMatchObject({ name: "constraints.md" });
  });
});

describe("same-origin check on cookie routes", () => {
  const post = (headers: Record<string, string>) =>
    h.app.inject({ method: "POST", url: "/captures", headers: { cookie, ...headers }, payload: { text: "Origin check" } });

  it("refuses state changes from another origin, another local port, a cross-site fetch or no browser marks", async () => {
    for (const headers of [
      { origin: "http://evil.example" },
      { origin: "http://localhost:9999" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      {},
    ]) {
      const r = await post(headers);
      expect(r.statusCode, JSON.stringify(headers)).toBe(403);
      expect(r.json().code).toBe("cross-origin");
    }
    const decide = await h.app.inject({
      method: "POST",
      url: "/packages/X/decisions",
      headers: { cookie, origin: "http://evil.example" },
      payload: { kind: "release", package_revision: 0 },
    });
    expect(decide.statusCode).toBe(403);
  });

  it("accepts the app's own origin, or a same-origin fetch with no origin, and leaves runner routes to the token", async () => {
    expect((await post({ origin: ORIGIN })).statusCode).toBe(201);
    expect((await post({ "sec-fetch-site": "same-origin" })).statusCode).toBe(201);
    const runner = await h.app.inject({
      method: "POST",
      url: "/runner/claim",
      headers: { ...daemonHeaders, origin: "http://evil.example" },
      payload: { runtimes: [] },
    });
    expect(runner.statusCode).toBe(204);
    expect((await h.app.inject({ method: "GET", url: "/office", headers: { cookie, origin: "http://evil.example" } })).statusCode).toBe(200);
    await drainIntake();
  });
});

describe("run custody", () => {
  let pendingCheck: Job | undefined;
  const complete = (job: Job, body: Record<string, unknown>) => asDaemon(`/runner/runs/${job.run.id}/complete`, body);
  const runRow = async (id: string) =>
    (await h.db.query<{ status: string; body: Record<string, unknown> }>("select status, body from runs where id = $1", [id])).rows[0];

  it("hands out a claim token and lease, renews it on each log post and refuses a foreign token", async () => {
    await releasedPackage("LEASE");
    const job = (await claim()) as Job;
    expect(job.claim.token.length).toBeGreaterThan(20);
    expect(job.claim.heartbeat_seconds).toBeGreaterThan(0);
    const before = Date.parse(job.claim.lease_expires_at);
    expect(before).toBeGreaterThan(Date.now());
    const foreign = await asDaemon(`/runner/runs/${job.run.id}/log`, { claim_token: "someone-else", lines: [] });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json().code).toBe("stale-claim");
    await new Promise((r) => setTimeout(r, 20));
    const beat = await asDaemon(`/runner/runs/${job.run.id}/log`, { lines: [] });
    expect(beat.statusCode, beat.body).toBe(200);
    expect(beat.json().stop).toBe(false);
    expect(Date.parse(beat.json().lease_expires_at)).toBeGreaterThan(before);
    const noToken = await complete(job, { claim_token: "", status: "succeeded", outputs: [] });
    expect(noToken.statusCode).toBe(403);
    expect((await runRow(job.run.id))?.status).toBe("running");

    const body = { idempotency_key: "key-lease-0001", status: "succeeded", outputs: [{ name: "r.md", content_base64: b64("ok") }] };
    const first = await complete(job, body);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ run_id: job.run.id, idempotency_key: "key-lease-0001", status: "succeeded" });
    const again = await complete(job, body);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
    const other = await complete(job, { ...body, idempotency_key: "key-lease-0002" });
    expect(other.statusCode).toBe(409);
    expect(other.json().code).toBe("already-complete");
    pendingCheck = (await claim(["codex"])) as Job;
    expect(pendingCheck.run.role).toBe("pre-check");
  });

  it("records a refused completion as a failed run with the reason, and never echoes what was sent", async () => {
    const job = pendingCheck as Job;
    const runId = job.run.id;
    const r = await complete(job, { status: "succeeded", outputs: [] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().status).toBe("failed");
    expect(r.json().refusal.message).toMatch(/no outcome/);
    const row = await runRow(runId);
    expect(row?.status).toBe("failed");
    expect(String(row?.body.error)).toMatch(/Completion refused/);
    expect((await asOwner("GET", `/packages/${job.run.package_id}`)).json().package.status).toBe("in-verification");

    await releasedPackage("BADNAME");
    const author = (await claim()) as Job;
    const bad = await complete(author, { status: "succeeded", outputs: [{ name: "../../etc/evil<script>", content_base64: b64("x") }] });
    expect(bad.json().refusal.code).toBe("invalid");
    expect(bad.body).not.toContain("evil");
    expect((await runRow(author.run.id))?.status).toBe("failed");
  });

  it("refuses an invalid trace with a reason instead of dropping it", async () => {
    await releasedPackage("TRACE");
    const job = (await claim()) as Job;
    const r = await complete(job, {
      status: "succeeded",
      trace: { ...trace(job), run_id: job.run.id, outputs: "not-a-list" },
      outputs: [{ name: "r.md", content_base64: b64("ok") }],
    });
    expect(r.json().refusal.code).toBe("invalid-trace");
    const row = await runRow(job.run.id);
    expect(row?.status).toBe("failed");
    expect(String(row?.body.error)).toMatch(/execution trace is invalid/);
    const failed = (await eventsOf(job.run.id)).find((e) => e.type === "run.failed");
    expect(failed?.data).toMatchObject({ refused: "invalid-trace" });
  });

  it("marks a run lost when its lease lapses, refuses its late completion and lets only the owner requeue it", async () => {
    const id = await releasedPackage("LOST");
    const job = (await claim()) as Job;
    await h.db.query("update runs set lease_expires_at = now() - interval '1 second' where id = $1", [job.run.id]);
    const office = (await asOwner("GET", "/office")).json() as { kind: string; package_id: string; detail: string }[];
    const item = office.find((o) => o.package_id === id);
    expect(item?.kind).toBe("lost");
    expect(item?.detail).toMatch(/Requeue/);
    const row = await runRow(job.run.id);
    expect(row?.status).toBe("lost");
    expect(String(row?.body.error)).toMatch(/Runner lost/);
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.runs.find((r: { id: string }) => r.id === job.run.id).status).toBe("lost");
    expect(view.package.status).toBe("in-work");

    const beat = await asDaemon(`/runner/runs/${job.run.id}/log`, { lines: ["late"] });
    expect(beat.statusCode).toBe(409);
    const late = await complete(job, { status: "succeeded", outputs: [{ name: "r.md", content_base64: b64("late") }] });
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe("run-lost");
    expect((await eventsOf(job.run.id)).some((e) => e.type === "run.late-completion")).toBe(true);
    expect((await runRow(job.run.id))?.status).toBe("lost");

    const byDaemon = await h.app.inject({ method: "POST", url: `/packages/${id}/runs/${job.run.id}/requeue`, headers: daemonHeaders });
    expect(byDaemon.statusCode).toBe(403);
    const rq = await asOwner("POST", `/packages/${id}/runs/${job.run.id}/requeue`);
    expect(rq.statusCode, rq.body).toBe(201);
    expect(rq.json()).toMatchObject({ status: "queued", role: "author", requeue_of: job.run.id });
    const again = await asOwner("POST", `/packages/${id}/runs/${job.run.id}/requeue`);
    expect(again.json().id).toBe(rq.json().id);
    expect((await runRow(job.run.id))?.body.requeued_as).toBe(rq.json().id);
    const next = (await claim()) as Job;
    expect(next.run.id).toBe(rq.json().id);
  });
});

describe("an author run with no output", () => {
  it("is recorded as failed with a reason and never advances the package", async () => {
    const id = await releasedPackage("EMPTY");
    const job = (await claim()) as Job;
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", outputs: [] });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().status).toBe("failed");
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    expect(view.package.status).toBe("in-work");
    const run = view.runs.find((x: { id: string }) => x.id === job.run.id);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/without writing anything to out/);
    expect(view.runs.some((x: { role: string }) => x.role === "pre-check")).toBe(false);
    const item = ((await asOwner("GET", "/office")).json() as { kind: string; package_id: string; detail: string }[]).find((o) => o.package_id === id);
    expect(item?.kind).toBe("dispute");
    expect(item?.detail).toMatch(/without writing anything/);
    expect((await asOwner("POST", `/packages/${id}/runs/${job.run.id}/requeue`)).statusCode).toBe(201);
    const again = (await claim()) as Job;
    expect(again.run.package_id).toBe(id);
    await asDaemon(`/runner/runs/${again.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });
});

describe("stopping a run", () => {
  it("records the stop first, tells the daemon in its log reply, and lands as stopped when the daemon confirms", async () => {
    const id = await releasedPackage("STOP");
    const job = (await claim()) as Job;
    const byDaemon = await h.app.inject({ method: "POST", url: `/packages/${id}/runs/${job.run.id}/stop`, headers: daemonHeaders });
    expect(byDaemon.statusCode).toBe(403);
    const s1 = await asOwner("POST", `/packages/${id}/runs/${job.run.id}/stop`);
    expect(s1.statusCode, s1.body).toBe(200);
    expect(s1.json().stop_requested_at).toBeTruthy();
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    const shown = view.runs.find((r: { id: string }) => r.id === job.run.id);
    expect(shown.status).toBe("running");
    expect(shown.label).toBe("Stopping");
    const s2 = await asOwner("POST", `/packages/${id}/runs/${job.run.id}/stop`);
    expect(s2.json().stop_requested_at).toBe(s1.json().stop_requested_at);
    expect((await eventsOf(job.run.id)).filter((e) => e.type === "run.stop-requested")).toHaveLength(1);

    const beat = await asDaemon(`/runner/runs/${job.run.id}/log`, { lines: [] });
    expect(beat.json().stop).toBe(true);
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "stopped", error: "stopped by the owner", outputs: [] });
    expect(done.json().status).toBe("stopped");
    const after = (await asOwner("GET", `/packages/${id}`)).json();
    expect(after.package.status).toBe("in-work");
    expect(after.runs.find((r: { id: string }) => r.id === job.run.id).status).toBe("stopped");
    const s3 = await asOwner("POST", `/packages/${id}/runs/${job.run.id}/stop`);
    expect(s3.json().status).toBe("stopped");
    const item = ((await asOwner("GET", "/office")).json() as { package_id: string; detail: string }[]).find((o) => o.package_id === id);
    expect(item?.detail).toMatch(/stopped/);
  });

  it("stops a queued run at once, and never takes a stopped report nobody asked for", async () => {
    const id = await releasedPackage("STOPQ");
    const queued = (await asOwner("GET", `/packages/${id}`)).json().runs[0];
    const s = await asOwner("POST", `/packages/${id}/runs/${queued.id}/stop`);
    expect(s.json().status).toBe("stopped");
    expect(await claim()).toBeNull();
    expect((await asOwner("POST", `/packages/${id}/runs/${queued.id}/requeue`)).statusCode).toBe(201);
    const job = (await claim()) as Job;
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "stopped", outputs: [] });
    expect(r.json().status).toBe("failed");
  });
});

describe("pre-check independence", () => {
  it("holds a pre-check that could only run on the author's runtime, with the reason in plain words", async () => {
    const id = await releasedPackage("INDEP");
    const author = (await claim()) as Job;
    await asDaemon(`/runner/runs/${author.run.id}/complete`, { status: "succeeded", outputs: [{ name: "r.md", content_base64: b64("ok") }] });
    expect(await claim(["fake"])).toBeNull();
    const view = (await asOwner("GET", `/packages/${id}`)).json();
    const held = view.runs.find((r: { role: string }) => r.role === "pre-check");
    expect(held.status).toBe("queued");
    expect(held.waiting_reason).toBe("Waiting for an independent runtime: install Codex, or proceed with a recorded owner override.");
    const item = ((await asOwner("GET", "/office")).json() as { kind: string; package_id: string; detail: string }[]).find((o) => o.package_id === id);
    expect(item).toMatchObject({ kind: "permission", detail: held.waiting_reason });
    expect(await claim(["fake"])).toBeNull();
    expect((await eventsOf(held.id)).filter((e) => e.type === "run.waiting")).toHaveLength(1);

    const url = `/packages/${id}/runs/${held.id}/override-independence`;
    expect((await asOwner("POST", `${url}/options`, { reason: " " })).statusCode).toBe(400);
    const daemonOptions = await h.app.inject({ method: "POST", url: `${url}/options`, headers: daemonHeaders, payload: { reason: "agent wants it" } });
    expect(daemonOptions.statusCode).toBe(403);

    // No assertion: the kernel refuses an unsigned override.
    const bare = await asOwner("POST", url, { reason: "No Codex on this Mac yet" });
    expect(bare.statusCode).toBe(403);
    expect(bare.json().code).toBe("unsigned");

    // An assertion over one reason cannot carry another.
    const o1 = await asOwner("POST", `${url}/options`, { reason: "No Codex on this Mac yet" });
    expect(o1.statusCode, o1.body).toBe(200);
    const swapped = await asOwner("POST", url, { reason: "Something else", assertion: passkey.assert(o1.json().options) });
    expect(swapped.statusCode).toBe(403);

    const o2 = await asOwner("POST", `${url}/options`, { reason: "No Codex on this Mac yet" });
    const assertion = passkey.assert(o2.json().options);
    const byDaemon = await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: { reason: "No Codex on this Mac yet", assertion } });
    expect(byDaemon.statusCode).toBe(403);
    expect((await claim(["fake"]))).toBeNull();
    const ok = await asOwner("POST", url, { reason: "No Codex on this Mac yet", assertion });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().independence_override).toMatchObject({
      by: "ben",
      reason: "No Codex on this Mac yet",
      subject_digest: o2.json().subject_digest,
      assertion: { credential_id: assertion.id },
    });
    const replay = await asOwner("POST", url, { reason: "No Codex on this Mac yet", assertion });
    expect(replay.statusCode).toBe(403);
    const ev = (await eventsOf(held.id)).find((e) => e.type === "run.independence-override");
    expect(ev?.data).toMatchObject({ reason: "No Codex on this Mac yet", assertion: { credential_id: assertion.id } });

    const check = (await claim(["fake"])) as Job;
    expect(check.run.id).toBe(held.id);
    expect(check.run.runtime.provider).toBe("fake");
    expect(check.run.agent_baseline).not.toBe(author.run.agent_baseline);
    // A different model from the same provider is still the same runtime.
    const done = await asDaemon(`/runner/runs/${check.run.id}/complete`, {
      status: "succeeded",
      outputs: [],
      trace: trace(check, { package_id: id, reported_model: "fake-other-model" }),
      verification: { outcome: "pass", findings: [] },
    });
    expect(done.json().status).toBe("succeeded");
    const after = (await asOwner("GET", `/packages/${id}`)).json();
    expect(after.pre_check.independence).toMatchObject({
      runtime: "shared",
      author_runtime: { provider: "fake" },
      checker_runtime: { provider: "fake", model: "fake-other-model" },
      owner_override: { by: "ben", reason: "No Codex on this Mac yet" },
    });
    expect(after.pre_check.evidence[0].custody.coupling.mechanism).toBe("shared");
  });

  it("records a pre-check on another runtime as independent, with no override", async () => {
    const id = await releasedPackage("INDEP2");
    const author = (await claim()) as Job;
    await asDaemon(`/runner/runs/${author.run.id}/complete`, { status: "succeeded", outputs: [{ name: "r.md", content_base64: b64("ok") }] });
    const check = (await claim(["fake", "codex"])) as Job;
    expect(check.run.runtime.provider).toBe("codex");
    await asDaemon(`/runner/runs/${check.run.id}/complete`, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });
    const ind = (await asOwner("GET", `/packages/${id}`)).json().pre_check.independence;
    expect(ind.runtime).toBe("independent");
    expect(ind.owner_override).toBeUndefined();
  });

  it("refuses an override for anything but a queued pre-check", async () => {
    const id = await releasedPackage("INDEP3");
    const queued = (await asOwner("GET", `/packages/${id}`)).json().runs[0];
    const r = await asOwner("POST", `/packages/${id}/runs/${queued.id}/override-independence/options`, { reason: "x" });
    expect(r.statusCode).toBe(409);
    const job = (await claim()) as Job;
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });
});

describe("one live run per assignment", () => {
  it("lets the database hold at most one queued or running run per package revision, role and round", async () => {
    const id = await releasedPackage("ONCE");
    const live = (await asOwner("GET", `/packages/${id}`)).json().runs[0];
    expect(live.status).toBe("queued");
    const dup = h.db.query(
      "insert into runs (id, package_id, package_revision, role, round, status, body) values ('R-dup', $1, 0, 'author', 1, 'running', $2)",
      [id, { ...live, id: "R-dup", status: "running" }],
    );
    await expect(dup).rejects.toThrow(/runs_one_live/);

    // A finished run does not block a new one; a second requeue in a race window gets the live one back.
    const job = (await claim()) as Job;
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "test", outputs: [] });
    const first = await asOwner("POST", `/packages/${id}/runs/${job.run.id}/requeue`);
    expect(first.statusCode).toBe(201);
    await h.db.query("update runs set body = body - 'requeued_as' where id = $1", [job.run.id]);
    const second = await asOwner("POST", `/packages/${id}/runs/${job.run.id}/requeue`);
    expect(second.json().id).toBe(first.json().id);
    const counts = await h.db.query<{ n: string }>(
      "select count(*) as n from runs where package_id = $1 and role = 'author' and round = 1 and status in ('queued', 'running')",
      [id],
    );
    expect(Number(counts.rows[0]?.n)).toBe(1);
    expect((await eventsOf(first.json().id)).filter((e) => e.type === "run.queued")).toHaveLength(1);
    const again = (await claim()) as Job;
    await asDaemon(`/runner/runs/${again.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });
});

describe("runtime readiness", () => {
  it("picks only runtimes the daemon found ready and shows the rest to the owner", async () => {
    const id = await releasedPackage("READY");
    const author = (await claim()) as Job;
    await asDaemon(`/runner/runs/${author.run.id}/complete`, { status: "succeeded", outputs: [{ name: "r.md", content_base64: b64("ok") }] });
    const notReady = {
      runtime: "codex",
      ready: false,
      version: "codex-cli 0.163.0",
      reason: "codex is installed but not signed in (`codex login status` exit 1). Sign in yourself with `codex login`; Control Rod never does.",
      login_checked: true,
    };
    const status = [{ runtime: "fake", ready: true, login_checked: false }, notReady];
    const r = await asDaemon("/runner/claim", { runtimes: ["fake", "codex"], runtime_status: status });
    expect(r.statusCode).toBe(204);
    const shown = (await asOwner("GET", "/runtimes")).json();
    expect(shown.runtimes).toContainEqual(notReady);
    expect(shown.reported_at).toBeTruthy();
    const held = (await asOwner("GET", `/packages/${id}`)).json().runs.find((x: { role: string }) => x.role === "pre-check");
    expect(held.status).toBe("queued");
    expect(held.waiting_reason).toMatch(/independent runtime/);

    const ready = await asDaemon("/runner/claim", { runtimes: ["fake", "codex"], runtime_status: [status[0], { ...notReady, ready: true, reason: undefined }] });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().run.runtime.provider).toBe("codex");
    claims.set(ready.json().run.id, ready.json().claim.token);
    await asDaemon(`/runner/runs/${ready.json().run.id}/complete`, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });
  });
});

describe("review findings on #3", () => {
  it("refuses decision options when the package changed after the person opened it", async () => {
    const c = await asOwner("POST", "/captures", { text: "Make STALE1" });
    expect(c.statusCode, c.body).toBe(201);
    const job = await claim();
    if (!job) throw new Error("no intake job");
    await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(draft("STALE1"))) }],
    });
    const id = ((await asOwner("GET", "/packages")).json() as { id: string }[]).find((p) => p.id.endsWith("-STALE1"))?.id;
    if (!id) throw new Error("package not drafted");
    const shown = (await asOwner("GET", `/packages/${id}`)).json().subject_digest;
    const stale = { algorithm: "sha256", value: "0".repeat(64) };
    const refused = await asOwner("POST", `/packages/${id}/decisions/options`, { kind: "release", package_revision: 0, expected_subject_digest: stale });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe("changed");
    const ok = await asOwner("POST", `/packages/${id}/decisions/options`, { kind: "release", package_revision: 0, expected_subject_digest: shown });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().subject_digest.value).toBe(shown.value);
  });

  it("drafts one package when intake sends the same draft as a file and as the package field", async () => {
    const c = await asOwner("POST", "/captures", { text: "Make DUP1" });
    expect(c.statusCode, c.body).toBe(201);
    const job = await claim();
    if (!job) throw new Error("no intake job");
    const d = draft("DUP1");
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(d)) }],
      package: d,
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const matches = ((await asOwner("GET", "/packages")).json() as { id: string }[]).filter((p) => p.id.endsWith("-DUP1"));
    expect(matches).toHaveLength(1);
  });

  it("serves an output stored under a subfolder by its full name", async () => {
    const id = await releasedPackage("SUBDIR1");
    const job = await claim();
    if (!job) throw new Error("no author job");
    expect(job.run.package_id).toBe(id);
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [
        { name: "reports/summary.md", content_base64: b64("# Nested") },
        { name: "summary.md", content_base64: b64("# Root") },
      ],
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const nested = await asOwner("GET", `/packages/${id}/outputs/reports/summary.md`);
    expect(nested.statusCode, nested.body).toBe(200);
    expect(nested.body).toBe("# Nested");
    const encoded = await asOwner("GET", `/packages/${id}/outputs/${encodeURIComponent("reports")}/${encodeURIComponent("summary.md")}`);
    expect(encoded.body).toBe("# Nested");
  });

  it("serves agent outputs in a script-free sandbox, except PDFs, and downloads unknown types", async () => {
    const id = await releasedPackage("SVG1");
    const job = await claim();
    if (!job) throw new Error("no author job");
    expect(job.run.package_id).toBe(id);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/captures",{method:"POST"})</script></svg>';
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [
        { name: "site.svg", content_base64: b64(svg) },
        { name: "plan.pdf", content_base64: b64("%PDF-1.4") },
        { name: "model.step", content_base64: b64("ISO-10303-21;") },
      ],
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const s = await asOwner("GET", `/packages/${id}/outputs/site.svg`);
    expect(s.statusCode).toBe(200);
    expect(s.headers["content-security-policy"]).toMatch(/^sandbox;/);
    expect(s.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(s.headers["x-content-type-options"]).toBe("nosniff");
    const p = await asOwner("GET", `/packages/${id}/outputs/plan.pdf`);
    expect(p.headers["content-type"]).toBe("application/pdf");
    expect(p.headers["content-security-policy"]).toBeUndefined();
    const u = await asOwner("GET", `/packages/${id}/outputs/model.step`);
    expect(u.headers["content-disposition"]).toBe("attachment");
    expect(u.headers["content-security-policy"]).toMatch(/^sandbox;/);
  });
});

describe("pack files and site briefs", () => {
  const names = (job: Job) => job.inputs.map((i) => i.name);
  /** Claims until a job for this package comes up, failing any earlier test's leftovers on the way. */
  async function claimFor(id: string, runtimes = ["fake"]): Promise<Job> {
    for (let i = 0; i < 20; i++) {
      const job = await claim(runtimes);
      if (!job) break;
      if (job.run.package_id === id) return job;
      await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "left over from another test", outputs: [] });
    }
    throw new Error(`no job for ${id}`);
  }

  it("ships the role's pack templates, typicals and examples to the author, and the scripted author finds them", async () => {
    const id = await releasedPackage("CHARTER", "site-charter");
    const job = await claimFor(id);
    expect(names(job)).toEqual(
      expect.arrayContaining(["pack/templates/charter.md", "pack/templates/basis-of-design.md", "pack/typicals/data-center-50mw.json", "pack/examples/plan-meta.example.json"]),
    );
    expect(input(job, "pack/templates/charter.md")).toBe(readFileSync(join(sitePack, "templates", "charter.md"), "utf8"));
    expect(input(job, "BRIEF.md")).toContain("inputs/pack/templates/charter.md");

    // Lay the job out the way the daemon does and run the scripted author on it.
    const ws = mkdtempSync(join(tmpdir(), "cr-ws-"));
    try {
      for (const i of job.inputs) {
        const p = join(ws, "inputs", i.name);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, Buffer.from(i.content_base64, "base64"));
      }
      execFileSync("bash", [join(repo, "tests", "e2e", "fake", "author.sh")], { cwd: ws, env: { PATH: process.env.PATH ?? "" } });
      expect(readFileSync(join(ws, "out", "charter.md"), "utf8")).toBe(input(job, "pack/templates/charter.md"));
      expect(existsSync(join(ws, "out", "program.json"))).toBe(true);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });

  it("gives an early site stage the stage pre-check and the site plan the full cr-site check", async () => {
    const parcel = await releasedPackage("PARCEL2", "site-parcel");
    const author = await claimFor(parcel);
    await asDaemon(`/runner/runs/${author.run.id}/complete`, { status: "succeeded", outputs: [{ name: "parcel.json", content_base64: b64("{}") }] });
    const check = await claimFor(parcel, ["codex"]);
    expect(check.run.role).toBe("pre-check");
    const brief = input(check, "BRIEF.md") ?? "";
    expect(brief).toContain("Role: pre-check, site concept stages");
    expect(brief).not.toContain("Role: pre-check, site plan");
    expect(names(check)).toContain("pack/typicals/data-center-50mw.json");
    await asDaemon(`/runner/runs/${check.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });

    const plan = await releasedPackage("PLAN2", "site-plan");
    const planAuthor = await claimFor(plan);
    await asDaemon(`/runner/runs/${planAuthor.run.id}/complete`, { status: "succeeded", outputs: [{ name: "layout.json", content_base64: b64("{}") }] });
    const planCheck = await claimFor(plan, ["codex"]);
    const planBrief = input(planCheck, "BRIEF.md") ?? "";
    expect(planBrief).toContain("Role: pre-check, site plan");
    expect(planBrief).toContain("inputs/deliverables/layout.json");
    await asDaemon(`/runner/runs/${planCheck.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });
});

describe("claim scan", () => {
  it("finds work queued behind more than a page of held runs", async () => {
    const c = await asOwner("POST", "/captures", { text: "Make HELD1" });
    expect(c.statusCode, c.body).toBe(201);
    const intake = await claim();
    if (!intake) throw new Error("no intake job");
    await asDaemon(`/runner/runs/${intake.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(draft("HELD1"))) }],
    });
    const id = ((await asOwner("GET", "/packages")).json() as { id: string }[]).find((p) => p.id.endsWith("-HELD1"))?.id;
    if (!id) throw new Error("package not drafted");
    // 60 pre-checks on a draft package: each is skipped (held), never claimed, and they are oldest.
    for (let round = 1; round <= 60; round++) {
      await h.db.query(
        "insert into runs (id, package_id, package_revision, role, round, status, body, created_at) values ($1, $2, 0, 'pre-check', $3, 'queued', '{}'::jsonb, now() - interval '1 hour')",
        [`R-held-${round}`, id, round],
      );
    }
    const fresh = await asOwner("POST", "/captures", { text: "Answer after the held ones" });
    expect(fresh.statusCode, fresh.body).toBe(201);
    const job = await claim();
    expect(job?.run.role).toBe("intake");
    await h.db.query("update runs set status = 'stopped' where id like 'R-held-%'");
    if (job) await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "test", outputs: [] });
  });
});
