import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** The brief builder and intake under each workflow, against fixture workflow packs and the fixture nuclear-grade pack. */
const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const fixtureWorkflows = fileURLToPath(new URL("./fixtures/workflows/", import.meta.url));
const fixtureNuclear = fileURLToPath(new URL("./fixtures/nuclear-grade/", import.meta.url));

let packsDir = "";
/** The real repository with packs/workflows and packs/nuclear-grade replaced by fixtures. */
function rootWithFixturePacks(): string {
  const dir = mkdtempSync(join(tmpdir(), "cr-root-wf-"));
  for (const entry of readdirSync(repo)) if (entry !== "packs" && entry !== "node_modules") symlinkSync(join(repo, entry), join(dir, entry));
  mkdirSync(join(dir, "packs"));
  for (const entry of readdirSync(join(repo, "packs"))) if (entry !== "nuclear-grade" && entry !== "workflows") symlinkSync(join(repo, "packs", entry), join(dir, "packs", entry));
  symlinkSync(fixtureNuclear, join(dir, "packs", "nuclear-grade"));
  symlinkSync(fixtureWorkflows, join(dir, "packs", "workflows"));
  packsDir = join(dir, "packs", "workflows");
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness({ root: rootWithFixturePacks() });
  cookie = await signIn(h.app, passkey);
}, 120_000);
afterAll(async () => h?.stop());

const asOwner = (method: "GET" | "POST", url: string, payload?: unknown) =>
  h.app.inject({ method, url, headers: { cookie, ...(method === "GET" ? {} : { origin: ORIGIN }) }, ...(payload !== undefined ? { payload: payload as object } : {}) });
const asDaemon = async (url: string, payload: unknown): Promise<DaemonReply> => {
  const body = await sealDaemonPayload(h.admin, url, withClaim(url, payload as Record<string, unknown>));
  return (await h.app.inject({ method: "POST", url, headers: daemonHeaders, payload: body })) as DaemonReply;
};

interface Job {
  run: { id: string; role: string; package_id: string; round: number };
  inputs: { name: string; content_base64: string }[];
  claim: { token: string };
}
async function claim(runtimes = ["fake"]): Promise<Job | null> {
  const r = await asDaemon("/runner/claim", { runtimes });
  if (r.statusCode === 204) return null;
  const job = r.json() as Job;
  claims.set(job.run.id, job.claim.token);
  return job;
}
/** Claims jobs, failing any left over from other tests, until one for `id` (a package or capture id) comes. */
async function claimFor(id: string, runtimes = ["fake"]): Promise<Job> {
  for (let i = 0; i < 20; i++) {
    const job = await claim(runtimes);
    if (!job) break;
    if (job.run.package_id === id) return job;
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "left over from another test", outputs: [] });
  }
  throw new Error(`no job for ${id}`);
}
const input = (job: Job, name: string) => {
  const f = job.inputs.find((i) => i.name === name);
  return f ? Buffer.from(f.content_base64, "base64").toString() : undefined;
};
const names = (job: Job) => job.inputs.map((i) => i.name);
const finish = (job: Job) => asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });

function draft(id: string, rigor = "standard", extra: Record<string, unknown> = {}) {
  return {
    schema_version: "0.1.0",
    id,
    revision: 0,
    title: `Package ${id}`,
    project: "PRJ-TEST",
    mode: "general",
    status: "draft",
    rigor_mode: rigor,
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

/** Sends a capture, runs its intake to produce `drafts`, and returns the package ids drafted. */
async function intake(text: string, drafts: unknown[]): Promise<{ job: Job; ids: string[] }> {
  const cap = await asOwner("POST", "/captures", { lane: "internal", text });
  expect(cap.statusCode, cap.body).toBe(201);
  const job = await claim();
  if (!job) throw new Error("no intake job");
  const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
    status: "succeeded",
    outputs: drafts.map((d, i) => ({ name: `packages/p${i}.json`, content_base64: b64(JSON.stringify(d)) })),
  });
  expect(r.statusCode, r.body).toBeLessThan(300);
  const all = (await asOwner("GET", "/packages")).json() as { id: string }[];
  return { job, ids: all.filter((p) => drafts.some((d) => p.id.endsWith(`-${(d as { id: string }).id}`))).map((p) => p.id) };
}
const bodyOf = async (id: string) => (await h.db.query<{ body: Record<string, unknown> }>("select body from packages where id = $1 and revision = 0", [id])).rows[0]!.body;

