import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Ajv2020 } from "ajv/dist/2020.js";
import { type Db, type Tx, tx } from "./db/index.js";
import { type Actor, appendEvent } from "./events.js";
import { type Action, type KernelOutcome, type Status, decide, digest } from "./kernel.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

export class Refusal extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface WorkConfig {
  /** Repository root, for packs/. */
  root: string;
  ajv: Ajv2020;
}

const SYSTEM: Actor = { kind: "system", id: "control-plane" };
const MAX_ROUNDS = 3;
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const now = () => new Date().toISOString();

function validate(cfg: WorkConfig, schema: string, value: unknown): void {
  const v = cfg.ajv.getSchema(schema);
  if (!v) throw new Error(`schema ${schema} not loaded`);
  if (!v(value)) {
    const first = v.errors?.[0];
    throw new Refusal(400, "invalid", `${schema}: ${first?.instancePath ?? ""} ${first?.message ?? "invalid"}`);
  }
}

function kernel(outcome: KernelOutcome, what: string): Status {
  if (!outcome.allowed || outcome.next === null) {
    throw new Refusal(403, outcome.reason, `Kernel refused ${what}: ${outcome.reason}`);
  }
  return outcome.next;
}

/* ---------- captures and attachments ---------- */

const FENCE = /```attachment name="([^"\n]{1,200})" encoding="base64"\n([A-Za-z0-9+/=\s]+?)\n```/g;
const MAX_ATTACHMENT = 5 * 1024 * 1024;

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,150}$/.test(base)) throw new Refusal(400, "invalid", `bad file name ${name}`);
  return base;
}

export async function createCapture(db: Db, cfg: WorkConfig, user: string, text: string, source: string) {
  const files: { name: string; bytes: Buffer }[] = [];
  const visible = text
    .replace(FENCE, (_m, name: string, b64: string) => {
      const bytes = Buffer.from(b64.replace(/\s+/g, ""), "base64");
      if (bytes.length > MAX_ATTACHMENT) throw new Refusal(400, "too-large", `${name} is over 5 MB`);
      files.push({ name: safeName(name), bytes });
      return `[attachment: ${safeName(name)}]`;
    })
    .trim();
  if (!visible) throw new Refusal(400, "invalid", "Say what needs doing");
  const capture = {
    schema_version: "0.1.0",
    id: `C-${randomUUID().slice(0, 8)}`,
    text: visible.slice(0, 20000),
    source,
    created_at: now(),
    disposition: "pending",
  };
  validate(cfg, "Capture.json", capture);
  return tx(db, async (c) => {
    await c.query("insert into captures (id, body, created_at) values ($1, $2, $3)", [capture.id, capture, capture.created_at]);
    for (const f of files) {
      await c.query("insert into attachments (capture_id, name, sha256, bytes) values ($1, $2, $3, $4)", [
        capture.id,
        f.name,
        sha256(f.bytes),
        f.bytes,
      ]);
    }
    await queueRun(c, cfg, capture.id, 0, "intake", 1);
    await appendEvent(c, "capture.created", capture.id, { kind: "human", id: user }, {
      attachments: files.map((f) => f.name),
    });
    return capture;
  });
}

/* ---------- packages ---------- */

export interface PackageRow {
  id: string;
  revision: number;
  status: Status;
  capture_id: string | null;
  body: Json;
  updated_at: Date;
}

