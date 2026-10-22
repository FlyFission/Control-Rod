import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Ajv2020 } from "ajv/dist/2020.js";
import { type Db, type Tx, tx } from "./db/index.js";
import { type Actor, appendEvent } from "./events.js";
import { type Action, type KernelOutcome, type RuntimeIdentity, type Status, decide, digest } from "./kernel.js";

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
  /** Seconds a claim lasts without a heartbeat before the sweep marks the run lost. */
  leaseSeconds?: number;
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
  const r = await db.query<{ bytes: Buffer; sha256: string }>("select bytes, sha256 from outputs where run_id = $1 and name = $2", [
    author.id,
    name,
  ]);
  const row = r.rows[0];
  if (!row) throw new Refusal(404, "not-found", "No such output");
  // Bytes are re-hashed on every read. A stored file that no longer matches its recorded digest
  // is never served; the mismatch goes on the record.
  const actual = sha256(row.bytes);
  if (actual !== row.sha256) {
    await tx(db, (c) =>
      appendEvent(c, "output.mismatch", pkg.id, SYSTEM, { revision: pkg.revision, run: author.id, name, recorded: row.sha256, actual }),
    );
    throw new Refusal(409, "output-changed", "This output changed since it was recorded, so it is not served. The mismatch is on the record.");
  }
  return row.bytes;
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

async function queueRun(c: Tx, cfg: WorkConfig, packageId: string, revision: number, role: string, round: number, requeueOf?: string) {
  const run: Json = {
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
    ...(requeueOf ? { requeue_of: requeueOf } : {}),
  };
  validate(cfg, "Run.json", run);
  const ins = await c.query(
    `insert into runs (id, package_id, package_revision, role, round, status, body) values ($1, $2, $3, $4, $5, 'queued', $6)
     on conflict (package_id, package_revision, role, round) where status in ('queued', 'running') do nothing`,
    [run.id, packageId, revision, role, round, run],
  );
  if (ins.rowCount === 0) {
    // A live run for this assignment already exists: hand that one back, never a second.
    const live = await c.query<{ body: Json; status: string }>(
      "select body, status from runs where package_id = $1 and package_revision = $2 and role = $3 and round = $4 and status in ('queued', 'running')",
      [packageId, revision, role, round],
    );
    const existing = live.rows[0];
    if (!existing) throw new Error("live run vanished");
    return { ...existing.body, status: existing.status };
  }
  await appendEvent(c, "run.queued", run.id, SYSTEM, { package: packageId, role, round });
  return run;
}

/** Runtime name for a provider, as the daemon names them. */
function runtimeName(provider: unknown): string {
  const p = String(provider ?? "").toLowerCase();
  if (p === "anthropic" || p === "claude" || p === "claude-code") return "claude";
  if (p === "openai" || p === "codex") return "codex";
  return p;
}

/** Picks the runtime an author or intake run should use from what the daemon has. */
function pickRuntime(have: string[]): string | null {
  return ["claude", "codex", "fake"].find((r) => have.includes(r)) ?? null;
}

/**
 * Picks the runtime for a pre-check: never the author's, unless the owner recorded an override.
 * Nothing falls back to the author's runtime on its own.
 */
function pickChecker(have: string[], authorRuntime: string, override: boolean): string | null {
  const other = ["codex", "claude", "fake"].find((r) => have.includes(r) && r !== authorRuntime);
  if (other) return other;
  return override && have.includes(authorRuntime) ? authorRuntime : null;
}

export const WAITING_FOR_INDEPENDENT_RUNTIME =
  "Waiting for an independent runtime: install Codex, or proceed with a recorded owner override.";

/** Provider and model that ran a run: the model the runtime reported, else the one asked for. */
function identityOf(run: Json, trace?: Json): RuntimeIdentity {
  return {
    provider: runtimeName(run?.runtime?.provider),
    model: String(trace?.reported_model || run?.runtime?.model || "default"),
  };
}