async function releasedPackage(key: string, rigor = "standard"): Promise<string> {
  const { ids } = await intake(`Make ${key}`, [draft(key, rigor)]);
  const id = ids.find((p) => p.endsWith(`-${key}`));
  if (!id) throw new Error("package not drafted");
  const o = await asOwner("POST", `/packages/${id}/decisions/options`, { kind: "release", package_revision: 0 });
  expect(o.statusCode, o.body).toBe(200);
  const d = await asOwner("POST", `/packages/${id}/decisions`, { kind: "release", package_revision: 0, assertion: passkey.assert(o.json().options) });
  expect(d.statusCode, d.body).toBe(201);
  return id;
}

const setBody = (id: string, fields: Record<string, unknown>) => h.admin.query("update packages set body = body || $2::jsonb where id = $1", [id, JSON.stringify(fields)]);
const workflowEvents = async (runId: string) =>
  (await h.db.query<{ body: { data: Record<string, unknown> } }>("select body from events where body->>'type' = 'run.workflow' and body->>'subject' = $1", [runId])).rows.map((r) => r.body.data);

const RULES_BEFORE = `## Rules

- Read every file under inputs/. Write every deliverable into out/. Never edit inputs/.
- Every engineering number comes from a tool or code you run, never typed from memory.
- Cite every outside fact with its source and the date you retrieved it.
- You cannot approve, accept or release anything. A person does that.
`;
const beforeBrief = (id: string, key: string) =>
  [
    `# Control Rod brief\n\nRole: author · Package ${id} revision 0 · Round 1\n`,
    readFileSync(join(repo, "packs", "general", "roles", "general-author.md"), "utf8"),
    `## The work package\n\nSee inputs/PACKAGE.json. Objective: Produce ${key}\n`,
    RULES_BEFORE,
  ].join("\n");

/** Runs `fn` with packs/workflows pointing at `target`, then restores the fixtures. */
async function withWorkflowPacks<T>(target: string, fn: () => Promise<T>): Promise<T> {
  rmSync(packsDir);
  symlinkSync(target, packsDir);
  try {
    return await fn();
  } finally {
    rmSync(packsDir);
    symlinkSync(fixtureWorkflows, packsDir);
  }
}