export async function currentPackage(q: Db | Tx, id: string, lock = false): Promise<PackageRow | null> {
  const r = await q.query<PackageRow>(
    `select * from packages where id = $1 order by revision desc limit 1${lock ? " for update" : ""}`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function listPackages(db: Db): Promise<Json[]> {
  const r = await db.query<{ body: Json; status: string }>(
    `select distinct on (id) body, status from packages order by id, revision desc`,
  );
  return r.rows.map((x) => ({ ...x.body, status: x.status }));
}

async function latestAuthorRun(q: Db | Tx, id: string, rev: number) {
  const r = await q.query<{ id: string; round: number; status: string; body: Json }>(
    `select id, round, status, body from runs where package_id = $1 and package_revision = $2 and role = 'author'
     order by round desc, created_at desc limit 1`,
    [id, rev],
  );
  return r.rows[0] ?? null;
}

async function outputsOf(q: Db | Tx, runId: string) {
  const r = await q.query<{ name: string; sha256: string; bytes: Buffer }>(
    "select name, sha256, bytes from outputs where run_id = $1 order by name",
    [runId],
  );
  return r.rows;
}

async function latestVerification(q: Db | Tx, id: string, rev: number, round?: number) {
  const r = await q.query<{ body: Json; round: number; created_at: Date }>(
    `select body, round, created_at from verifications where package_id = $1 and package_revision = $2
     ${round !== undefined ? "and round = $3" : ""} order by round desc, created_at desc limit 1`,
    round !== undefined ? [id, rev, round] : [id, rev],
  );
  return r.rows[0] ?? null;
}

/** What a person reviews before deciding: the revision, its current output and its pre-check. */
export async function subjectOf(q: Db | Tx, pkg: PackageRow) {
  const author = await latestAuthorRun(q, pkg.id, pkg.revision);
  const outs = author && author.status === "succeeded" ? await outputsOf(q, author.id) : [];
  const ver = author ? await latestVerification(q, pkg.id, pkg.revision, author.round) : null;
  const subject = {
    package: { ...pkg.body, status: pkg.status },
    outputs: outs.map((o) => ({ name: o.name, sha256: o.sha256 })),
    pre_check: ver?.body ?? null,
  };
  return { subject, digest: digest(subject), author, outputs: outs, verification: ver?.body ?? null };
}

export async function packageView(db: Db, id: string) {
  const pkg = await currentPackage(db, id);
  if (!pkg) throw new Refusal(404, "not-found", "No such package");
  const s = await subjectOf(db, pkg);
  const runs = await db.query<{ body: Json; status: string }>(
    "select body, status from runs where package_id = $1 and package_revision = $2 order by created_at",
    [id, pkg.revision],
  );
  const decisions = await db.query<{ body: Json }>(
    "select body from decisions where package_id = $1 order by created_at",
    [id],
  );
  return {
    package: { ...pkg.body, status: pkg.status },
    runs: runs.rows.map((r) => ({ ...r.body, status: r.status })),
    outputs: s.outputs.map((o) => ({ path: o.name, digest: { algorithm: "sha256", value: o.sha256 } })),
    ...(s.verification ? { pre_check: s.verification } : {}),
    decisions: decisions.rows.map((d) => d.body),
    subject_digest: { algorithm: "sha256", value: s.digest },
  };
}

export async function packageOutput(db: Db, id: string, name: string) {
  const pkg = await currentPackage(db, id);
  if (!pkg) throw new Refusal(404, "not-found", "No such package");
  const author = await latestAuthorRun(db, id, pkg.revision);
  if (!author) throw new Refusal(404, "not-found", "No output yet");
  const r = await db.query<{ bytes: Buffer }>("select bytes from outputs where run_id = $1 and name = $2", [author.id, name]);
  if (!r.rows[0]) throw new Refusal(404, "not-found", "No such output");
  return r.rows[0].bytes;
}

/** Edits a draft. Identity, revision and status are the server's, never the client's. */
export async function updateDraft(db: Db, cfg: WorkConfig, user: string, id: string, body: Json) {
  return tx(db, async (c) => {
    const pkg = await currentPackage(c, id, true);
    if (!pkg) throw new Refusal(404, "not-found", "No such package");
    if (pkg.status !== "draft") throw new Refusal(409, "wrong-state", "Only a draft can be edited");
    const next = { ...body, id: pkg.id, revision: pkg.revision, status: "draft", schema_version: "0.1.0" };
    next.agent_assignment = pkg.body.agent_assignment;
    next.verification = pkg.body.verification;
    validate(cfg, "WorkPackage.json", next);
    await c.query("update packages set body = $3, updated_at = now() where id = $1 and revision = $2", [id, pkg.revision, next]);
    await appendEvent(c, "package.edited", id, { kind: "human", id: user }, { revision: pkg.revision });
    return next;
  });
}

/* ---------- runs ---------- */

async function queueRun(c: Tx, cfg: WorkConfig, packageId: string, revision: number, role: string, round: number) {
  const run = {
    schema_version: "0.1.0",
    id: `R-${randomUUID().slice(0, 8)}`,
    package_id: packageId,
    package_revision: revision,
    role,
    agent_baseline: "unassigned",
    runtime: { kind: "local", provider: "any", model: "any" },
    round,
    status: "queued",
    queued_at: now(),
  };
  validate(cfg, "Run.json", run);
  await c.query(
    "insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, $3, $4, $5, 'queued', $6)",
    [run.id, packageId, revision, role, round, run],
  );
  await appendEvent(c, "run.queued", run.id, SYSTEM, { package: packageId, role, round });
  return run;
}

/** Picks the runtime a role should use from what the daemon has. The checker avoids the author's. */
function pickRuntime(role: string, have: string[], authorRuntime?: string): string | null {
  const order =
    role === "pre-check"
      ? ["codex", "claude", "fake"].sort((a, b) => Number(a === authorRuntime) - Number(b === authorRuntime))
      : ["claude", "codex", "fake"];
  return order.find((r) => have.includes(r)) ?? null;
}

function runtimeRef(name: string) {
  return name === "fake"
    ? { kind: "local", provider: "fake", model: "fake" }
    : { kind: "subscription", provider: name, model: "default" };
}

/** Dependencies are design inputs that name another package; each must be accepted first. */
async function dependenciesReady(c: Tx, pkg: Json): Promise<{ ready: boolean; deps: string[] }> {
  const deps: string[] = [];
  for (const d of pkg.design_inputs ?? []) {
    if (typeof d.doc !== "string" || d.doc.startsWith("attachment:")) continue;
    const r = await currentPackage(c, d.doc);
    if (r) {
      deps.push(d.doc);
      if (r.status !== "accepted") return { ready: false, deps };
    }
  }
  return { ready: true, deps };
}

/**
 * Finds a role brief by name. General roles win; a job's own intake.md is read only as job
 * guidance, never as the role named "intake".
 */
function findRole(cfg: WorkConfig, name: string): string | null {
  const safe = name.replace(/[^a-z0-9.-]/gi, "");
  const general = join(cfg.root, "packs", "general", "roles", `${safe}.md`);
  if (existsSync(general)) return readFileSync(general, "utf8");
  const stack = [join(cfg.root, "packs")];
  while (stack.length) {
    const dir = stack.pop() as string;
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir).sort()) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (entry === `${safe}.md` && entry !== "intake.md" && dir.endsWith("roles")) return readFileSync(p, "utf8");
    }
  }
  return null;
}