/** Same rule as the kernel's: the same provider is the same runtime, whatever the models. For the record only. */
function mayBeSameRuntime(a: RuntimeIdentity, b: RuntimeIdentity): boolean {
  return a.provider.trim().toLowerCase() === b.provider.trim().toLowerCase();
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
 * guidance, never as the role named "intake". Returns the brief and the pack it came from.
 */
function findRoleIn(cfg: WorkConfig, name: string): { text: string; packDir: string } | null {
  const safe = name.replace(/[^a-z0-9.-]/gi, "");
  const general = join(cfg.root, "packs", "general", "roles", `${safe}.md`);
  if (existsSync(general)) return { text: readFileSync(general, "utf8"), packDir: join(cfg.root, "packs", "general") };
  const stack = [join(cfg.root, "packs")];
  while (stack.length) {
    const dir = stack.pop() as string;
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir).sort()) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (entry === `${safe}.md` && entry !== "intake.md" && dir.endsWith("roles")) {
        return { text: readFileSync(p, "utf8"), packDir: dirname(dir) };
      }
    }
  }
  return null;
}

function findRole(cfg: WorkConfig, name: string): string | null {
  return findRoleIn(cfg, name)?.text ?? null;
}

/** Pack support files an agent may be told to read, served as inputs/pack/<relative path>. */
const PACK_DIRS = ["templates", "typicals", "examples"];
const PACK_FILE_MAX = 256 * 1024;
const PACK_TOTAL_MAX = 2 * 1024 * 1024;

function packFiles(packDir: string): Input[] {
  const out: Input[] = [];
  let total = 0;
  for (const sub of PACK_DIRS) {
    const stack = [join(packDir, sub)];
    const found: string[] = [];
    while (stack.length) {
      const dir = stack.pop() as string;
      if (!existsSync(dir) || !lstatSync(dir).isDirectory()) continue;
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = lstatSync(p);
        if (st.isDirectory()) stack.push(p);
        else if (st.isFile() && st.size <= PACK_FILE_MAX) found.push(p);
      }
    }
    for (const p of found.sort()) {
      const bytes = readFileSync(p);
      if (total + bytes.length > PACK_TOTAL_MAX) return out;
      total += bytes.length;
      out.push(file(`pack/${relative(packDir, p).split(sep).join("/")}`, bytes));
    }
  }
  return out;
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
    inputs.push(file("BRIEF.md", brief), file("TOOLS.txt", "Read\nWrite\nGlob\nGrep\nWebSearch\nWebFetch\nBash(cr-example:*)\n"));
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
  const own = findRoleIn(cfg, role) ?? findRoleIn(cfg, "general-author");
  // The role's own pack ships its templates, typicals and examples to author and pre-check alike.
  if (own) inputs.push(...packFiles(own.packDir));
  const roleText = run.role === "pre-check" ? preCheckRole(cfg, role) : (own?.text ?? "");
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
  const tools = findRole(cfg, `${role}.tools`) ?? "Read\nWrite\nEdit\nGlob\nGrep\nWebSearch\nWebFetch\nBash(cr-example:*)\nBash(python3:*)\n";
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
        let runtime: string | null;
        if (row.role === "pre-check") {
          if (pkg.status !== "in-verification") continue;
          const a = await latestAuthorRun(c, pkg.id, pkg.revision);
          const authorRuntime = runtimeName(a?.body.runtime?.provider);
          runtime = pickChecker(runtimes, authorRuntime, verifiedOverride(row.body));
          if (!runtime && runtimes.includes(authorRuntime) && !row.body.waiting_reason) {
            // Held, not skipped silently: say why on the run and in the office, once.
            const held = { ...row.body, waiting_reason: WAITING_FOR_INDEPENDENT_RUNTIME };
            validate(cfg, "Run.json", held);
            await c.query("update runs set body = $2 where id = $1", [row.id, held]);
            await appendEvent(c, "run.waiting", row.id, SYSTEM, { package: pkg.id, role: row.role, reason: held.waiting_reason, author_runtime: authorRuntime });
          }
        } else {
          runtime = pickRuntime(runtimes);
        }
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
      const runtime = pickRuntime(runtimes);
      if (!runtime) continue;
      return startRun(c, cfg, row, runtime, `intake-${runtime}`);
    }
    return null;
  });
}