describe("workflows in the brief", () => {
  it("leaves a playbook brief byte for byte as it was, with no workflow inputs and no workflow event", async () => {
    const id = await releasedPackage("PLAY1");
    const job = await claimFor(id);
    expect(input(job, "BRIEF.md")).toBe(beforeBrief(id, "PLAY1"));
    expect(names(job).filter((n) => n.startsWith("workflow/"))).toEqual([]);
    expect(await workflowEvents(job.run.id)).toEqual([]);
    await finish(job);
  });

  it("leaves a Nuclear playbook brief byte for byte as it was", async () => {
    const id = await releasedPackage("PLAY2", "quick");
    await setBody(id, { context_profile: "nuclear", workflow: "playbook" });
    const job = await claimFor(id);
    const brief = input(job, "BRIEF.md") ?? "";
    // Everything before the Nuclear section is the Light brief, and the rules still end it.
    const light = beforeBrief(id, "PLAY2");
    expect(brief.startsWith(light.slice(0, light.indexOf("## Rules")))).toBe(true);
    expect(brief).toContain("## Nuclear-grade context");
    expect(brief.endsWith(RULES_BEFORE)).toBe(true);
    expect(brief).not.toContain("Workflow:");
    expect(names(job).filter((n) => n.startsWith("workflow/"))).toEqual([]);
    expect(await workflowEvents(job.run.id)).toEqual([]);
    await finish(job);
  });

  it("gives an author the card and the skills of the card's workflow, and records the choice", async () => {
    const id = await releasedPackage("POC1");
    await setBody(id, { workflow: "pocock" });
    const job = await claimFor(id);
    const brief = input(job, "BRIEF.md") ?? "";
    expect(brief).toContain("Workflow: pocock (pocock 7c7c7c7c7c7c).");
    expect(brief).toContain("CARD-MARKER-pocock-author");
    expect(brief).not.toContain("SKILL-MARKER");
    expect(brief.indexOf("CARD-MARKER-pocock-author")).toBeLessThan(brief.indexOf("## Rules"));
    expect(names(job)).toEqual(expect.arrayContaining(["workflow/pocock/tdd/SKILL.md", "workflow/pocock/tdd/deep-modules.md", "workflow/pocock/retro/SKILL.md"]));
    expect(input(job, "workflow/pocock/tdd/SKILL.md")).toContain("SKILL-MARKER-pocock-tdd-SKILL.md");
    expect(await workflowEvents(job.run.id)).toEqual([
      { package: id, role: "author", workflow: "pocock", reason: "The card is set to pocock", pack_commits: { pocock: "7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c" } },
    ]);
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "succeeded", outputs: [{ name: "report.md", content_base64: b64("# Report") }] });

    const check = await claimFor(id, ["codex"]);
    expect(check.run.role).toBe("pre-check");
    expect(input(check, "BRIEF.md")).toContain("CARD-MARKER-pocock-pre-check");
    expect(names(check)).toContain("workflow/pocock/code-review/SKILL.md");
    expect((await workflowEvents(check.run.id))[0]).toMatchObject({ role: "pre-check", workflow: "pocock" });
    await finish(check);
  });

  it("takes a card's project default only from a project of the package's own organization", async () => {
    const id = await releasedPackage("XORG");
    const org = (await h.admin.query<{ org_id: string }>("select org_id from object_owners where object_kind = 'package' and object_id = $1", [id])).rows[0]!.org_id;
    await h.admin.query("insert into organizations (body) values ($1) on conflict do nothing", [{ id: "org_wf_other", name: "Other" }]);
    await h.admin.query("insert into projects (body) values ($1)", [{ id: "prj_wf_foreign", org_id: "org_wf_other", name: "Foreign", default_workflow: "pocock" }]);
    await h.admin.query("insert into projects (body) values ($1)", [{ id: "prj_wf_own", org_id: org, name: "Own", default_workflow: "pocock" }]);
    await h.admin.query("update packages set body = (body - 'workflow') || $2::jsonb where id = $1", [id, JSON.stringify({ project: "prj_wf_foreign" })]);
    const foreign = await claimFor(id);
    expect(input(foreign, "BRIEF.md")).not.toContain("Workflow:");
    expect(await workflowEvents(foreign.run.id)).toEqual([]);
    await finish(foreign);
    // The same default on the package's own project applies, so the filter is what refused it.
    await asOwner("POST", `/packages/${id}/runs/${foreign.run.id}/requeue`);
    await setBody(id, { project: "prj_wf_own" });
    const own = await claimFor(id);
    expect(input(own, "BRIEF.md")).toContain("CARD-MARKER-pocock-author");
    await finish(own);
  });

  it("stamps the playbook on drafts of an untagged request, so a default set while intake ran does not move them", async () => {
    const text = "[mode:software] [project:Late Default]\n\nBuild the thing";
    const cap = await asOwner("POST", "/captures", { lane: "internal", text });
    const capId = (cap.json() as { id: string }).id;
    const org = (await h.admin.query<{ org_id: string }>("select org_id from object_owners where object_kind = 'capture' and object_id = $1", [capId])).rows[0]!.org_id;
    await h.admin.query("insert into projects (body) values ($1)", [{ id: "prj_wf_late", org_id: org, name: "Late Default" }]);
    const job = await claim();
    if (!job) throw new Error("no intake job");
    expect(await workflowEvents(job.run.id)).toEqual([]);
    await h.admin.query("update projects set body = body || $2::jsonb where id = $1", ["prj_wf_late", JSON.stringify({ default_workflow: "pocock" })]);
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "packages/a.json", content_base64: b64(JSON.stringify(draft("LATE", "standard", { project: "prj_wf_late" }))) }],
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await bodyOf(await idEnding("LATE"))).workflow).toBe("playbook");
  });

  it("puts the workflow before the Nuclear section, and ships the hybrid's skills from both packs", async () => {
    const id = await releasedPackage("HYB1", "quick");
    await setBody(id, { workflow: "pocock-superpowers", context_profile: "nuclear" });
    const job = await claimFor(id);
    const brief = input(job, "BRIEF.md") ?? "";
    expect(brief).toContain("Workflow: pocock-superpowers (pocock 7c7c7c7c7c7c, superpowers 5a5a5a5a5a5a).");
    expect(brief.indexOf("CARD-MARKER-pocock-superpowers-author")).toBeLessThan(brief.indexOf("## Nuclear-grade context"));
    expect(brief.indexOf("## Nuclear-grade context")).toBeLessThan(brief.indexOf("## Rules"));
    expect(names(job)).toEqual(expect.arrayContaining(["workflow/superpowers/subagent-driven-development/implementer-prompt.md", "workflow/pocock/tdd/SKILL.md", "reference/core-discipline/SKILL.md"]));
    expect((await workflowEvents(job.run.id))[0]).toMatchObject({
      workflow: "pocock-superpowers",
      pack_commits: { pocock: "7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c", superpowers: "5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a" },
    });
    await finish(job);
  });

  it("does not launch a run whose workflow pack fails its digests: it fails queued, with the problem on the run and the event", async () => {
    const id = await releasedPackage("TAMPER1");
    await setBody(id, { workflow: "superpowers" });
    const tampered = mkdtempSync(join(tmpdir(), "cr-wf-tampered-"));
    cpSync(fixtureWorkflows, tampered, { recursive: true });
    writeFileSync(join(tampered, "superpowers", "reference", "writing-plans", "SKILL.md"), "changed\n");
    await withWorkflowPacks(tampered, async () => {
      for (let i = 0; i < 20; i++) {
        const job = await claim();
        if (!job) break;
        expect(job.run.package_id).not.toBe(id);
        await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "left over from another test", outputs: [] });
      }
    });
    rmSync(tampered, { recursive: true, force: true });
    const run = (await h.db.query<{ id: string; status: string; body: { error?: string; label?: string } }>("select id, status, body from runs where package_id = $1 and role = 'author'", [id])).rows;
    expect(run).toHaveLength(1);
    expect(run[0]!.status).toBe("failed");
    expect(run[0]!.body.label).toBe("Not started");
    expect(run[0]!.body.error).toMatch(/Not started: this package runs the superpowers workflow .*writing-plans\/SKILL\.md does not match its manifest digest/);
    expect((await h.db.query("select 1 from events where body->>'type' = 'run.started' and body->>'subject' = $1", [run[0]!.id])).rowCount).toBe(0);
    expect(await workflowEvents(run[0]!.id)).toEqual([expect.objectContaining({ workflow: "superpowers", problem: expect.stringMatching(/does not match its manifest digest/) })]);
    expect((await h.db.query<{ status: string }>("select status from packages where id = $1", [id])).rows[0]!.status).toBe("released");
  });

  it("fails a queued run whose workflow pack is not installed", async () => {
    const id = await releasedPackage("MISSING1");
    await setBody(id, { workflow: "pocock" });
    const empty = mkdtempSync(join(tmpdir(), "cr-wf-empty-"));
    await withWorkflowPacks(empty, async () => {
      for (let i = 0; i < 20; i++) {
        const job = await claim();
        if (!job) break;
        expect(job.run.package_id).not.toBe(id);
        await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "left over from another test", outputs: [] });
      }
    });
    rmSync(empty, { recursive: true, force: true });
    const run = (await h.db.query<{ status: string; body: { error?: string } }>("select status, body from runs where package_id = $1 and role = 'author'", [id])).rows[0]!;
    expect(run.status).toBe("failed");
    expect(run.body.error).toMatch(/the pocock workflow pack is not installed/);
  });
});