/** Pre-check brief: the role's own, then its family's (site-plan to site), then the general one. */
function preCheckRole(cfg: WorkConfig, role: string): string {
  const family = role.split("-")[0] ?? role;
  return findRole(cfg, `${role}-pre-check`) ?? findRole(cfg, `${family}-pre-check`) ?? findRole(cfg, "pre-check") ?? "";
}

function jobIntakeGuides(cfg: WorkConfig): string[] {
  const out: string[] = [];
  const base = join(cfg.root, "packs");
  for (const mode of existsSync(base) ? readdirSync(base) : []) {
    const modeDir = join(base, mode);
    if (!statSync(modeDir).isDirectory()) continue;
    for (const job of readdirSync(modeDir)) {
      const p = join(modeDir, job, "roles", "intake.md");
      if (existsSync(p)) out.push(`## Job guidance: ${mode}/${job}\n\n${readFileSync(p, "utf8")}`);
    }
  }
  return out;
}

const RULES = `## Rules

- Read every file under inputs/. Write every deliverable into out/. Never edit inputs/.
- Every engineering number comes from a tool or code you run, never typed from memory.
- Cite every outside fact with its source and the date you retrieved it.
- You cannot approve, accept or release anything. A person does that.
`;

type Input = { name: string; content_base64: string };
const file = (name: string, content: string | Buffer): Input => ({
  name,
  content_base64: Buffer.from(content).toString("base64"),
});

async function attachmentsFor(c: Tx, captureId: string | null): Promise<Input[]> {
  if (!captureId) return [];
  const r = await c.query<{ name: string; bytes: Buffer }>("select name, bytes from attachments where capture_id = $1", [captureId]);
  return r.rows.map((a) => file(`attachments/${a.name}`, a.bytes));
}

/** Test runtime only: scripted agents for end-to-end tests, honored only for the fake runtime. */
function fakeScript(run: Json, runtime: string): Input[] {
  const dir = process.env.CONTROLROD_FAKE_SCRIPTS;
  if (runtime !== "fake" || !dir) return [];
  const p = join(dir, `${run.role}.sh`);
  return existsSync(p) ? [file("FAKE.sh", readFileSync(p))] : [];
}

const withoutNetwork = (tools: string) =>
  tools
    .split("\n")
    .filter((l) => !/^\s*network\s*:/i.test(l))
    .join("\n");

async function buildJob(c: Tx, cfg: WorkConfig, run: Json, runtime: string) {
  const inputs: Input[] = fakeScript(run, runtime);
  const header = `# Control Rod brief\n\nRole: ${run.role} · Package ${run.package_id} revision ${run.package_revision} · Round ${run.round}\n`;
  if (run.role === "intake") {
    const cap = await c.query<{ body: Json }>("select body from captures where id = $1", [run.package_id]);
    const capture = cap.rows[0]?.body;
    const brief = [
      header,
      findRole(cfg, "intake") ?? "",
      ...jobIntakeGuides(cfg),
      `## The request\n\n${capture?.text ?? ""}\n`,
      RULES,
    ].join("\n");
    inputs.push(file("BRIEF.md", brief), file("TOOLS.txt", "Read\nWrite\nGlob\nGrep\nWebSearch\nWebFetch\nBash(cr-site:*)\n"));
    inputs.push(...(await attachmentsFor(c, run.package_id)));
    return { run, capture, inputs };
  }
  const pkg = await currentPackage(c, run.package_id);
  if (!pkg) throw new Error("package vanished");
  const role: string = pkg.body.agent_assignment?.[0]?.role ?? "general-author";
  const { deps } = await dependenciesReady(c, pkg.body);
  for (const dep of deps) {
    const dp = await currentPackage(c, dep);
    const ar = dp ? await latestAuthorRun(c, dep, dp.revision) : null;
    for (const o of ar ? await outputsOf(c, ar.id) : []) inputs.push(file(`deps/${dep}/${o.name}`, o.bytes));
  }
  inputs.push(...(await attachmentsFor(c, pkg.capture_id)));
  inputs.push(file("PACKAGE.json", JSON.stringify({ ...pkg.body, status: pkg.status }, null, 2)));
  const roleText =
    run.role === "pre-check"
      ? preCheckRole(cfg, role)
      : (findRole(cfg, role) ?? findRole(cfg, "general-author") ?? "");
  const extra: string[] = [];
  let findings: Json[] | undefined;
  if (run.role === "pre-check") {
    const author = await latestAuthorRun(c, pkg.id, pkg.revision);
    for (const o of author ? await outputsOf(c, author.id) : []) inputs.push(file(`deliverables/${o.name}`, o.bytes));
  } else {
    if (run.round > 1) {
      const prevVer = await latestVerification(c, pkg.id, pkg.revision, run.round - 1);
      findings = prevVer?.body.findings ?? [];
      extra.push(`## Findings to fix from the pre-check\n\n${JSON.stringify(findings, null, 2)}\n`);
      const prev = await c.query<{ id: string }>(
        "select id from runs where package_id = $1 and package_revision = $2 and role = 'author' and round = $3",
        [pkg.id, pkg.revision, run.round - 1],
      );
      for (const o of prev.rows[0] ? await outputsOf(c, prev.rows[0].id) : []) inputs.push(file(`previous/${o.name}`, o.bytes));
    }
    const ret = await c.query<{ body: Json }>(
      "select body from decisions where package_id = $1 and kind = 'return' order by created_at desc limit 1",
      [pkg.id],
    );
    if (ret.rows[0] && pkg.revision > 0) extra.push(`## Direction from the owner\n\n${ret.rows[0].body.reason ?? ""}\n`);
  }
  const brief = [header, roleText, `## The work package\n\nSee inputs/PACKAGE.json. Objective: ${pkg.body.objective}\n`, ...extra, RULES].join("\n");
  inputs.push(file("BRIEF.md", brief));
  const tools = findRole(cfg, `${role}.tools`) ?? "Read\nWrite\nEdit\nGlob\nGrep\nWebSearch\nWebFetch\nBash(cr-site:*)\nBash(python3:*)\n";
  // "network: on" asks the daemon for network inside a runtime sandbox. Only the role's own author
  // runs get it; a pre-check works from the deliverables alone.
  inputs.push(file("TOOLS.txt", run.role === "pre-check" ? withoutNetwork(tools) : tools));
  return { run, package: { ...pkg.body, status: pkg.status }, inputs, ...(findings ? { findings } : {}) };
}