/* ---------- run custody ---------- */

const DEFAULT_LEASE_SECONDS = 90;
const leaseSeconds = (cfg: WorkConfig) => cfg.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
const heartbeatSeconds = (cfg: WorkConfig) => Math.max(1, Math.floor(leaseSeconds(cfg) / 3));
const leaseFromNow = (cfg: WorkConfig) => new Date(Date.now() + leaseSeconds(cfg) * 1000).toISOString();
const tokenHash = (t: string) => createHash("sha256").update(t).digest();

/** Constant-time check that `token` is the claim token this run was handed. */
function holdsClaim(storedHash: string | null, token: unknown): boolean {
  if (!storedHash || typeof token !== "string" || token.length === 0) return false;
  const want = Buffer.from(storedHash, "hex");
  const got = tokenHash(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

async function startRun(c: Tx, cfg: WorkConfig, row: Json, runtime: string, baseline: string) {
  const token = randomBytes(32).toString("base64url");
  const lease = leaseFromNow(cfg);
  const body = {
    ...row.body,
    agent_baseline: baseline,
    runtime: runtimeRef(runtime),
    status: "running",
    started_at: now(),
    label: "Starting",
    lease_expires_at: lease,
  };
  delete body.waiting_reason;
  validate(cfg, "Run.json", body);
  await c.query("update runs set status = 'running', body = $2, claim_token_hash = $3, lease_expires_at = $4 where id = $1", [
    row.id,
    body,
    tokenHash(token).toString("hex"),
    lease,
  ]);
  await appendEvent(c, "run.started", row.id, { kind: "agent", id: baseline }, { package: row.package_id, role: row.role, round: row.round, lease_expires_at: lease });
  const job = await buildJob(c, cfg, body, runtime);
  return { ...job, claim: { token, lease_expires_at: lease, heartbeat_seconds: heartbeatSeconds(cfg) } };
}

type RunRow = {
  id: string;
  body: Json;
  status: string;
  role: string;
  package_id: string;
  package_revision: number;
  round: number;
  claim_token_hash: string | null;
  completion_key: string | null;
  receipt: Json | null;
};

async function lockRun(c: Tx, runId: string): Promise<RunRow> {
  const r = await c.query<RunRow>("select * from runs where id = $1 for update", [runId]);
  const row = r.rows[0];
  if (!row) throw new Refusal(404, "not-found", "No such run");
  return row;
}

const LABEL_MAX = 120;

/**
 * A log batch from the daemon, which is also its heartbeat: it renews the lease. The reply tells
 * the daemon whether the owner asked to stop the run.
 */
export async function runLog(db: Db, cfg: WorkConfig, runId: string, token: unknown, lines: string[], label?: string) {
  return tx(db, async (c) => {
    const row = await lockRun(c, runId);
    if (!holdsClaim(row.claim_token_hash, token)) throw new Refusal(403, "stale-claim", "This claim token does not hold the run");
    if (row.status !== "running") throw new Refusal(409, "not-running", `The run is ${row.status}`);
    const lease = leaseFromNow(cfg);
    const body = { ...row.body, lease_expires_at: lease, ...(label ? { label: label.slice(0, LABEL_MAX) } : {}) };
    await c.query("update runs set log = log || $2::text[], body = $3, lease_expires_at = $4 where id = $1", [
      runId,
      lines.slice(0, 500).map((l) => l.slice(0, 4000)),
      body,
      lease,
    ]);
    if (label && label !== row.body.label) {
      await appendEvent(c, "run.label", runId, { kind: "agent", id: row.body.agent_baseline }, { label: body.label, package: row.body.package_id });
    }
    return { stop: Boolean(row.body.stop_requested_at), lease_expires_at: lease };
  });
}

/**
 * Retires running runs whose lease lapsed: the daemon died, lost its network or was killed. The
 * run becomes lost, with the reason on the record. Nothing is requeued; the owner decides.
 */
export async function sweepLost(db: Db, cfg: WorkConfig): Promise<string[]> {
  return tx(db, async (c) => {
    const r = await c.query<RunRow>(
      "select * from runs where status = 'running' and lease_expires_at < now() for update skip locked",
    );
    const lost: string[] = [];
    for (const row of r.rows) {
      const body = {
        ...row.body,
        status: "lost",
        finished_at: now(),
        label: "Lost",
        error: `Runner lost: no heartbeat from the daemon after ${String(row.body.lease_expires_at ?? "its lease")}. Nothing was recorded from this run; the owner can requeue it.`,
      };
      delete body.lease_expires_at;
      validate(cfg, "Run.json", body);
      await c.query("update runs set status = 'lost', body = $2 where id = $1", [row.id, body]);
      await appendEvent(c, "run.lost", row.id, SYSTEM, { package: row.package_id, role: row.role, round: row.round });
      lost.push(row.id);
    }
    return lost;
  });
}

/** The owner queues a new run in place of a lost, failed or stopped one. Repeating is harmless. */
export async function requeueRun(db: Db, cfg: WorkConfig, user: string, packageId: string, runId: string) {
  return tx(db, async (c) => {
    const row = await lockRun(c, runId);
    if (row.package_id !== packageId) throw new Refusal(404, "not-found", "No such run");
    if (row.body.requeued_as) {
      const again = await c.query<{ body: Json; status: string }>("select body, status from runs where id = $1", [row.body.requeued_as]);
      if (again.rows[0]) return { ...again.rows[0].body, status: again.rows[0].status };
    }
    if (!["lost", "failed", "stopped"].includes(row.status)) {
      throw new Refusal(409, "not-requeueable", `A ${row.status} run cannot be requeued`);
    }
    if (row.role !== "intake") {
      const pkg = await currentPackage(c, packageId, true);
      const want = row.role === "author" ? ["in-work", "released"] : ["in-verification"];
      if (!pkg || pkg.revision !== row.package_revision || !want.includes(pkg.status)) {
        throw new Refusal(409, "wrong-state", "The package has moved on since this run; there is nothing to requeue");
      }
    }
    const next = await queueRun(c, cfg, row.package_id, row.package_revision, row.role, row.round, runId);
    const old = { ...row.body, status: row.status, requeued_as: next.id };
    validate(cfg, "Run.json", old);
    await c.query("update runs set body = $2 where id = $1", [runId, old]);
    await appendEvent(c, "run.requeued", runId, { kind: "human", id: user }, { package: row.package_id, role: row.role, new_run: next.id });
    return next;
  });
}

/**
 * The owner stops a run. A queued run stops at once. A running run gets the request recorded
 * first; the daemon learns it from its next log reply, ends the process and completes the run
 * as stopped. Until then the run shows as stopping. Repeating is harmless.
 */
export async function stopRun(db: Db, cfg: WorkConfig, user: string, packageId: string, runId: string) {
  return tx(db, async (c) => {
    const row = await lockRun(c, runId);
    if (row.package_id !== packageId) throw new Refusal(404, "not-found", "No such run");
    const human: Actor = { kind: "human", id: user };
    if (row.status === "queued") {
      const body = { ...row.body, status: "stopped", finished_at: now(), error: "Stopped by the owner before it started." };
      validate(cfg, "Run.json", body);
      await c.query("update runs set status = 'stopped', body = $2 where id = $1", [runId, body]);
      await appendEvent(c, "run.stopped", runId, human, { package: row.package_id, role: row.role, round: row.round });
      return body;
    }
    if (row.status !== "running" || row.body.stop_requested_at) return { ...row.body, status: row.status };
    const body = { ...row.body, stop_requested_at: now(), stop_requested_by: user, label: "Stopping" };
    validate(cfg, "Run.json", body);
    await c.query("update runs set body = $2 where id = $1", [runId, body]);
    await appendEvent(c, "run.stop-requested", runId, human, { package: row.package_id, role: row.role, round: row.round });
    return body;
  });
}

/** The run and package an override would apply to, and the digest the owner signs. */
async function overrideTarget(q: Db | Tx, packageId: string, runId: string, reason: string, lock = false) {
  const r = await q.query<RunRow>(`select * from runs where id = $1${lock ? " for update" : ""}`, [runId]);
  const row = r.rows[0];
  if (!row || row.package_id !== packageId) throw new Refusal(404, "not-found", "No such run");
  if (row.role !== "pre-check") throw new Refusal(409, "wrong-state", "Only a pre-check can be overridden");
  const pkg = await currentPackage(q, packageId, lock);
  if (!pkg || pkg.revision !== row.package_revision) throw new Refusal(409, "stale", "That revision is no longer current");
  const subject = { package_id: pkg.id, package_revision: pkg.revision, run_id: row.id, act: "override-independence", reason };
  return { row, pkg, digest: digest(subject) };
}

const overrideReason = (reason: unknown) => {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) throw new Refusal(400, "reason-required", "Say why the pre-check may share the author's runtime");
  return why.slice(0, 2000);
};

/** Step 1 of the override: the digest to sign. Refused for anything but a held pre-check. */
export async function overrideSubject(db: Db, packageId: string, runId: string, reason: unknown) {
  const why = overrideReason(reason);
  const t = await overrideTarget(db, packageId, runId, why);
  if (t.row.status !== "queued" || t.pkg.status !== "in-verification") throw new Refusal(409, "wrong-state", `The pre-check is ${t.row.status}`);
  return { digest: t.digest, revision: t.pkg.revision, reason: why };
}

export function overrideChallenge(subjectDigest: string, revision: number, runId: string, nonce: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`${subjectDigest}|override-independence|${revision}|${runId}|${nonce}`).digest());
}

