import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, daemonHeaders, signIn, startHarness } from "./harness.js";

/** Run custody, launch inputs and serving: what the daemon and the owner see around a run. */
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
const asDaemon = (url: string, payload: unknown) => h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: payload as object });

interface Job {
  run: { id: string; role: string; package_id: string; round: number; runtime: { provider: string; model: string } };
  inputs: { name: string; content_base64: string }[];
}

async function claim(runtimes = ["fake"]): Promise<Job | null> {
  const r = await asDaemon("/runner/claim", { runtimes });
  return r.statusCode === 204 ? null : (r.json() as Job);
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
    const check = await claim();
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