/** The daemon asks for work. Only runs whose package is ready are handed out. */
export async function claim(db: Db, cfg: WorkConfig, runtimes: string[]) {
  return tx(db, async (c) => {
    const queued = await c.query<{ id: string; role: string; package_id: string; package_revision: number; round: number; body: Json }>(
      "select * from runs where status = 'queued' order by created_at for update skip locked limit 50",
    );
    for (const row of queued.rows) {
      let authorRuntime: string | undefined;
      if (row.role !== "intake") {
        const pkg = await currentPackage(c, row.package_id, true);
        if (!pkg || pkg.revision !== row.package_revision) {
          await c.query("update runs set status = 'stopped' where id = $1", [row.id]);
          continue;
        }
        if (row.role === "author") {
          if (pkg.status === "released") {
            if (!(await dependenciesReady(c, pkg.body)).ready) continue;
          } else if (pkg.status !== "in-work") continue;
        }
        if (row.role === "pre-check") {
          if (pkg.status !== "in-verification") continue;
          const a = await latestAuthorRun(c, pkg.id, pkg.revision);
          authorRuntime = a?.body.runtime?.provider;
        }
        const runtime = pickRuntime(row.role, runtimes, authorRuntime);
        if (!runtime) continue;
        const baseline = `${row.role === "pre-check" ? "checker" : "author"}-${runtime}`;
        if (row.role === "author" && pkg.status === "released") {
          const next = kernel(
            decide({ status: pkg.status, action: "claim", actor_kind: "agent", actor_id: baseline }),
            "claim",
          );
          await c.query("update packages set status = $3, updated_at = now() where id = $1 and revision = $2", [pkg.id, pkg.revision, next]);
          await appendEvent(c, "package.claimed", pkg.id, { kind: "agent", id: baseline }, { revision: pkg.revision, status: next });
        }
        return startRun(c, cfg, row, runtime, baseline);
      }
      const runtime = pickRuntime("intake", runtimes);
      if (!runtime) continue;
      return startRun(c, cfg, row, runtime, `intake-${runtime}`);
    }
    return null;
  });
}

async function startRun(c: Tx, cfg: WorkConfig, row: Json, runtime: string, baseline: string) {
  const body = {
    ...row.body,
    agent_baseline: baseline,
    runtime: runtimeRef(runtime),
    status: "running",
    started_at: now(),
    label: "Starting",
  };
  validate(cfg, "Run.json", body);
  await c.query("update runs set status = 'running', body = $2 where id = $1", [row.id, body]);
  await appendEvent(c, "run.started", row.id, { kind: "agent", id: baseline }, { package: row.package_id, role: row.role, round: row.round });
  return buildJob(c, cfg, body, runtime);
}

const LABEL_MAX = 120;