/**
 * Step 2: the owner lets a held pre-check run on the author's provider. The kernel allows it only
 * as a signed human act with a reason, bound to the digest. Recorded with the assertion as an
 * event and on the run; the verification record carries it. Repeating changes nothing.
 */
export async function overrideIndependence(
  db: Db,
  cfg: WorkConfig,
  user: string,
  packageId: string,
  runId: string,
  reason: unknown,
  signed: { subject_digest: string; assertion: Json } | null,
) {
  const why = overrideReason(reason);
  return tx(db, async (c) => {
    const { row, pkg, digest: d } = await overrideTarget(c, packageId, runId, why, true);
    kernel(
      decide({
        status: pkg.status,
        action: "override-independence",
        actor_kind: "human",
        actor_id: user,
        assertion_verified: signed !== null,
        digest_matches: signed !== null && signed.subject_digest === d,
        reason_given: true,
      }),
      "override",
    );
    if (row.body.independence_override) return { ...row.body, status: row.status };
    if (row.status !== "queued") throw new Refusal(409, "wrong-state", `The pre-check is ${row.status}`);
    const a = signed?.assertion ?? {};
    const assertion = {
      credential_id: String(a.id ?? ""),
      authenticator_data: String(a.response?.authenticatorData ?? ""),
      client_data_json: String(a.response?.clientDataJSON ?? ""),
      signature: String(a.response?.signature ?? ""),
    };
    const override = { by: user, at: now(), reason: why, subject_digest: { algorithm: "sha256", value: d }, assertion };
    const body = { ...row.body, independence_override: override };
    delete body.waiting_reason;
    validate(cfg, "Run.json", body);
    await c.query("update runs set body = $2 where id = $1", [runId, body]);
    await appendEvent(c, "run.independence-override", runId, { kind: "human", id: user }, {
      package: row.package_id,
      revision: pkg.revision,
      reason: why,
      subject_digest: d,
      assertion,
    });
    return { ...body, status: row.status };
  });
}