describe("workflows at intake", () => {
  it("gives a tagged request the intake card and skills, and stamps the tag on every draft over what the agent wrote", async () => {
    const text = "[mode:software] [project:CR] [workflow:pocock-superpowers] [stage:design]\n\nBuild the thing";
    const cap = await asOwner("POST", "/captures", { lane: "internal", text });
    expect(cap.statusCode, cap.body).toBe(201);
    const job = await claim();
    if (!job) throw new Error("no intake job");
    const brief = input(job, "BRIEF.md") ?? "";
    expect(brief).toContain("CARD-MARKER-pocock-superpowers-intake");
    expect(brief.indexOf("CARD-MARKER-pocock-superpowers-intake")).toBeLessThan(brief.indexOf("## The request"));
    expect(names(job)).toEqual(expect.arrayContaining(["workflow/pocock/grilling/SKILL.md", "workflow/superpowers/writing-plans/SKILL.md"]));
    expect(await workflowEvents(job.run.id)).toEqual([
      expect.objectContaining({ role: "intake", workflow: "pocock-superpowers", reason: "The request is tagged [workflow:pocock-superpowers]" }),
    ]);
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [
        { name: "packages/a.json", content_base64: b64(JSON.stringify(draft("TAGA", "standard", { workflow: "superpowers" }))) },
        { name: "packages/b.json", content_base64: b64(JSON.stringify(draft("TAGB"))) },
      ],
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await bodyOf(await idEnding("TAGA"))).workflow).toBe("pocock-superpowers");
    expect((await bodyOf(await idEnding("TAGB"))).workflow).toBe("pocock-superpowers");
  });

  it("gives an untagged request its named project's default workflow, and stamps the launch-time choice on every draft", async () => {
    const text = "[mode:software] [project:Plant Works] [stage:design]\n\nBuild the thing";
    const cap = await asOwner("POST", "/captures", { lane: "internal", text });
    expect(cap.statusCode, cap.body).toBe(201);
    const capId = (cap.json() as { id: string }).id;
    const org = (await h.admin.query<{ org_id: string }>("select org_id from object_owners where object_kind = 'capture' and object_id = $1", [capId])).rows[0]!.org_id;
    // id and org_id are generated from the body.
    await h.admin.query("insert into projects (body) values ($1)", [{ id: "prj_wf_plant", org_id: org, name: "Plant Works", default_workflow: "pocock" }]);
    const job = await claim();
    if (!job) {
      const run = (await h.db.query("select status, body from runs where package_id = $1", [capId])).rows;
      throw new Error(`no intake job: ${JSON.stringify(run)}`);
    }
    expect(input(job, "BRIEF.md")).toContain("CARD-MARKER-pocock-intake");
    expect(await workflowEvents(job.run.id)).toEqual([
      expect.objectContaining({ role: "intake", workflow: "pocock", reason: "The project default is pocock (the request names project Plant Works)" }),
    ]);
    // The administrator changes the default while the run is working: the drafts keep the launch-time choice.
    await h.admin.query("update projects set body = body || $2::jsonb where id = $1", ["prj_wf_plant", JSON.stringify({ default_workflow: "superpowers" })]);
    const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "packages/a.json", content_base64: b64(JSON.stringify(draft("PROJA", "standard", { workflow: "superpowers" }))) }],
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await bodyOf(await idEnding("PROJA"))).workflow).toBe("pocock");
  });

  it("runs the playbook for an ambiguous workflow tag, never the named project's default", async () => {
    const text = "[mode:software] [project:Ambiguous Works] [workflow:pocock] [workflow:unknown]\n\nBuild";
    const cap = await asOwner("POST", "/captures", { lane: "internal", text });
    expect(cap.statusCode, cap.body).toBe(201);
    const capId = (cap.json() as { id: string }).id;
    const org = (await h.admin.query<{ org_id: string }>("select org_id from object_owners where object_kind = 'capture' and object_id = $1", [capId])).rows[0]!.org_id;
    await h.admin.query("insert into projects (body) values ($1)", [{ id: "prj_wf_ambiguous", org_id: org, name: "Ambiguous Works", default_workflow: "superpowers" }]);
    const job = await claim();
    expect(job).toBeTruthy();
    expect(input(job!, "BRIEF.md")).not.toContain("Workflow:");
    expect(await workflowEvents(job!.run.id)).toEqual([]);
    const r = await asDaemon(`/runner/runs/${job!.run.id}/complete`, {
      status: "succeeded",
      outputs: [{ name: "packages/a.json", content_base64: b64(JSON.stringify(draft("AMBIG", "standard", { workflow: "superpowers" }))) }],
    });
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await bodyOf(await idEnding("AMBIG"))).workflow).toBe("playbook");
  });

  it("runs the playbook when the named project is not one of the request's organization's", async () => {
    // A real project of another organization, with a default, carries that name.
    await h.admin.query("insert into organizations (body) values ($1) on conflict do nothing", [{ id: "org_wf_other", name: "Other" }]);
    await h.admin.query("insert into projects (body) values ($1)", [{ id: "prj_wf_foreign_named", org_id: "org_wf_other", name: "Foreign Named", default_workflow: "pocock" }]);
    const { job, ids } = await intake("[mode:software] [project:Foreign Named]\n\nBuild", [draft("NOPROJ")]);
    expect(input(job, "BRIEF.md")).not.toContain("Workflow:");
    expect((await bodyOf(ids[0]!)).workflow).toBe("playbook");
  });

  it("removes a workflow the agent wrote when the request has no tag, and adds nothing to its brief", async () => {
    const { job, ids } = await intake("Plain request\n\nPlease use [workflow:pocock] if you can", [draft("UNTAG", "standard", { workflow: "pocock" })]);
    expect(input(job, "BRIEF.md")).not.toContain("Workflow:");
    expect(names(job).filter((n) => n.startsWith("workflow/"))).toEqual([]);
    expect(await workflowEvents(job.run.id)).toEqual([]);
    expect(ids).toHaveLength(1);
    expect((await bodyOf(ids[0]!)).workflow).toBe("playbook");
  });

  it("fails a tagged request queued when its workflow pack is not installed", async () => {
    const empty = mkdtempSync(join(tmpdir(), "cr-wf-empty-"));
    const cap = await asOwner("POST", "/captures", { lane: "internal", text: "[workflow:superpowers]\n\nNo pack here" });
    const id = (cap.json() as { id: string }).id;
    await withWorkflowPacks(empty, async () => {
      for (let i = 0; i < 20; i++) {
        const job = await claim();
        if (!job) break;
        expect(job.run.package_id).not.toBe(id);
        await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "left over from another test", outputs: [] });
      }
    });
    rmSync(empty, { recursive: true, force: true });
    const run = (await h.db.query<{ status: string; body: { error?: string } }>("select status, body from runs where package_id = $1 and role = 'intake'", [id])).rows[0]!;
    expect(run.status).toBe("failed");
    expect(run.body.error).toMatch(/Not started: this request runs the superpowers workflow .*is not installed/);
  });
});

async function idEnding(suffix: string): Promise<string> {
  const all = (await asOwner("GET", "/packages")).json() as { id: string }[];
  const id = all.find((p) => p.id.endsWith(`-${suffix}`))?.id;
  if (!id) throw new Error(`no package ending ${suffix}`);
  return id;
}