export async function runLog(db: Db, runId: string, lines: string[], label?: string) {
  await tx(db, async (c) => {
    const r = await c.query<{ body: Json; status: string }>("select body, status from runs where id = $1 for update", [runId]);
    const row = r.rows[0];
    if (!row) throw new Refusal(404, "not-found", "No such run");
    if (row.status !== "running") throw new Refusal(409, "wrong-state", "Run is not running");
    const body = label ? { ...row.body, label: label.slice(0, LABEL_MAX) } : row.body;
    await c.query("update runs set log = log || $2::text[], body = $3 where id = $1", [runId, lines.slice(0, 500).map((l) => l.slice(0, 4000)), body]);
    if (label && label !== row.body.label) {
      await appendEvent(c, "run.label", runId, { kind: "agent", id: row.body.agent_baseline }, { label: body.label, package: row.body.package_id });
    }
  });
}

export async function runLogLines(db: Db, packageId: string, runId: string) {
  const r = await db.query<{ log: string[] }>("select log from runs where id = $1 and package_id = $2", [runId, packageId]);
  if (!r.rows[0]) throw new Refusal(404, "not-found", "No such run");
  return r.rows[0].log;
}

const SAFE_OUTPUT = /^[A-Za-z0-9._-][A-Za-z0-9._/ ()-]{0,200}$/;

/**
 * A run asked for one model and the runtime said it used another. A dated variant of the
 * requested name counts as the same model. "default" asks for nothing, so nothing can differ.
 */
export function modelMismatch(trace: Json): { requested: string; reported: string } | null {
  const requested = String(trace?.requested_model ?? "");
  const reported = String(trace?.reported_model ?? "");
  if (!requested || requested === "default" || !reported) return null;
  return reported === requested || reported.startsWith(`${requested}-`) ? null : { requested, reported };
}

/** A run finished. The server keeps its own digests of every output and asks the kernel to move the package. */
export async function complete(db: Db, cfg: WorkConfig, runId: string, body: Json) {
  return tx(db, async (c) => {
    const r = await c.query<{ body: Json; status: string; role: string; package_id: string; package_revision: number; round: number }>(
      "select * from runs where id = $1 for update",
      [runId],
    );
    const row = r.rows[0];
    if (!row) throw new Refusal(404, "not-found", "No such run");
    if (row.status !== "running") throw new Refusal(409, "wrong-state", "Run is not running");
    const agent: Actor = { kind: "agent", id: row.body.agent_baseline };
    const outputs: { name: string; bytes: Buffer }[] = [];
    for (const o of body.outputs ?? []) {
      if (typeof o.name !== "string" || !SAFE_OUTPUT.test(o.name) || o.name.includes("..")) {
        throw new Refusal(400, "invalid", `bad output name ${String(o.name)}`);
      }
      outputs.push({ name: o.name, bytes: Buffer.from(String(o.content_base64 ?? ""), "base64") });
    }
    const finished = { ...row.body, status: body.status === "succeeded" ? "succeeded" : "failed", finished_at: now(), label: "Done" };
    if (body.error) finished.error = String(body.error).slice(0, 2000);
    if (body.trace) finished.trace = body.trace;
    try {
      validate(cfg, "Run.json", finished);
    } catch {
      delete finished.trace;
      validate(cfg, "Run.json", finished);
    }
    await c.query("update runs set status = $2, body = $3 where id = $1", [runId, finished.status, finished]);
    for (const o of outputs) {
      await c.query(
        "insert into outputs (run_id, package_id, package_revision, name, sha256, bytes) values ($1, $2, $3, $4, $5, $6)",
        [runId, row.package_id, row.package_revision, o.name, sha256(o.bytes), o.bytes],
      );
    }
    await appendEvent(c, `run.${finished.status}`, runId, agent, {
      package: row.package_id,
      role: row.role,
      round: row.round,
      outputs: outputs.map((o) => ({ name: o.name, sha256: sha256(o.bytes) })),
    });
    const mismatch = modelMismatch(finished.trace);
    if (mismatch) await appendEvent(c, "run.model-mismatch", runId, SYSTEM, { package: row.package_id, ...mismatch });
    if (finished.status !== "succeeded") return;
    if (row.role === "intake") return finishIntake(c, cfg, row, outputs, body, agent);
    if (row.role === "author") return finishAuthor(c, cfg, row, agent);
    return finishPreCheck(c, cfg, row, body, outputs, agent);
  });
}

