import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FOCUS_WRITING } from "../src/brief.js";
import { type DaemonReply, sealDaemonPayload } from "./counted-check.js";
import { type Harness, ORIGIN, VirtualAuthenticator, b64, claims, daemonHeaders, signIn, startHarness, withClaim } from "./harness.js";

/** The brief builder under each context profile, against a fixture nuclear-grade pack. */
const repo = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const fixturePack = fileURLToPath(new URL("./fixtures/nuclear-grade/", import.meta.url));

let harnessRoot = "";
/** The real repository with packs/nuclear-grade replaced by the fixture pack. */
function rootWithFixtureNuclearPack(): string {
  const dir = mkdtempSync(join(tmpdir(), "cr-root-ng-"));
  for (const entry of readdirSync(repo)) if (entry !== "packs" && entry !== "node_modules") symlinkSync(join(repo, entry), join(dir, entry));
  mkdirSync(join(dir, "packs"));
  for (const entry of readdirSync(join(repo, "packs"))) if (entry !== "nuclear-grade") symlinkSync(join(repo, "packs", entry), join(dir, "packs", entry));
  symlinkSync(fixturePack, join(dir, "packs", "nuclear-grade"));
  harnessRoot = dir;
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

let h: Harness;
let cookie: string;
const passkey = new VirtualAuthenticator();

beforeAll(async () => {
  h = await startHarness({ root: rootWithFixtureNuclearPack() });
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

function draft(id: string, rigor = "standard") {
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
  };
}

async function releasedPackage(key: string, rigor = "standard"): Promise<string> {
  expect((await asOwner("POST", "/captures", { lane: "internal", text: `Make ${key}` })).statusCode).toBe(201);
  const job = await claim();
  if (!job) throw new Error("no intake job");
  const r = await asDaemon(`/runner/runs/${job.run.id}/complete`, {
    status: "succeeded",
    outputs: [{ name: "package.json", content_base64: b64(JSON.stringify(draft(key, rigor))) }],
  });
  expect(r.statusCode, r.body).toBeLessThan(300);
  const id = ((await asOwner("GET", "/packages")).json() as { id: string }[]).find((p) => p.id.endsWith(`-${key}`))?.id;
  if (!id) throw new Error("package not drafted");
  const o = await asOwner("POST", `/packages/${id}/decisions/options`, { kind: "release", package_revision: 0 });
  expect(o.statusCode, o.body).toBe(200);
  const d = await asOwner("POST", `/packages/${id}/decisions`, { kind: "release", package_revision: 0, assertion: passkey.assert(o.json().options) });
  expect(d.statusCode, d.body).toBe(201);
  return id;
}

/** Sets fields on the package body the way a later contract will carry them (not yet in spec/). */
const setBody = (id: string, fields: Record<string, unknown>) => h.admin.query("update packages set body = body || $2::jsonb where id = $1", [id, JSON.stringify(fields)]);
const profileEvents = async (runId: string) =>
  (await h.db.query<{ body: { data: Record<string, unknown> } }>("select body from events where body->>'type' = 'run.context-profile' and body->>'subject' = $1", [runId])).rows.map((r) => r.body.data);

/** The brief exactly as buildJob wrote it before context profiles existed. */
const RULES_BEFORE = `## Rules

- Read every file under inputs/. Write every deliverable into out/. Never edit inputs/.
- Every engineering number comes from a tool or code you run, never typed from memory.
- Cite every outside fact with its source and the date you retrieved it.
- You cannot approve, accept or release anything. A person does that.
`;

describe("context profiles in the brief", () => {
  it("leaves a Light brief byte for byte as it was, with no nuclear inputs and no profile event", async () => {
    const id = await releasedPackage("LIGHT1");
    const job = await claimFor(id);
    const before = [
      `# Control Rod brief\n\nRole: author · Package ${id} revision 0 · Round 1\n`,
      readFileSync(join(repo, "packs", "general", "roles", "general-author.md"), "utf8"),
      `## The work package\n\nSee inputs/PACKAGE.json. Objective: Produce LIGHT1\n`,
      // Focus writing is the install default (setup.ts), so it sits just before the rules.
      FOCUS_WRITING,
      RULES_BEFORE,
    ].join("\n");
    expect(input(job, "BRIEF.md")).toBe(before);
    expect(names(job).filter((n) => n.startsWith("reference/") || n.startsWith("templates/"))).toEqual([]);
    expect(await profileEvents(job.run.id)).toEqual([]);
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });

  it("locks Safety grade work to Nuclear over a Light card, for the author and the pre-check, with skills as inputs only", async () => {
    const id = await releasedPackage("SAFE1", "high-consequence");
    await setBody(id, { grade: "safety", context_profile: "light" });
    const author = await claimFor(id);
    const brief = input(author, "BRIEF.md") ?? "";
    expect(brief).toContain("Nuclear context profile (Safety grade work is always Nuclear)");
    expect(brief).toContain("CORE-CARD-MARKER");
    for (const c of ["agent-authority", "configuration-management", "review-panel"]) expect(brief).toContain(`CLUSTER-CARD-MARKER-${c}`);
    for (const c of ["claims-discipline", "hygiene", "incident-deficiency"]) expect(brief).not.toContain(`CLUSTER-CARD-MARKER-${c}`);
    expect(brief).not.toContain("FULL-SKILL-MARKER");
    expect(brief.indexOf("CORE-CARD-MARKER")).toBeLessThan(brief.indexOf("## Rules"));
    expect(names(author)).toEqual(expect.arrayContaining(["reference/core-discipline/SKILL.md", "reference/panel-review/SKILL.md", "templates/standard/record.md", "templates/cm/baseline.md"]));
    expect(input(author, "reference/core-discipline/SKILL.md")).toContain("FULL-SKILL-MARKER-core-discipline");
    expect(await profileEvents(author.run.id)).toEqual([
      expect.objectContaining({ profile: "nuclear", locked: true, reason: "Safety grade work is always Nuclear", clusters: ["agent-authority", "configuration-management", "review-panel"], pack_commit: "fixture0000000000000000000000000000000000" }),
    ]);
    await asDaemon(`/runner/runs/${author.run.id}/complete`, { status: "succeeded", outputs: [{ name: "report.md", content_base64: b64("# Report") }] });

    const check = await claimFor(id, ["codex"]);
    expect(check.run.role).toBe("pre-check");
    const checkBrief = input(check, "BRIEF.md") ?? "";
    expect(checkBrief).toContain("CORE-CARD-MARKER");
    expect(checkBrief).toContain("verify the author followed the same Core and cluster cards");
    expect(checkBrief).not.toContain("FULL-SKILL-MARKER");
    await asDaemon(`/runner/runs/${check.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });

  it("follows a card set to Nuclear on quick work, shipping the quick templates", async () => {
    const id = await releasedPackage("CARD1", "quick");
    await setBody(id, { context_profile: "nuclear" });
    const job = await claimFor(id);
    const brief = input(job, "BRIEF.md") ?? "";
    expect(brief).toContain("Nuclear context profile (The card is set to Nuclear)");
    expect(brief).not.toContain("CLUSTER-CARD-MARKER-configuration-management");
    expect(names(job)).toContain("templates/quick/record.md");
    expect(names(job)).not.toContain("templates/standard/record.md");
    await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "test over", outputs: [] });
  });

  it("does not launch a Nuclear run whose pack fails its digests: the run fails queued, with the problem on the run and the event", async () => {
    const id = await releasedPackage("TAMPER1", "quick");
    await setBody(id, { context_profile: "nuclear" });
    const link = join(harnessRoot, "packs", "nuclear-grade");
    const tampered = mkdtempSync(join(tmpdir(), "cr-ng-tampered-"));
    cpSync(fixturePack, tampered, { recursive: true });
    writeFileSync(join(tampered, "core.md"), "# Core card (tampered)\n");
    rmSync(link);
    symlinkSync(tampered, link);
    try {
      for (let i = 0; i < 20; i++) {
        const job = await claim();
        if (!job) break;
        expect(job.run.package_id).not.toBe(id);
        await asDaemon(`/runner/runs/${job.run.id}/complete`, { status: "failed", error: "left over from another test", outputs: [] });
      }
    } finally {
      rmSync(link);
      symlinkSync(fixturePack, link);
      rmSync(tampered, { recursive: true, force: true });
    }
    const run = (await h.db.query<{ id: string; status: string; body: { error?: string; label?: string } }>(
      "select id, status, body from runs where package_id = $1 and role = 'author'", [id])).rows;
    expect(run).toHaveLength(1);
    expect(run[0]!.status).toBe("failed");
    expect(run[0]!.body.label).toBe("Not started");
    expect(run[0]!.body.error).toMatch(/Not started: this package runs under the Nuclear context profile .*core\.md does not match its manifest digest/);
    const started = await h.db.query("select 1 from events where body->>'type' = 'run.started' and body->>'subject' = $1", [run[0]!.id]);
    expect(started.rowCount).toBe(0);
    expect(await profileEvents(run[0]!.id)).toEqual([
      expect.objectContaining({ profile: "nuclear", locked: false, problem: expect.stringMatching(/core\.md does not match its manifest digest/) }),
    ]);
    const pkgStatus = (await h.db.query<{ status: string }>("select status from packages where id = $1", [id])).rows[0]!.status;
    expect(pkgStatus).toBe("released");
  });
});