/** An override counts only when it was stored after a verified passkey assertion. */
const verifiedOverride = (run: Json) => Boolean(run?.independence_override?.assertion?.signature && run.independence_override.subject_digest);

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

/** A refusal raised while applying a completion; the run is then recorded failed with its reason. */
class ApplyRefusal extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.message);
  }
}

/** A completion for a run whose lease already lapsed. */
class LateCompletion extends Error {}

type Output = { name: string; bytes: Buffer };

function receiptOf(runId: string, key: string, status: string, outputs: Output[], refusal?: Refusal) {
  return {
    run_id: runId,
    idempotency_key: key,
    status,
    outputs: outputs.map((o) => ({ path: o.name, digest: { algorithm: "sha256", value: sha256(o.bytes) } })),
    received_at: now(),
    ...(refusal ? { refusal: { code: refusal.code, message: refusal.message } } : {}),
  };
}

/**
 * A run finished. The completion must carry the run's claim token and an idempotency key; a
 * repeat with the same key returns the stored receipt. The server keeps its own digests of every
 * output and asks the kernel to move the package. If applying the completion is refused, the run
 * is recorded failed with the reason instead of being left running.
 */
export async function complete(db: Db, cfg: WorkConfig, runId: string, body: Json) {
  const key = typeof body?.idempotency_key === "string" ? body.idempotency_key : "";
  if (key.length < 8 || key.length > 100) throw new Refusal(400, "invalid", "A completion needs an idempotency key");
  try {
    return await tx(db, async (c) => {
      const row = await lockRun(c, runId);
      if (!holdsClaim(row.claim_token_hash, body.claim_token)) throw new Refusal(403, "stale-claim", "This claim token does not hold the run");
      if (row.completion_key !== null) {
        if (row.completion_key === key) return row.receipt;
        throw new Refusal(409, "already-complete", "This run already has a different completion on record");
      }
      if (row.status === "lost") throw new LateCompletion();
      if (row.status !== "running") throw new Refusal(409, "not-running", `The run is ${row.status}`);
      try {
        return await applyCompletion(c, cfg, row, key, body);
      } catch (e) {
        if (e instanceof Refusal) throw new ApplyRefusal(e);
        throw e;
      }
    });
  } catch (e) {
    if (e instanceof ApplyRefusal) return recordRefused(db, cfg, runId, key, body, e.refusal);
    if (e instanceof LateCompletion) {
      await tx(db, (c) =>
        appendEvent(c, "run.late-completion", runId, SYSTEM, {
          outputs: (Array.isArray(body.outputs) ? body.outputs : []).slice(0, 200).map((o: Json) => ({
            name: String(o?.name ?? "").slice(0, 200),
            sha256: sha256(Buffer.from(String(o?.content_base64 ?? ""), "base64")),
          })),
        }),
      );
      throw new Refusal(409, "run-lost", "The run was marked lost before this completion arrived; its digests are on the record");
    }
    throw e;
  }
}