async function finishIntake(c: Tx, cfg: WorkConfig, row: Json, outputs: { name: string; bytes: Buffer }[], body: Json, agent: Actor) {
  const capRes = await c.query<{ body: Json }>("select body from captures where id = $1 for update", [row.package_id]);
  const capture = capRes.rows[0]?.body;
  if (!capture) return;
  const answer = outputs.find((o) => o.name === "answer.md");
  const drafts: Json[] = [];
  for (const o of outputs) {
    if (o.name === "package.json" || /^packages\/[^/]+\.json$/.test(o.name)) {
      try {
        drafts.push(JSON.parse(o.bytes.toString("utf8")));
      } catch {
        /* an unparseable draft is reported below */
      }
    }
  }
  if (body.package) drafts.push(body.package);
  if (drafts.length === 0) {
    if (!answer) throw new Refusal(400, "invalid", "Intake produced neither an answer nor a package");
    const updated = { ...capture, disposition: "answered", answer: answer.bytes.toString("utf8").slice(0, 20000) };
    validate(cfg, "Capture.json", updated);
    await c.query("update captures set body = $2 where id = $1", [capture.id, updated]);
    await appendEvent(c, "capture.answered", capture.id, agent);
    return;
  }
  const prefix = capture.id.slice(2, 6).toUpperCase();
  const idMap = new Map<string, string>();
  for (const d of drafts) idMap.set(String(d.id), `${prefix}-${String(d.id).replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)}`);
  const created: string[] = [];
  for (const d of drafts) {
    const pkg = {
      ...d,
      schema_version: "0.1.0",
      id: idMap.get(String(d.id)),
      revision: 0,
      status: "draft",
      design_inputs: (d.design_inputs ?? []).map((x: Json) => (idMap.has(x.doc) ? { ...x, doc: idMap.get(x.doc) } : x)),
      agent_assignment: [{ role: String(d.agent_assignment?.[0]?.role ?? "general-author").slice(0, 60), agent_baseline: "author", baseline_revision: 0 }],
      verification: {
        method: "agent-pre-check",
        verifier: "checker",
        verifier_receives: ["deliverables", "acceptance criteria", "design inputs"],
        required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
      },
    };
    validate(cfg, "WorkPackage.json", pkg);
    await c.query("insert into packages (id, revision, status, capture_id, body) values ($1, 0, 'draft', $2, $3)", [pkg.id, capture.id, pkg]);
    await appendEvent(c, "package.drafted", pkg.id, agent, { capture: capture.id });
    created.push(pkg.id as string);
  }
  const updated = { ...capture, disposition: "package", package_id: created[0] };
  validate(cfg, "Capture.json", updated);
  await c.query("update captures set body = $2 where id = $1", [capture.id, updated]);
}

async function finishAuthor(c: Tx, cfg: WorkConfig, row: Json, agent: Actor) {
  const pkg = await currentPackage(c, row.package_id, true);
  if (!pkg || pkg.revision !== row.package_revision) return;
  const next = kernel(decide({ status: pkg.status, action: "submit-output", actor_kind: "agent", actor_id: agent.id }), "submit output");
  await c.query("update packages set status = $3, updated_at = now() where id = $1 and revision = $2", [pkg.id, pkg.revision, next]);
  await appendEvent(c, "package.output", pkg.id, agent, { revision: pkg.revision, round: row.round, status: next });
  await queueRun(c, cfg, pkg.id, pkg.revision, "pre-check", row.round);
}

async function finishPreCheck(c: Tx, cfg: WorkConfig, row: Json, body: Json, outputs: { name: string; bytes: Buffer }[], agent: Actor) {
  const pkg = await currentPackage(c, row.package_id, true);
  if (!pkg || pkg.revision !== row.package_revision) return;
  const author = await latestAuthorRun(c, pkg.id, pkg.revision);
  let raw = body.verification;
  if (!raw) {
    const f = outputs.find((o) => o.name === "verification.json");
    if (f) raw = JSON.parse(f.bytes.toString("utf8"));
  }
  if (!raw || !["pass", "fail", "inconclusive"].includes(raw.outcome)) {
    throw new Refusal(400, "invalid", "Pre-check produced no outcome");
  }
  const authorOutputs = author ? await outputsOf(c, author.id) : [];
  const sharedRuntime = author?.body.runtime?.provider === row.body.runtime?.provider;
  const record = {
    schema_version: "0.1.0",
    package_id: pkg.id,
    package_revision: pkg.revision,
    output: {
      path: authorOutputs.map((o) => o.name).join(", ") || "(none)",
      digest: { algorithm: "sha256", value: digest(authorOutputs.map((o) => ({ name: o.name, sha256: o.sha256 }))) },
    },
    method: "agent-pre-check",
    verifier: agent.id,
    evidence: [
      {
        claim: "Deliverables checked against the acceptance criteria",
        status: raw.outcome === "pass" ? "pass" : "open",
        custody: {
          generated_by: agent.id,
          selected_by: agent.id,
          presented_by: "control-plane",
          coupling: {
            actor: "independent",
            context: "independent",
            mechanism: sharedRuntime ? "shared" : "independent",
            authority: "independent",
            resource: "shared",
          },
        },
      },
    ],
    findings: (Array.isArray(raw.findings) ? raw.findings : []).slice(0, 200).map((f: Json, i: number) => ({
      id: String(f.id ?? `F-${String(i + 1).padStart(3, "0")}`).slice(0, 20),
      severity: ["info", "minor", "major", "critical"].includes(f.severity) ? f.severity : "major",
      text: String(f.text ?? "").slice(0, 4000) || "(no text)",
    })),
    outcome: raw.outcome,
  };
  validate(cfg, "VerificationRecord.json", record);
  kernel(
    decide({
      status: pkg.status,
      action: "submit-pre-check",
      actor_kind: "agent",
      actor_id: agent.id,
      author_baseline: author?.body.agent_baseline,
      checker_baseline: agent.id,
    }),
    "pre-check",
  );
  await c.query(
    "insert into verifications (run_id, package_id, package_revision, round, body) values ($1, $2, $3, $4, $5)",
    [row.id, pkg.id, pkg.revision, row.round, record],
  );
  await appendEvent(c, "package.pre-checked", pkg.id, agent, {
    revision: pkg.revision,
    round: row.round,
    outcome: record.outcome,
    findings: record.findings.length,
    shared_runtime: sharedRuntime,
  });
  if (record.outcome !== "pass" && row.round < MAX_ROUNDS) {
    const next = kernel(
      decide({ status: pkg.status, action: "revise", actor_kind: "agent", actor_id: author?.body.agent_baseline ?? "author", pre_check: record.outcome }),
      "revise",
    );
    await c.query("update packages set status = $3, updated_at = now() where id = $1 and revision = $2", [pkg.id, pkg.revision, next]);
    await appendEvent(c, "package.revising", pkg.id, agent, { revision: pkg.revision, round: row.round + 1 });
    await queueRun(c, cfg, pkg.id, pkg.revision, "author", row.round + 1);
  }
}

