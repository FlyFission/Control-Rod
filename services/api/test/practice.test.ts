import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRACTICE_RUNTIME_HOLD, practiceOffer } from "../src/practice.js";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/**
 * The practice project (change record practice-agent): the whole loop on the bundled sample, with
 * the practice agents only, and never a practice agent on real work.
 *
 * The daemon side (daemon/internal/runner/adapter_practice_test.go) writes and checks the files in
 * tests/e2e/practice; this test submits those same files as the practice runs' completions, so the
 * two halves are one loop.
 */
const repo = new URL("../../../", import.meta.url).pathname;
const golden = join(repo, "tests", "e2e", "practice");
const sample = join(repo, "services", "api", "practice", "sample-project");

function goldenOutputs(role: string): { name: string; content_base64: string }[] {
  const dir = join(golden, role);
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  return walk(dir).sort().map((p) => ({ name: relative(dir, p).split("\\").join("/"), content_base64: readFileSync(p).toString("base64") }));
}

type Json = Record<string, any>;
let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();
const practiceDir = join(mkdtempSync(join(tmpdir(), "cr-practice-test-")), "practice");

beforeAll(async () => {
  h = await startHarness({ publishPullRequests: true, practiceDir });
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

const asOwner = (method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) =>
  h.app.inject({
    method,
    url,
    headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN }) },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
async function signedAdmin(name: string, payload: Json) {
  const o = await asOwner("POST", `/admin/commands/${name}/options`, { payload });
  expect(o.statusCode, o.body).toBe(200);
  return asOwner("POST", `/admin/commands/${name}`, { payload, assertion: passkey.assert(o.json().options) });
}
const asDaemon = async (url: string, payload: unknown): Promise<DaemonReply> => {
  const body = await sealDaemonPayload(h.admin, url, withClaim(url, payload as Record<string, unknown>));
  return (await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body })) as DaemonReply;
};
async function claim(runtimes: string[]) {
  const r = await asDaemon("/runner/claim", { runtimes, supports_checkouts: true });
  if (r.statusCode === 204) return null;
  expect(r.statusCode, r.body).toBe(200);
  const job = r.json();
  claims.set(job.run.id, job.claim.token);
  return job;
}
async function decide(id: string, kind: string) {
  const o = await asOwner("POST", `/packages/${id}/decisions/options`, { kind, package_revision: 0 });
  expect(o.statusCode, o.body).toBe(200);
  return asOwner("POST", `/packages/${id}/decisions`, { kind, package_revision: 0, assertion: passkey.assert(o.json().options) });
}
const view = async (id: string) => (await asOwner("GET", `/packages/${id}`)).json();
const queuedRun = async (role: string, subject: string) =>
  (await h.db.query<{ body: Json }>("select body from runs where role = $1 and package_id = $2 and status = 'queued'", [role, subject])).rows[0]?.body;
const input = (job: Json, name: string) => {
  const f = job.inputs.find((i: Json) => i.name === name);
  return f ? Buffer.from(f.content_base64, "base64").toString() : undefined;
};

const REAL = ["claude", "codex", "fake"];
const PRACTICE = ["practice", "practice-check"];

describe("the practice offer", () => {
  it("gives practice work only to the practice agent for its role, and real work never to one", () => {
    expect(practiceOffer(["claude", "practice", "practice-check", "fake"], false, "author")).toEqual(["claude", "fake"]);
    expect(practiceOffer(["claude", "practice", "practice-check"], true, "intake")).toEqual(["practice"]);
    expect(practiceOffer(["claude", "practice", "practice-check"], true, "author")).toEqual(["practice"]);
    expect(practiceOffer(["claude", "practice", "practice-check"], true, "pre-check")).toEqual(["practice-check"]);
    expect(practiceOffer(["claude", "codex"], true, "author")).toEqual([]);
  });
});

let practiceProject = "";
let realProject = "";