async function applyCompletion(c: Tx, cfg: WorkConfig, row: RunRow, key: string, body: Json) {
  const runId = row.id;
  const agent: Actor = { kind: "agent", id: row.body.agent_baseline };
  const outputs: Output[] = [];
  for (const o of body.outputs ?? []) {
    if (typeof o.name !== "string" || !SAFE_OUTPUT.test(o.name) || o.name.includes("..")) {
      throw new Refusal(400, "invalid", "An output name is not a plain relative path");
    }
    outputs.push({ name: o.name, bytes: Buffer.from(String(o.content_base64 ?? ""), "base64") });
  }
  if (body.trace !== undefined) {
    const v = cfg.ajv.getSchema("ExecutionTrace.json");
    if (!v || !v(body.trace)) {
      const first = v?.errors?.[0];
      throw new Refusal(400, "invalid-trace", `The execution trace is invalid: ${first?.instancePath ?? ""} ${first?.message ?? ""}`.trim());
    }
    if (body.trace.run_id !== runId) throw new Refusal(400, "invalid-trace", "The execution trace names another run");
  }
  const finished = { ...row.body, status: body.status === "succeeded" ? "succeeded" : "failed", finished_at: now(), label: "Done" };
  delete finished.lease_expires_at;
  if (body.error) finished.error = String(body.error).slice(0, 2000);
  if (body.status === "stopped") {
    if (row.body.stop_requested_at) {
      finished.status = "stopped";
      finished.label = "Stopped";
      finished.error = `Stopped by ${String(row.body.stop_requested_by ?? "the owner")}.`;
    } else {
      finished.error = "The daemon reported the run stopped, but nobody asked it to stop.";
    }
  }
  // A clean exit is not a deliverable. An author run that wrote nothing fails, and the package
  // stays where it is.
  if (finished.status === "succeeded" && row.role === "author" && outputs.length === 0) {
    finished.status = "failed";
    finished.error = "The author run ended without writing anything to out/, so the package does not move. Requeue the run, or return or reject the package.";
  }
  if (body.trace) finished.trace = body.trace;
  validate(cfg, "Run.json", finished);
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
  if (finished.status === "succeeded") {
    if (row.role === "intake") await finishIntake(c, cfg, row, outputs, body, agent);
    else if (row.role === "author") await finishAuthor(c, cfg, row, agent);
    else await finishPreCheck(c, cfg, row, body, outputs, agent);
  }
  const receipt = receiptOf(runId, key, finished.status, outputs);
  await c.query("update runs set completion_key = $2, receipt = $3 where id = $1", [runId, key, receipt]);
  return receipt;
}