/* ---------- decisions ---------- */

const HUMAN_ACTIONS: Record<string, Action> = {
  release: "release",
  accept: "accept",
  "accept-with-findings": "accept-with-findings",
  return: "return",
  reject: "reject",
};

export function decisionChallenge(subjectDigest: string, kind: string, revision: number, nonce: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`${subjectDigest}|${kind}|${revision}|${nonce}`).digest());
}

export async function decisionSubject(db: Db, id: string, kind: string, revision: number) {
  if (!(kind in HUMAN_ACTIONS)) throw new Refusal(400, "invalid", "Unknown decision");
  const pkg = await currentPackage(db, id);
  if (!pkg) throw new Refusal(404, "not-found", "No such package");
  if (pkg.revision !== revision) throw new Refusal(409, "stale", "That revision is no longer current");
  return { pkg, ...(await subjectOf(db, pkg)) };
}

/** Applies a person's decision. The assertion was verified by the caller against the stored challenge. */
export async function applyDecision(
  db: Db,
  cfg: WorkConfig,
  user: string,
  id: string,
  req: { kind: string; package_revision: number; reason?: string },
  signed: { subject_digest: string; assertion: Json } | null,
) {
  return tx(db, async (c) => {
    const pkg = await currentPackage(c, id, true);
    if (!pkg) throw new Refusal(404, "not-found", "No such package");
    if (pkg.revision !== req.package_revision) throw new Refusal(409, "stale", "That revision is no longer current");
    const s = await subjectOf(c, pkg);
    const reason = (req.reason ?? "").trim();
    const outcome = decide({
      status: pkg.status,
      action: HUMAN_ACTIONS[req.kind] ?? "reject",
      actor_kind: "human",
      actor_id: user,
      author_baseline: s.author?.body.agent_baseline,
      pre_check: s.verification?.outcome,
      assertion_verified: signed !== null,
      digest_matches: signed !== null && signed.subject_digest === s.digest,
      reason_given: reason.length > 0,
    });
    const next = kernel(outcome, req.kind);
    const decision = {
      schema_version: "0.1.0",
      id: `D-${randomUUID().slice(0, 8)}`,
      package_id: pkg.id,
      package_revision: pkg.revision,
      kind: req.kind,
      actor: { kind: "human", id: user },
      subject_digest: { algorithm: "sha256", value: s.digest },
      ...(reason ? { reason: reason.slice(0, 4000) } : {}),
      assertion: {
        credential_id: String(signed?.assertion.id ?? ""),
        authenticator_data: String(signed?.assertion.response?.authenticatorData ?? ""),
        client_data_json: String(signed?.assertion.response?.clientDataJSON ?? ""),
        signature: String(signed?.assertion.response?.signature ?? ""),
      },
      decided_at: now(),
    };
    validate(cfg, "Decision.json", decision);
    await c.query("insert into decisions (id, package_id, package_revision, kind, body) values ($1, $2, $3, $4, $5)", [
      decision.id,
      pkg.id,
      pkg.revision,
      req.kind,
      decision,
    ]);
    const human: Actor = { kind: "human", id: user };
    if (req.kind === "return") {
      await c.query("update packages set status = 'closed', updated_at = now() where id = $1 and revision = $2", [pkg.id, pkg.revision]);
      const body = { ...pkg.body, revision: pkg.revision + 1, status: "draft" };
      validate(cfg, "WorkPackage.json", body);
      await c.query("insert into packages (id, revision, status, capture_id, body) values ($1, $2, 'draft', $3, $4)", [
        pkg.id,
        pkg.revision + 1,
        pkg.capture_id,
        body,
      ]);
      await c.query("update runs set status = 'stopped' where package_id = $1 and package_revision = $2 and status = 'queued'", [pkg.id, pkg.revision]);
    } else {
      await c.query("update packages set status = $3, updated_at = now() where id = $1 and revision = $2", [pkg.id, pkg.revision, next]);
      if (req.kind === "release") await queueRun(c, cfg, pkg.id, pkg.revision, "author", 1);
      if (req.kind === "reject") {
        await c.query("update runs set status = 'stopped' where package_id = $1 and status = 'queued'", [pkg.id]);
      }
    }
    await appendEvent(c, `decision.${req.kind}`, pkg.id, human, {
      revision: pkg.revision,
      decision: decision.id,
      subject_digest: s.digest,
      status: req.kind === "return" ? "draft" : next,
    });
    return decision;
  });
}