describe("starting the practice project", () => {
  it("makes no card before the practice project exists", async () => {
    const r = await asOwner("POST", "/practice/cards");
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("practice-not-started");
  });

  it("needs the passkey, as any new project does", async () => {
    const r = await asOwner("POST", "/admin/commands/project.practice-start", { payload: {} });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("signature-required");
  });

  it("makes one practice project on the practice agents, and copies the sample into Control Rod's own folder", async () => {
    const r = await signedAdmin("project.practice-start", {});
    expect(r.statusCode, r.body).toBe(200);
    const p = r.json();
    expect(p).toMatchObject({ name: "Practice project", practice: true, lane: "public", repo: "", author: { ecosystem: "practice" }, checker: { ecosystem: "practice-check" } });
    expect(p.sample_dir).toBe(join(practiceDir, "sample-project"));
    expect(readFileSync(join(p.sample_dir, "README.md"), "utf8")).toBe(readFileSync(join(sample, "README.md"), "utf8"));
    practiceProject = p.id;
    const again = await signedAdmin("project.practice-start", {});
    expect(again.json().id).toBe(practiceProject);
    const listed = (await asOwner("GET", "/workspace/projects")).json() as Json[];
    expect(listed.filter((x) => x.practice)).toHaveLength(1);
    const ev = await h.db.query("select 1 from events where body->>'type' = 'project.practice-started' and body->>'subject' = $1", [practiceProject]);
    expect(ev.rowCount).toBe(1);
  });
});

describe("practice and real work never meet", () => {
  it("refuses a practice agent on a real project, at create and at update", async () => {
    for (const pick of [{ author: { ecosystem: "practice", model: "default", reasoning: "default" } }, { checker: { ecosystem: "practice-check", model: "default", reasoning: "default" } }, { laneAgents: { drafting: "practice" } }]) {
      const r = await signedAdmin("project.workspace-create", { name: "Real with practice", ...pick });
      expect(r.statusCode, JSON.stringify(pick)).toBe(400);
      expect(r.json().code).toBe("practice-only");
    }
    const made = await signedAdmin("project.workspace-create", { name: "Real work", lane: "internal" });
    expect(made.statusCode, made.body).toBe(200);
    expect(made.json().practice).toBeUndefined();
    realProject = made.json().id;
    // A pick of the agent for a column is a press without the passkey, and is refused just the same.
    const press = await asOwner("POST", "/admin/commands/project.workspace-update", { payload: { project_id: realProject, patch: { author: { ecosystem: "practice", model: "default", reasoning: "default" } } } });
    expect(press.statusCode).toBe(400);
    expect(press.json().code).toBe("practice-only");
  });

  it("keeps the practice project's agents and sample fixed", async () => {
    const r = await asOwner("POST", "/admin/commands/project.workspace-update", { payload: { project_id: practiceProject, patch: { author: { ecosystem: "claude", model: "default", reasoning: "default" } } } });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("practice-fixed");
    const repoPatch = await signedAdmin("project.workspace-update", { project_id: practiceProject, patch: { repo: "my-app" } });
    expect(repoPatch.statusCode).toBe(409);
  });

  it("refuses a capture on a real project that asks for a practice agent", async () => {
    const r = await asOwner("POST", "/captures", { lane: "internal", text: `[project-id:${realProject}] [author:practice/default]\nDo real work.` });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe("practice-only");
  });

  it("never gives a real project's work to a practice agent", async () => {
    await h.admin.query("update runs set status = 'stopped' where status = 'queued'");
    const cap = await asOwner("POST", "/captures", { lane: "internal", text: `[project-id:${realProject}]\nReal request.` });
    expect(cap.statusCode, cap.body).toBe(201);
    expect(await claim(PRACTICE)).toBeNull();
    const job = await claim(["claude", ...PRACTICE]);
    expect(job.run.package_id).toBe(cap.json().id);
    expect(job.run.runtime.provider).toBe("claude");
    await h.admin.query("update runs set status = 'stopped' where id = $1", [job.run.id]);
  });
});