/** Applying a completion was refused: the run ends failed with the refusal as its reason. */
async function recordRefused(db: Db, cfg: WorkConfig, runId: string, key: string, body: Json, refusal: Refusal) {
  return tx(db, async (c) => {
    const row = await lockRun(c, runId);
    if (!holdsClaim(row.claim_token_hash, body.claim_token)) throw new Refusal(403, "stale-claim", "This claim token does not hold the run");
    if (row.completion_key !== null) {
      if (row.completion_key === key) return row.receipt;
      throw new Refusal(409, "already-complete", "This run already has a different completion on record");
    }
    if (row.status !== "running") throw new Refusal(409, "not-running", `The run is ${row.status}`);
    const finished = {
      ...row.body,
      status: "failed",
      finished_at: now(),
      label: "Refused",
      error: `Completion refused (${refusal.code}): ${refusal.message}`.slice(0, 2000),
    };
    delete finished.lease_expires_at;
    validate(cfg, "Run.json", finished);
    const receipt = receiptOf(runId, key, "failed", [], refusal);
    await c.query("update runs set status = 'failed', body = $2, completion_key = $3, receipt = $4 where id = $1", [
      runId,
      finished,
      key,
      receipt,
    ]);
    await appendEvent(c, "run.failed", runId, SYSTEM, {
      package: row.package_id,
      role: row.role,
      round: row.round,
      refused: refusal.code,
      reason: refusal.message,
    });
    return receipt;
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
  // The daemon also sends out/package.json as body.package; use it only when no output file
  // already carried a draft, so one draft is never inserted twice.
  if (body.package && drafts.length === 0) drafts.push(body.package);
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
    if (f) {
      try {
        raw = JSON.parse(f.bytes.toString("utf8"));
      } catch {
        throw new Refusal(400, "invalid", "verification.json is not valid JSON");
      }
    }
  }
  if (!raw || !["pass", "fail", "inconclusive"].includes(raw.outcome)) {
    throw new Refusal(400, "invalid", "Pre-check produced no outcome");
  }
  const authorOutputs = author ? await outputsOf(c, author.id) : [];
  const authorRuntime = identityOf(author?.body, author?.body.trace);
  const checkerRuntime = identityOf(row.body, body.trace);
  const sharedRuntime = mayBeSameRuntime(authorRuntime, checkerRuntime);
  const override = verifiedOverride(row.body) ? row.body.independence_override : undefined;
  const asRef = (r: Json, id: RuntimeIdentity) => ({ kind: String(r?.runtime?.kind ?? "local"), provider: id.provider || "unknown", model: id.model });
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
    independence: {
      runtime: sharedRuntime ? "shared" : "independent",
      author_runtime: asRef(author?.body, authorRuntime),
      checker_runtime: asRef(row.body, checkerRuntime),
      ...(sharedRuntime && override ? { owner_override: override } : {}),
    },
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
      author_runtime: authorRuntime,
      checker_runtime: checkerRuntime,
      owner_override_verified: Boolean(override),
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
    owner_override: Boolean(sharedRuntime && override),
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
      if (!ver) {
        // No pre-check yet: nothing to accept, but a held, lost or failed pre-check still shows below.
      } else if (ver.body.outcome === "pass") {
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
    if (p.status === "in-work" || p.status === "in-verification" || p.status === "released") {
      const failed = await db.query<{ body: Json }>(
        "select body from runs where package_id = $1 and package_revision = $2 and status = 'failed' order by created_at desc limit 1",
        [p.id, p.revision],
      );
      const latest = await db.query<{ status: string; body: Json }>(
        "select status, body from runs where package_id = $1 and package_revision = $2 order by created_at desc limit 1",
        [p.id, p.revision],
      );
      const last = latest.rows[0];
      if (last?.status === "queued" && last.body.waiting_reason) {
        items.push({
          kind: "permission",
          package_id: p.id,
          package_revision: p.revision,
          title,
          detail: String(last.body.waiting_reason),
          since: String(last.body.queued_at ?? new Date().toISOString()),
        });
      } else if (last?.status === "stopped") {
        items.push({
          kind: "dispute",
          package_id: p.id,
          package_revision: p.revision,
          title,
          detail: `${last.body.role === "pre-check" ? "Pre-check" : "Author"} run stopped. Requeue it, or return or reject the package.`,
          since: String(last.body.finished_at ?? new Date().toISOString()),
        });
      } else if (last?.status === "lost") {
        items.push({
          kind: "lost",
          package_id: p.id,
          package_revision: p.revision,
          title,
          detail: `${last.body.role === "pre-check" ? "Pre-check" : "Author"} run lost: the daemon stopped answering. Requeue it, or return or reject the package.`,
          since: String(last.body.finished_at ?? new Date().toISOString()),
        });
      } else if (failed.rows[0] && last?.status === "failed") {
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
  const rank: Record<string, number> = { lost: 0, dispute: 0, accept: 1, release: 2, permission: 3 };
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

/* ---------- runtime readiness ---------- */

const KNOWN_RUNTIMES = ["claude", "codex", "fake"];

export interface RuntimeStatus {
  runtime: string;
  ready: boolean;
  version?: string;
  reason?: string;
  login_checked: boolean;
}

/** Keeps the daemon's latest probe of each runtime, cleaned to plain short fields. */
export async function recordRuntimeStatus(db: Db, raw: unknown): Promise<RuntimeStatus[]> {
  if (!Array.isArray(raw)) return [];
  const list: RuntimeStatus[] = [];
  for (const r of raw.slice(0, 10)) {
    if (!r || typeof r !== "object" || !KNOWN_RUNTIMES.includes(String((r as Json).runtime))) continue;
    const x = r as Json;
    list.push({
      runtime: String(x.runtime),
      ready: x.ready === true,
      ...(typeof x.version === "string" && x.version ? { version: x.version.slice(0, 200) } : {}),
      ...(typeof x.reason === "string" && x.reason ? { reason: x.reason.slice(0, 300) } : {}),
      login_checked: x.login_checked === true,
    });
  }
  const value = JSON.stringify({ reported_at: now(), runtimes: list });
  await db.query("insert into settings (key, value) values ('runtime_status', $1) on conflict (key) do update set value = excluded.value", [value]);
  return list;
}

export async function runtimeStatus(db: Db): Promise<{ reported_at?: string; runtimes: RuntimeStatus[] }> {
  const r = await db.query<{ value: string }>("select value from settings where key = 'runtime_status'");
  if (!r.rows[0]) return { runtimes: [] };
  return JSON.parse(r.rows[0].value) as { reported_at?: string; runtimes: RuntimeStatus[] };
}