/* ---------- office and metrics ---------- */

export async function office(db: Db) {
  const items: Json[] = [];
  const pk = await db.query<PackageRow>("select distinct on (id) * from packages order by id, revision desc");
  for (const p of pk.rows) {
    const title = String(p.body.title ?? p.id);
    const since = new Date(p.updated_at).toISOString();
    if (p.status === "draft") {
      items.push({ kind: "release", package_id: p.id, package_revision: p.revision, title, detail: "Draft ready to review and release", since });
      continue;
    }
    if (p.status === "in-verification") {
      const author = await latestAuthorRun(db, p.id, p.revision);
      const ver = author ? await latestVerification(db, p.id, p.revision, author.round) : null;
      if (!ver) continue;
      if (ver.body.outcome === "pass") {
        items.push({ kind: "accept", package_id: p.id, package_revision: p.revision, title, detail: "Pre-check passed. Review and accept.", since: ver.created_at.toISOString() });
      } else if (author && author.round >= MAX_ROUNDS) {
        items.push({
          kind: "dispute",
          package_id: p.id,
          package_revision: p.revision,
          title,
          detail: `Pre-check ${ver.body.outcome} after ${author.round} rounds with ${ver.body.findings.length} findings`,
          since: ver.created_at.toISOString(),
        });
      }
    }
    if (p.status === "in-work" || p.status === "in-verification") {
      const failed = await db.query<{ body: Json }>(
        "select body from runs where package_id = $1 and package_revision = $2 and status = 'failed' order by created_at desc limit 1",
        [p.id, p.revision],
      );
      const latest = await db.query<{ status: string }>(
        "select status from runs where package_id = $1 and package_revision = $2 order by created_at desc limit 1",
        [p.id, p.revision],
      );
      if (failed.rows[0] && latest.rows[0]?.status === "failed") {
        items.push({
          kind: "dispute",
          package_id: p.id,
          package_revision: p.revision,
          title,
          detail: `Run failed: ${String(failed.rows[0].body.error ?? "no detail").slice(0, 200)}`,
          since: String(failed.rows[0].body.finished_at ?? new Date().toISOString()),
        });
      }
    }
  }
  const rank: Record<string, number> = { dispute: 0, accept: 1, release: 2, permission: 3 };
  return items.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.since.localeCompare(b.since));
}

const median = (xs: number[]) => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  const hi = s[m] ?? 0;
  const lo = s[m - 1] ?? hi;
  return (s.length % 2 ? hi : (lo + hi) / 2).toFixed(1);
};

export async function metrics(db: Db) {
  const accepted = await db.query<{ id: string; revision: number; capture_id: string | null; decided: Date }>(
    `select p.id, p.revision, p.capture_id, d.created_at as decided from packages p
     join decisions d on d.package_id = p.id and d.package_revision = p.revision and d.kind in ('accept', 'accept-with-findings')
     where p.status = 'accepted'`,
  );
  let firstPass = 0;
  let caught = 0;
  const review: number[] = [];
  const done: number[] = [];
  for (const a of accepted.rows) {
    const vers = await db.query<{ body: Json; created_at: Date }>(
      "select body, created_at from verifications where package_id = $1 and package_revision = $2 order by round",
      [a.id, a.revision],
    );
    if (a.revision === 0 && vers.rows.length === 1 && vers.rows[0]?.body.outcome === "pass") firstPass++;
    for (const v of vers.rows.slice(0, -1)) caught += v.body.findings.length;
    const last = vers.rows.at(-1);
    if (last) review.push((a.decided.getTime() - last.created_at.getTime()) / 60000);
    if (a.capture_id) {
      const cap = await db.query<{ created_at: Date }>("select created_at from captures where id = $1", [a.capture_id]);
      if (cap.rows[0]) done.push((a.decided.getTime() - cap.rows[0].created_at.getTime()) / 60000);
    }
  }
  const answered = await db.query<{ n: string }>("select count(*) as n from captures where body->>'disposition' = 'answered'");
  const out: Json = {
    packages_accepted: accepted.rows.length,
    first_pass_accepted: firstPass,
    findings_caught_before_review: caught,
    quick_answers: Number(answered.rows[0]?.n ?? 0),
  };
  const mr = median(review);
  const md = median(done);
  if (mr !== undefined) out.median_review_minutes = mr;
  if (md !== undefined) out.median_minutes_to_done = md;
  return out;
}

export async function activeRuns(db: Db) {
  const r = await db.query<{ body: Json; status: string }>(
    "select body, status from runs where status in ('queued', 'running') order by created_at limit 200",
  );
  return r.rows.map((x) => ({ ...x.body, status: x.status }));
}

export async function listCaptures(db: Db) {
  const r = await db.query<{ body: Json }>("select body from captures order by created_at desc limit 200");
  return r.rows.map((x) => x.body);
}