describe("a practice card walks the whole loop", () => {
  let capture = "";
  let pkg = "";

  it("makes a practice card with the sample attached", async () => {
    const r = await asOwner("POST", "/practice/cards");
    expect(r.statusCode, r.body).toBe(201);
    const body = r.json();
    expect(body.project_id).toBe(practiceProject);
    expect(body.capture.lane).toBe("public");
    expect(body.capture.text.split("\n")[0]).toBe(`[project-id:${practiceProject}] [mode:software]`);
    expect(body.capture.checkout).toBeUndefined();
    capture = body.capture.id;
  });

  it("waits for the practice agents, and no real agent takes it", async () => {
    expect(await claim(REAL)).toBeNull();
    expect((await queuedRun("intake", capture))?.waiting_reason).toBe(PRACTICE_RUNTIME_HOLD);
  });

  it("plans on the practice agent", async () => {
    const job = await claim(["claude", ...PRACTICE]);
    expect(job.run).toMatchObject({ role: "intake", package_id: capture, runtime: { kind: "local", provider: "practice", model: "practice" } });
    expect(job.run.checkout).toBeUndefined();
    expect(input(job, "attachments/README.md")).toBe(readFileSync(join(sample, "README.md"), "utf8"));
    expect(input(job, "attachments/hello.py")).toBe(readFileSync(join(sample, "hello.py"), "utf8"));
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", outputs: goldenOutputs("intake") });
    expect(done.statusCode, done.body).toBe(200);
    const listed = (await asOwner("GET", "/packages")).json() as Json[];
    pkg = listed.find((p) => p.id.endsWith("-README") && p.project === practiceProject)?.id;
    expect(pkg).toBeTruthy();
    expect((await view(pkg)).package.status).toBe("draft");
  });

  it("releases with the passkey, never with a press", async () => {
    const press = await asOwner("POST", `/packages/${pkg}/decisions`, { kind: "release", package_revision: 0 });
    expect(press.statusCode).toBe(403);
    const r = await decide(pkg, "release");
    expect(r.statusCode, r.body).toBe(201);
    expect((await view(pkg)).package.status).toBe("released");
  });

  it("authors on the practice agent", async () => {
    expect(await claim(REAL)).toBeNull();
    const job = await claim(PRACTICE);
    expect(job.run).toMatchObject({ role: "author", package_id: pkg, runtime: { provider: "practice" } });
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", outputs: goldenOutputs("author") });
    expect(done.statusCode, done.body).toBe(200);
    expect((await view(pkg)).package.status).toBe("in-verification");
  });

  it("pre-checks on the practice checker, independent with no override, and never on the author's agent", async () => {
    expect(await claim(["practice", ...REAL])).toBeNull();
    const job = await claim(PRACTICE);
    expect(job.run).toMatchObject({ role: "pre-check", package_id: pkg, runtime: { kind: "local", provider: "practice-check" } });
    expect(input(job, "deliverables/README.md")).toContain("## Getting started");
    const outputs = goldenOutputs("pre-check");
    const verification = JSON.parse(Buffer.from(outputs.find((o) => o.name === "verification.json")!.content_base64, "base64").toString());
    expect(verification.outcome).toBe("pass");
    const done = await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", outputs, verification });
    expect(done.statusCode, done.body).toBe(200);
    const v = await view(pkg);
    expect(v.package.status).toBe("in-verification");
    // A practice check is not a counted one: it records no attestation, and no override was needed.
    const run = (await h.db.query<{ body: Json }>("select body from runs where id = $1", [job.run.id])).rows[0]!.body;
    expect(run.status).toBe("succeeded");
    expect(run.attestation).toBeUndefined();
    const overrides = await h.db.query("select 1 from events where body->>'subject' = $1 and body->>'type' like '%override%'", [pkg]);
    expect(overrides.rowCount).toBe(0);
  });

  it("accepts with the passkey, and opens no pull request", async () => {
    const press = await asOwner("POST", `/packages/${pkg}/decisions`, { kind: "accept", package_revision: 0 });
    expect(press.statusCode).toBe(403);
    const r = await decide(pkg, "accept");
    expect(r.statusCode, r.body).toBe(201);
    expect((await view(pkg)).package.status).toBe("accepted");
    await new Promise((res) => setTimeout(res, 50));
    const prs = await h.db.query("select 1 from events where body->>'subject' = $1 and body->>'type' like 'package.pr-%'", [pkg]);
    expect(prs.rowCount).toBe(0);
  });

  it("left the bundled sample as it was", () => {
    expect(existsSync(join(sample, "PRACTICE.md"))).toBe(false);
    expect(readFileSync(join(sample, "README.md"), "utf8")).not.toContain("Getting started");
  });
});
