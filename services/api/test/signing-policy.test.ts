import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRESETS, parseSteps } from "../src/signing-policy.js";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** The owner's signing policy (change record signing-policy): choose what needs a passkey. */
describe("signing steps", () => {
  it("fills a preset, names it back, and calls a hand-changed set custom", () => {
    expect(parseSteps("light", undefined)).toEqual({ preset: "light", steps: PRESETS.light });
    expect(parseSteps(undefined, { release: "auto", accept: "passkey", return: "click", reject: "click" }).preset).toBe("balanced");
    expect(parseSteps("light", { accept: "click" })).toEqual({ preset: "custom", steps: { ...PRESETS.light, accept: "click" } });
    expect(parseSteps(undefined, undefined)).toEqual({ preset: "everything", steps: PRESETS.everything });
  });

  it("never lets return or reject happen on their own, and refuses unknown steps", () => {
    expect(() => parseSteps("light", { return: "auto" })).toThrow(/return may be click, passkey/);
    expect(() => parseSteps("light", { reject: "auto" })).toThrow();
    expect(() => parseSteps("light", { merge: "auto" })).toThrow(/Unknown step/);
    expect(() => parseSteps("reckless", undefined)).toThrow(/preset/);
  });
});

let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();
let project = "";

beforeAll(async () => {
  h = await startHarness();
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

type Json = Record<string, any>;
const asOwner = (method: "GET" | "POST", url: string, payload?: unknown) =>
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
async function claim(runtimes = ["fake"]) {
  const r = await asDaemon("/runner/claim", { runtimes, supports_checkouts: true });
  if (r.statusCode === 204) return null;
  const job = r.json();
  claims.set(job.run.id, job.claim.token);
  return job;
}
/**
 * Claims until a run of this role and package comes up. Cards released on their own leave author
 * runs queued; the ones a test does not follow are claimed and left running.
 */
async function claimFor(role: string, runtimes = ["fake"], pkg?: string) {
  for (let i = 0; i < 10; i++) {
    const job = await claim(runtimes);
    if (!job) return null;
    if (job.run.role === role && (pkg === undefined || job.run.package_id === pkg)) return job;
  }
  return null;
}

function draft(id: string, extra: Json = {}) {
  return {
    schema_version: "0.1.0",
    id,
    revision: 0,
    title: `Package ${id}`,
    project,
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
    ...extra,
  };
}

/** Captures a request and has intake draft it into one package; returns the package id. */
async function drafted(id: string, extra: Json = {}, lane = "internal"): Promise<string> {
  expect((await asOwner("POST", "/captures", { lane, text: `[project-id:${project}]\n\nDraft ${id}` })).statusCode).toBe(201);
  const intake = await claimFor("intake");
  const done = await asDaemon(`/runner/runs/${intake.run.id}/complete`, {
    status: "succeeded",
    outputs: [{ name: `packages/${id}.json`, content_base64: b64(JSON.stringify(draft(id, extra))) }],
  });
  expect(done.statusCode, done.body).toBe(200);
  return (await asOwner("GET", "/packages")).json().find((p: { id: string }) => p.id.endsWith(`-${id}`)).id;
}

/** Runs the author and a pre-check with the given outcome. */
async function authorAndCheck(pkg: string, outcome: "pass" | "fail") {
  const author = await claimFor("author", ["fake"], pkg);
  expect(author.run.role).toBe("author");
  await asDaemon(`/runner/runs/${author.run.id}/complete`, { status: "succeeded", outputs: [{ name: "report.md", content_base64: b64("done") }] });
  const check = await claimFor("pre-check", ["codex"], pkg);
  expect(check.run.role).toBe("pre-check");
  const done = await asDaemon(`/runner/runs/${check.run.id}/complete`, {
    status: "succeeded",
    outputs: [],
    verification: { outcome, findings: outcome === "pass" ? [] : [{ id: "F-001", severity: "major", text: "Missing source" }] },
  });
  expect(done.statusCode, done.body).toBe(200);
}

const view = async (id: string) => (await asOwner("GET", `/packages/${id}`)).json();
const actions = async (id: string) => (await asOwner("GET", `/packages/${id}/actions`)).json() as Json[];

describe("signing policy on a project", () => {
  it("creates the project", async () => {
    const r = await signedAdmin("project.create", { name: "Policy", mode: "capital-projects", default_rigor: "standard", lanes: ["internal", "public"], qa_overlays: [] });
    expect(r.statusCode, r.body).toBe(200);
    project = r.json().id;
  });

  it("signs every step while the project has no policy", async () => {
    const id = await drafted("NOPOLICY");
    expect((await view(id)).package.status).toBe("draft");
    const release = (await actions(id)).find((a) => a.command === "release")!;
    expect(release).toMatchObject({ signature: "direct", step_mode: "passkey" });
    const r = await asOwner("POST", `/packages/${id}/decisions`, { kind: "release", package_revision: 0 });
    expect(r.statusCode).toBe(403);
  });

  it("is itself signed with a passkey", async () => {
    const r = await asOwner("POST", "/admin/commands/project.set-signing-policy", { payload: { project_id: project, preset: "light" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("signature-required");
    const ok = await signedAdmin("project.set-signing-policy", { project_id: project, preset: "light" });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ project_id: project, version: 1, preset: "light", steps: PRESETS.light });
  });

  it("under Light, releases a routine card on its own and records the policy it relied on", async () => {
    const id = await drafted("LIGHT");
    const v = await view(id);
    expect(v.package.status).toBe("released");
    const release = v.decisions.find((d: Json) => d.kind === "release");
    expect(release.actor).toEqual({ kind: "system", id: expect.stringMatching(/^policy:SP-/) });
    expect(release.signing_policy).toMatchObject({ preset: "light", version: 1, steps: PRESETS.light });
    expect(release.assertion.signature).not.toBe("");
  });

  it("under Light, accepts a pass on its own", async () => {
    const id = (await asOwner("GET", "/packages")).json().find((p: { id: string }) => p.id.endsWith("-LIGHT")).id;
    await authorAndCheck(id, "pass");
    const v = await view(id);
    expect(v.package.status).toBe("accepted");
    expect(v.decisions.find((d: Json) => d.kind === "accept").actor.kind).toBe("system");
  });

  it("under Light, a card bound to a repository checkout goes out as a pull request once accepted", async () => {
    const root = mkdtempSync(join(realpathSync(homedir()), "cr-pr-out-"));
    const base = join(root, "demo");
    const path = join(root, ".worktrees", "demo", "topic");
    const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
    try {
      mkdirSync(base);
      git(base, "init", "-b", "main");
      git(base, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "Initial commit");
      mkdirSync(dirname(path), { recursive: true });
      git(base, "worktree", "add", "-b", "topic", path);
      expect((await asOwner("POST", "/captures", { lane: "internal", text: `[project-id:${project}]\n\nDraft PROUT`, checkout: { repo: "demo", branch: "topic", local_path: path, workspace_root: root } })).statusCode).toBe(201);
      const intake = await claimFor("intake");
      await asDaemon(`/runner/runs/${intake.run.id}/complete`, { status: "succeeded", outputs: [{ name: "packages/PROUT.json", content_base64: b64(JSON.stringify(draft("PROUT"))) }] });
      const id = (await asOwner("GET", "/packages")).json().find((p: { id: string }) => p.id.endsWith("-PROUT")).id;
      expect((await view(id)).package.status).toBe("released");
      const author = await claimFor("author", ["fake"], id);
      const frozen = author.run.checkout;
      const done = await asDaemon(`/runner/runs/${author.run.id}/complete`, {
        status: "succeeded",
        trace: {
          schema_version: "0.1.0", run_id: author.run.id, package_id: id, package_revision: 0, agent_baseline: "intake-fake", baseline_revision: 0,
          tool: { name: "fake", version: "test" }, inputs: [], outputs: [], started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
          checkout: frozen, checkout_final: { branch: "topic", head: frozen.head },
        },
        outputs: [{ name: "report.md", content_base64: b64("done") }],
      });
      expect(done.statusCode, done.body).toBe(200);
      expect(done.json().status, done.body).toBe("succeeded");
      const check = await claimFor("pre-check", ["codex"], id);
      expect(check, JSON.stringify((await view(id)).runs.map((r: Json) => [r.role, r.status, r.waiting_reason, r.failure ?? r.error ?? r.refusal]))).toBeTruthy();
      await asDaemon(`/runner/runs/${check.run.id}/complete`, { status: "succeeded", outputs: [], verification: { outcome: "pass", findings: [] } });
      expect((await view(id)).package.status).toBe("accepted");
      // The pull request goes out after the accept commits; "demo" is a local repository, so the
      // card says why there is none instead.
      let pr: Json | undefined;
      for (let i = 0; i < 50 && !(pr && pr.state !== "opening"); i++) {
        pr = (await view(id)).pull_request;
        if (!pr || pr.state === "opening") await new Promise((r) => setTimeout(r, 50));
      }
      expect(pr).toMatchObject({ state: "not-opened", detail: expect.stringMatching(/Only a GitHub repository/) });
      const events = await h.db.query<{ body: Json }>("select body from events where body->>'subject' = $1 and body->>'type' like 'package.pr-%' order by seq", [id]);
      expect(events.rows.map((e) => e.body.type)).toEqual(["package.pr-started", "package.pr-not-opened"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never accepts a failed check on its own, and lets a person return it with a press", async () => {
    const id = await drafted("FAILS");
    await authorAndCheck(id, "fail");
    const v = await view(id);
    expect(v.package.status).not.toBe("accepted");
    const ret = (await actions(id)).find((a) => a.command === "return")!;
    expect(ret).toMatchObject({ signature: "none", step_mode: "click", signing_preset: "light" });
    // A press must say which version the person saw.
    const blind = await asOwner("POST", `/packages/${id}/decisions`, { kind: "return", package_revision: 0, reason: "Plan needs another look" });
    expect(blind.statusCode).toBe(400);
    const r = await asOwner("POST", `/packages/${id}/decisions`, { kind: "return", package_revision: 0, reason: "Plan needs another look", expected_subject_digest: (await view(id)).subject_digest });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ actor: { kind: "human" }, signing_policy: { preset: "light" } });
  });

  it("refuses a press made on a card that changed since it was shown", async () => {
    const id = await drafted("CHANGED");
    const r = await asOwner("POST", `/packages/${id}/decisions`, {
      kind: "reject", package_revision: 0, reason: "no", expected_subject_digest: { algorithm: "sha256", value: "0".repeat(64) },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe("changed");
  });

  it("refuses a passkey that does not verify instead of taking it as a press", async () => {
    const id = await drafted("BADKEY");
    const o = await asOwner("POST", `/packages/${id}/decisions/options`, { kind: "reject", package_revision: 0 });
    const r = await asOwner("POST", `/packages/${id}/decisions`, {
      kind: "return", package_revision: 0, reason: "x", expected_subject_digest: (await view(id)).subject_digest, assertion: passkey.assert(o.json().options),
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe("unsigned");
  });

  it("covers only a card filed under the project its request named", async () => {
    // The draft says it belongs to the Light project, but the request named no project.
    expect((await asOwner("POST", "/captures", { lane: "internal", text: "Draft BORROW" })).statusCode).toBe(201);
    const intake = await claimFor("intake");
    await asDaemon(`/runner/runs/${intake.run.id}/complete`, { status: "succeeded", outputs: [{ name: "packages/BORROW.json", content_base64: b64(JSON.stringify(draft("BORROW"))) }] });
    const id = (await asOwner("GET", "/packages")).json().find((p: { id: string }) => p.id.endsWith("-BORROW")).id;
    expect((await view(id)).package.status).toBe("draft");
    expect((await actions(id)).find((a) => a.command === "release")).toMatchObject({ step_mode: "passkey" });
  });

  it("does not cover a request the person marked Nuclear-grade, whatever the draft says", async () => {
    expect((await asOwner("POST", "/captures", { lane: "internal", text: `[mode:nuclear-grade] [project-id:${project}]\n\nDraft NUKE` })).statusCode).toBe(201);
    const intake = await claimFor("intake");
    await asDaemon(`/runner/runs/${intake.run.id}/complete`, { status: "succeeded", outputs: [{ name: "packages/NUKE.json", content_base64: b64(JSON.stringify(draft("NUKE"))) }] });
    const id = (await asOwner("GET", "/packages")).json().find((p: { id: string }) => p.id.endsWith("-NUKE")).id;
    const v = await view(id);
    expect(v.package.status).toBe("draft");
    // Clearing the profile by an edit does not lift the floor: the request itself said Nuclear-grade.
    const { context_profile: _drop, ...rest } = v.package;
    expect((await h.app.inject({ method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag }, payload: rest })).statusCode).toBe(200);
    expect((await actions(id)).find((a) => a.command === "release")).toMatchObject({ step_mode: "passkey", signature: "direct" });
  });

  it("keeps intake's own Nuclear-grade judgement, even after an edit clears the profile", async () => {
    const id = await drafted("INFERRED", { mode: "nuclear-grade" });
    const v = await view(id);
    expect(v.package.context_profile).toBe("nuclear");
    const { context_profile: _drop, ...rest } = v.package;
    expect((await h.app.inject({ method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag }, payload: rest })).statusCode).toBe(200);
    expect((await actions(id)).find((a) => a.command === "release")).toMatchObject({ step_mode: "passkey" });
  });

  it("treats a null passkey as a malformed signature, never as a press", async () => {
    const id = await drafted("NULLKEY");
    const r = await asOwner("POST", `/packages/${id}/decisions`, { kind: "reject", package_revision: 0, reason: "x", expected_subject_digest: (await view(id)).subject_digest, assertion: null });
    expect(r.statusCode).toBe(403);
  });

  it("keeps a draft's project and high grade out of an edit's reach", async () => {
    const id = await drafted("EDITFLOOR", { grade: "safety", discipline: "mechanical" });
    const v = await view(id);
    const edited = await h.app.inject({
      method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag },
      payload: { ...v.package, grade: "commercial", project: "PRJ-ELSEWHERE" },
    });
    expect(edited.statusCode).toBe(409);
    expect(edited.json().code).toBe("lowering-needs-change-request");
    const kept = await h.app.inject({
      method: "PUT", url: `/packages/${id}`, headers: { cookie, origin: ORIGIN, "if-match": v.draft_etag },
      payload: { ...v.package, title: "Renamed", project: "PRJ-ELSEWHERE" },
    });
    expect(kept.statusCode, kept.body).toBe(200);
    expect(kept.json()).toMatchObject({ project, title: "Renamed" });
  });

  it("does not cover high-consequence work", async () => {
    const id = await drafted("SAFETY", { grade: "safety", discipline: "mechanical" });
    expect((await view(id)).package.status).toBe("draft");
    expect((await actions(id)).find((a) => a.command === "release")).toMatchObject({ step_mode: "passkey" });
  });

  it("under Balanced, still releases on its own but asks for a passkey to accept", async () => {
    const r = await signedAdmin("project.set-signing-policy", { project_id: project, preset: "balanced" });
    expect(r.json()).toMatchObject({ version: 2, preset: "balanced" });
    const id = await drafted("BALANCED");
    expect((await view(id)).package.status).toBe("released");
    await authorAndCheck(id, "pass");
    expect((await view(id)).package.status).toBe("in-verification");
    const press = await asOwner("POST", `/packages/${id}/decisions`, { kind: "accept", package_revision: 0 });
    expect(press.statusCode).toBe(403);
  });

  it("under Everything, behaves as before", async () => {
    await signedAdmin("project.set-signing-policy", { project_id: project, preset: "everything" });
    const id = await drafted("EVERYTHING");
    expect((await view(id)).package.status).toBe("draft");
  });
  it("asks for a passkey, on the board and at the server alike, once the policy's passkey is revoked", async () => {
    await signedAdmin("project.set-signing-policy", { project_id: project, preset: "light" });
    const id = await drafted("REVOKED");
    await authorAndCheck(id, "fail");
    // The policy's passkey is no longer a live credential (as after a revocation).
    await h.admin.query("update projects set body = jsonb_set(body, '{signing_policy,assertion,credential_id}', '\"gone\"') where id = $1", [project]);
    {
      expect((await actions(id)).find((a) => a.command === "return")).toMatchObject({ signature: "direct", step_mode: "passkey" });
      const r = await asOwner("POST", `/packages/${id}/decisions`, { kind: "return", package_revision: 0, reason: "x", expected_subject_digest: (await view(id)).subject_digest });
      expect(r.statusCode).toBe(403);
    }
  });

});
