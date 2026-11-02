import { authorOutputIntegrity } from "./preparation/artifacts.js";
import type { VerificationRecord } from "./preparation/types.js";
import { prepareCriterionResults, persistCriterionResults, preparedAcceptanceGuard, currentCriterionResults, criterionResultFlags, criterionResultSchemaInputs } from "./preparation/results.js";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Ajv2020 } from "ajv/dist/2020.js";
import { preparedExecutionGuard, preparedJobInputs, quarantineCompletion } from "./preparation/lifecycle.js";
import { preparationForSubject, preparedReleaseGuard, persistReleaseManifest } from "./preparation/release.js";
import { enrollPreparationTx, advancePreparationRevision } from "./preparation/store.js";
import { type Db, type Tx, readTx } from "./db/index.js";
import { command } from "./commands/executor.js";
import { type DataLane, admitted, hasLaneAuthority, isLane, laneHoldReason, raises } from "./disclosure.js";
import { CONFIGURED_KINDS, basisRef, configuredClosure, configuredLane, configuredStillCovered, covers, currentMarking, effectiveLane, endOverride, laneOf, markObject, mostSensitive, storedConfigured, storedSources, type Ref } from "./markings.js";
import { type Actor, afterCommit, appendEvent } from "./events.js";
import { adoptHeldRun, enterScramGate, quarantineScramCompletion, refuseIfScrammed, runSubject, scramHolding, scramRunEnded } from "./scram.js";
import { Refusal } from "./refusal.js";
import { ACTION_ROLES, type SignerAction, highConsequence, holdsHardwareKey, lockSigner, needsOf, requireAuthority, requireHardwareKey, signingGaps } from "./authority.js";
import { teach } from "./refusals.js";
import { type ProbeArtifact, activePin, recordProbes } from "./runtimes.js";
import { type Action, type KernelOutcome, type RuntimeIdentity, type Status, decide, digest } from "./kernel.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

export { Refusal } from "./refusal.js";

export interface WorkConfig {
  /** Repository root, for packs/. */
  root: string;
  ajv: Ajv2020;
  /** Seconds a claim lasts without a heartbeat before the sweep marks the run lost. */
  leaseSeconds?: number;
  /**
   * The sweep's memory of the controller (specification 22): when it started, how often the timer
   * sweeps (0 means only on demand), when it last swept, and whether an outage is being reported.
   */
  supervision?: { startedAt: number; sweepSeconds: number; lastSweepAt?: number; outage?: boolean; outageUntil?: number; issued?: Set<string> };
  guidedPreparation?: boolean;
  preparedRelease?: boolean;
  preparationSources?: Record<string,{kind:"document"|"policy";revision:string;path:string}>;
  preparationRepositories?: Record<string,string>;
  /** The data lane the owner classified each configured document, policy and repository source as. */
  preparationLanes?: Record<string, DataLane>;
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
    throw new Refusal(403, outcome.reason, `${what}: ${teach(outcome.reason).sentence}`);
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

export async function createCapture(db: Db, cfg: WorkConfig, user: string, text: string, source: string, lane?: unknown) {
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
  return command(db, "capture.create", async (c) => {
    // The disclosure gate: only a classified capture goes on to intake, and only a person with lane
    // authority classifies. Anyone else's capture waits, unclassified, for someone who can.
    const classified = isLane(lane) && (await hasLaneAuthority(c, user));
    const body: Json = classified ? { ...capture, lane, classified_by: user, classified_at: capture.created_at } : capture;
    validate(cfg, "Capture.json", body);
    await c.query("insert into captures (id, body, created_at) values ($1, $2, $3)", [capture.id, body, capture.created_at]);
    for (const f of files) {
      await c.query("insert into attachments (capture_id, name, sha256, bytes) values ($1, $2, $3, $4)", [
        capture.id,
        f.name,
        sha256(f.bytes),
        f.bytes,
      ]);
    }
    if (classified) {
      await markObject(c, "capture", capture.id, lane, `classified at capture by ${user}`);
      await queueRun(c, cfg, capture.id, 0, "intake", 1);
    }
    await appendEvent(c, "capture.created", capture.id, { kind: "human", id: user }, {
      attachments: files.map((f) => f.name),
      ...(classified ? { lane } : { unclassified: true }),
    });
    return body;
  });
}

/**
 * Classifies a capture's data lane (specification 10.2 "Classify lane"). Needs lane authority. A
 * first classification releases the capture to intake; a later one may only raise the lane, since
 * lowering it is a declassification that needs a signed change request.
 */
export async function classifyCapture(db: Db, cfg: WorkConfig, user: string, id: string, lane: unknown) {
  if (!isLane(lane)) throw new Refusal(400, "invalid", "Choose a data lane");
  return command(db, "capture.classify", async (c) => {
    if (!(await hasLaneAuthority(c, user))) throw new Refusal(403, "authority-missing", "Classifying a data lane needs lane authority");
    const r = await c.query<{ body: Json }>("select body from captures where id = $1 for update", [id]);
    const cap = r.rows[0]?.body;
    if (!cap) throw new Refusal(404, "not-found", "No such capture");
    // Measured against the effective lane, which a declassification may have lowered.
    const current = await laneOf(c, "capture", id, cap.lane);
    if (current !== undefined && !raises(current, lane))
      throw new Refusal(409, "lowering-needs-change-request", "Lowering a data lane is a declassification; it needs a signed change request");
    const next = { ...cap, lane, classified_by: user, classified_at: now() };
    validate(cfg, "Capture.json", next);
    await c.query("update captures set body = $2 where id = $1", [id, next]);
    await markObject(c, "capture", id, lane, `classified by ${user}`);
    if (cap.lane === undefined) await queueRun(c, cfg, id, 0, "intake", 1);
    await appendEvent(c, "capture.classified", id, { kind: "human", id: user }, { lane, ...(cap.lane ? { from: cap.lane } : {}) });
    return next;
  });
}

/**
 * The objects whose content a package run's job carries besides the package itself: for a legacy
 * job, its capture (text and attachments) and the outputs of the packages it depends on; for a
 * prepared job, the captures, attachments and packages its release manifest pinned.
 */
async function transmittedSources(c: Tx, pkg: PackageRow, run: Json): Promise<Ref[]> {
  const out: Ref[] = [];
  if (run.preparation_manifest_digest) {
    const m = await c.query<{ body: Json }>("select body from preparation_release_manifests where digest = $1", [run.preparation_manifest_digest.value]);
    for (const b of m.rows[0]?.body.basis_refs ?? []) {
      const r = basisRef(b, pkg.id);
      if (r) out.push(r);
      else if (CONFIGURED_KINDS.has(String(b.kind))) out.push({ kind: String(b.kind), id: String(b.reference) });
    }
    return out;
  }
  if (pkg.capture_id) out.push({ kind: "capture", id: pkg.capture_id });
  for (const dep of (await dependenciesReady(c, pkg)).deps) out.push({ kind: "package", id: dep });
  return out;
}

/**
 * The lane a package run is dispatched under: the most sensitive of the package's effective lane and
 * the effective lane of every source its job carries, each judged by its own marking. A
 * declassification of the package lowers the package, never the raw content of its sources. A source
 * with no classified lane holds the run.
 */
async function dispatchLane(c: Tx, cfg: WorkConfig, pkg: PackageRow, run: Json): Promise<{ lane?: DataLane; reason: string }> {
  const own = await provenanceLane(c, cfg, { kind: "package", id: pkg.id });
  if (!own.lane) return { reason: own.missing ? unclassifiedReason(own.missing) : laneHoldReason(undefined) };
  const lanes: DataLane[] = [own.lane];
  for (const src of await transmittedSources(c, pkg, run)) {
    const got = await provenanceLane(c, cfg, src);
    if (!got.lane) return { reason: unclassifiedReason(got.missing ?? src) };
    lanes.push(got.lane);
  }
  return { lane: mostSensitive(lanes), reason: "" };
}

const unclassifiedReason = (r: Ref) =>
  `This work carries ${r.kind} ${r.id}, or content derived from it, which has no classified data lane; a person with lane authority must classify it first.`;

/**
 * An object's lane for disclosure, read only. A marked object has its effective lane, kept current by
 * propagation. An object marked before markings existed has no edges to propagate through, so its
 * lane is computed here through its own sources: a package's capture and dependencies, recursively.
 * `missing` names the first source with no classified lane.
 */
async function provenanceLane(c: Tx, cfg: WorkConfig, ref: Ref, seen = new Set<string>()): Promise<{ lane?: DataLane; missing?: Ref }> {
  const key = `${ref.kind}/${ref.id}`;
  if (seen.has(key)) return {};
  seen.add(key);
  // A configured source takes the lane the owner gave it; it has no marking and no sources of its own.
  if (CONFIGURED_KINDS.has(ref.kind)) {
    const lane = configuredLane(cfg.preparationLanes, ref.id);
    return lane ? { lane } : { missing: ref };
  }
  const marking = await currentMarking(c, ref.kind, ref.id);
  if (ref.kind === "capture") {
    if (marking) return { lane: effectiveLane(marking) };
    const lane = (await c.query<{ lane: string }>("select body->>'lane' as lane from captures where id = $1", [ref.id])).rows[0]?.lane;
    return isLane(lane) ? { lane } : { missing: ref };
  }
  // An approved declassification stands while every configured lane in the ancestry is one it saw, at
  // no higher sensitivity. Otherwise the package is judged without it: its own lane and every source.
  let recorded: unknown;
  if (marking?.override) {
    if (configuredStillCovered(await configuredClosure(c, ref.id, cfg.preparationLanes), marking.override.covered_configured))
      return { lane: effectiveLane(marking) };
    recorded = marking.assigned ?? marking.lane;
  } else {
    recorded = marking ? effectiveLane(marking) : (await currentPackage(c, ref.id))?.body.data_lane;
  }
  if (!isLane(recorded)) return { missing: ref };
  // Configured sources are classified in the owner's config, which markings never record, so they are
  // read live: the package's own and, through its package sources, its ancestors'. A marked package's
  // capture and package sources are already in its effective lane, but are still walked for theirs.
  const lanes: DataLane[] = [recorded];
  const sources: Ref[] = [...await storedSources(c, ref.id), ...(await storedConfigured(c, ref.id)).map((r) => ({ kind: r.split(":")[0]!, id: r }))];
  for (const s of sources) {
    const got = await provenanceLane(c, cfg, s, seen);
    if (got.missing) return { missing: got.missing };
    if (got.lane) lanes.push(got.lane);
  }
  return { lane: mostSensitive(lanes) };
}

/** Records once, on the run and in the log, why a run waits; repeated scans add nothing. */
async function holdRun(c: Tx, cfg: WorkConfig, row: { id: string; role: string; body: Json }, subject: string, reason: string) {
  if (row.body.waiting_reason === reason) return;
  const held = { ...row.body, waiting_reason: reason };
  validate(cfg, "Run.json", held);
  await c.query("update runs set body = $2 where id = $1", [row.id, held]);
  await appendEvent(c, "run.waiting", row.id, SYSTEM, { package: subject, role: row.role, reason });
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

export async function latestAuthorRun(q: Db | Tx, id: string, rev: number) {
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

/** Output names and digests only: what a decision subject covers, without loading the files. */
async function outputDigestsOf(q: Db | Tx, runId: string) {
  const r = await q.query<{ name: string; sha256: string }>("select name, sha256 from outputs where run_id = $1 order by name", [runId]);
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
  const outs = author && author.status === "succeeded" ? await outputDigestsOf(q, author.id) : [];
  const ver = author ? await latestVerification(q, pkg.id, pkg.revision, author.round) : null;
  const preparation = await preparationForSubject(q,pkg);
  const integrity=preparation && author?.status==="succeeded"?await authorOutputIntegrity(q,author.id):null;
  const subject = {
    ...(preparation ? {preparation:preparation.subject} : {}),
    package: { ...pkg.body, status: pkg.status },
    outputs: integrity?integrity.observed:outs.map((o) => ({ name: o.name, sha256: o.sha256 })),
    pre_check: ver?.body ?? null,
  };
  const criterionResults=preparation?await currentCriterionResults(q,pkg,author?.round,ver?.body??null):null;
  if(criterionResults) Object.assign(subject,{criterion_results_digest:{algorithm:"sha256",value:criterionResults.digest},criterion_evidence_digest:{algorithm:"sha256",value:digest(criterionResults.evidence_subject)}});
  return { subject, preparation, integrity, criterionResults, digest: digest(subject), author, outputs: outs, verification: ver?.body ?? null };
}

export async function packageView(db: Db, id: string, cfg?: WorkConfig) {
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
  const lane = await laneOf(db, "package", id, pkg.body.data_lane);
  return {
    ...(pkg.status === "draft" ? { draft_etag: draftEtag(pkg.body) } : {}),
    ...(lane ? { effective_lane: lane } : {}),
    package: { ...pkg.body, status: pkg.status },
    runs: runs.rows.map((r) => ({ ...r.body, status: r.status })),
    outputs: s.outputs.map((o) => ({ path: o.name, digest: { algorithm: "sha256", value: o.sha256 } })),
    ...(s.verification ? { pre_check: s.verification } : {}),
    decisions: decisions.rows.map((d) => d.body),
    subject_digest: { algorithm: "sha256", value: s.digest },
    ...(s.criterionResults?{criterion_results_integrity:s.criterionResults.evidence_valid?"intact":"changed",criterion_results:s.criterionResults.body,criterion_results_run_id:s.criterionResults.run_id}:{}),
    ...(s.preparation?{preparation_verification_complete:Boolean(s.integrity?.intact && criterionResultFlags(s.preparation.snapshot,s.criterionResults?.evidence_valid?s.criterionResults.body:null).required_checks_complete),preparation_results_pass:Boolean(s.integrity?.intact && criterionResultFlags(s.preparation.snapshot,s.criterionResults?.evidence_valid?s.criterionResults.body:null).results_pass)}:{}),
    ...(s.integrity?{deliverable_integrity:s.integrity.intact?"intact":"changed"}:{}),
    preparation_enrolled: Boolean(s.preparation),
    preparation_release_ready: Boolean(cfg?.preparedRelease && s.preparation?.manifest && s.preparation.blockers.length===0),
  };
}

/** A package's effective lane, which every view and download shows (specification 11.3 M-3). */
export async function packageLane(db: Db, id: string): Promise<DataLane | undefined> {
  const pkg = await currentPackage(db, id);
  return pkg ? laneOf(db, "package", id, pkg.body.data_lane) : undefined;
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
    await command(db, "output.record-mismatch", (c) =>
      appendEvent(c, "output.mismatch", pkg.id, SYSTEM, { revision: pkg.revision, run: author.id, name, recorded: row.sha256, actual }),
    );
    throw new Refusal(409, "output-changed", "This output changed since it was recorded, so it is not served. The mismatch is on the record.");
  }
  return row.bytes;
}

/** Edits a draft. Identity, revision and status are the server's, never the client's. */
/** Strong ETag of a draft: its content digest, quoted. Any change to the draft changes it. */
export function draftEtag(body: Json): string {
  return `"${digest(body)}"`;
}

/**
 * Edits a draft by compare and swap: the caller sends the ETag of the draft it edited, and the edit
 * applies only if the draft is still exactly that. The check runs under the package's row lock, so
 * of two concurrent edits from the same draft exactly one lands.
 */
export async function updateDraft(db: Db, cfg: WorkConfig, user: string, id: string, body: Json, ifMatch: string | undefined) {
  return command(db, "draft.edit", async (c) => {
    const pkg = await currentPackage(c, id, true);
    if (!pkg) throw new Refusal(404, "not-found", "No such package");
    if (pkg.status !== "draft") throw new Refusal(409, "wrong-state", "Only a draft can be edited");
    if ((await c.query("select 1 from preparation_heads where package_id=$1", [id])).rowCount) throw new Refusal(409,"preparation-edit-required","Use preparation editing to keep the controlled contract and criteria together");
    if (ifMatch === undefined) throw new Refusal(428, "precondition-required", "Send the draft's ETag in If-Match");
    if (ifMatch !== draftEtag(pkg.body)) throw new Refusal(409, "stale", "This draft changed since you opened it. Reload and review it before saving.");
    const next = { ...body, id: pkg.id, revision: pkg.revision, status: "draft", schema_version: "0.1.0" };
    next.agent_assignment = pkg.body.agent_assignment;
    next.verification = pkg.body.verification;
    validate(cfg, "WorkPackage.json", next);
    await checkDependsOn(c, id, next);
    // A draft's lane may be raised by editing it; lowering below the effective lane is a declassification.
    const effective = await laneOf(c, "package", id, pkg.body.data_lane);
    if (effective && !covers(next.data_lane, effective))
      throw new Refusal(409, "lowering-needs-change-request", `This package is ${effective}; lowering its lane needs a signed change request`);
    await c.query("update packages set body = $3, updated_at = now() where id = $1 and revision = $2", [id, pkg.revision, next])
      .catch((e) => { throw dependencyRefusal(e); });
    // Only a lane the person actually changed is a raise; an untouched lane keeps any declassification.
    const lane = next.data_lane !== pkg.body.data_lane ? next.data_lane : (effective ?? next.data_lane);
    await markObject(c, "package", id, lane, `draft edited by ${user}`, await packageInputs(c, next));
    await appendEvent(c, "package.edited", id, { kind: "human", id: user }, { revision: pkg.revision });
    return { body: next, etag: draftEtag(next) };
  });
}

/* ---------- runs ---------- */

async function queueRun(c: Tx, cfg: WorkConfig, packageId: string, revision: number, role: string, round: number, requeueOf?: string) {
  const manifest=(await c.query<{digest:string}>("select digest from preparation_release_manifests where package_id=$1 and package_revision=$2",[packageId,revision])).rows[0];
  // The generation fence: each attempt at this revision, role and round is numbered.
  const attempts = await c.query<{ n: number }>(
    "select count(*)::int as n from runs where package_id = $1 and package_revision = $2 and role = $3 and round = $4",
    [packageId, revision, role, round]);
  const run: Json = {
    ...(manifest?{preparation_manifest_digest:{algorithm:"sha256",value:manifest.digest}}:{}),
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
    generation: (attempts.rows[0]?.n ?? 0) + 1,
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

/**
 * Whether a package revision may start: every package it depends on is accepted. Dependencies come
 * from `package_dependencies` (explicit `depends_on`, or classified from design inputs for packages
 * that predate it); citations never gate. A missing target keeps the package waiting.
 */
async function dependenciesReady(c: Tx, pkg: { id: string; revision: number }): Promise<{ ready: boolean; deps: string[] }> {
  const r = await c.query<{ depends_on: string; status: string | null }>(
    `select d.depends_on, (select p.status from packages p where p.id = d.depends_on order by p.revision desc limit 1) as status
       from package_dependencies d where d.package_id = $1 and d.package_revision = $2 order by d.depends_on`,
    [pkg.id, pkg.revision]);
  const deps = r.rows.map((x) => x.depends_on);
  return { ready: r.rows.every((x) => x.status === "accepted"), deps };
}

/** Refuses a `depends_on` that names this package itself or a package that does not exist. */
async function checkDependsOn(c: Tx, id: string, body: Json): Promise<void> {
  for (const d of body.depends_on ?? []) {
    const target = String(d?.package_id ?? "");
    if (target === id) throw new Refusal(400, "invalid-dependency", "A package cannot depend on itself");
    if (!(await c.query("select 1 from packages where id = $1 limit 1", [target])).rowCount)
      throw new Refusal(400, "unknown-dependency", `This package depends on ${target}, which does not exist`);
  }
}

/**
 * The objects a package is derived from, for its marking: its capture, its dependencies and the
 * design inputs that name another package. A citation of an ordinary document is not an object here.
 */
async function packageInputs(c: Tx, body: Json, captureId?: string | null): Promise<Ref[]> {
  const refs: Ref[] = captureId ? [{ kind: "capture", id: captureId }] : [];
  for (const d of body.depends_on ?? []) refs.push({ kind: "package", id: String(d.package_id) });
  for (const d of body.design_inputs ?? []) {
    if (typeof d.doc !== "string" || d.doc.startsWith("attachment:") || d.doc === body.id) continue;
    if ((await c.query("select 1 from packages where id = $1 limit 1", [d.doc])).rowCount) refs.push({ kind: "package", id: d.doc });
  }
  return refs;
}

/** A dependency cycle or unknown target the database refused, as a clear answer. */
function dependencyRefusal(error: unknown): unknown {
  const code = (error as { code?: string }).code;
  if (code === "23503" || code === "23514") return new Refusal(400, "invalid-dependency", (error as Error).message);
  return error;
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
  if(!run.preparation_manifest_digest) {
  const { deps } = await dependenciesReady(c, pkg);
  for (const dep of deps) {
    const dp = await currentPackage(c, dep);
    const ar = dp ? await latestAuthorRun(c, dep, dp.revision) : null;
    for (const o of ar ? await outputsOf(c, ar.id) : []) inputs.push(file(`deps/${dep}/${o.name}`, o.bytes));
  }
  inputs.push(...(await attachmentsFor(c, pkg.capture_id)));
  // Legacy jobs read live capture context; prepared jobs use retained signed sources below.
  if (pkg.capture_id) {
    const cap = await c.query<{ body: Json }>("select body from captures where id = $1", [pkg.capture_id]);
    const text = cap.rows[0]?.body?.text;
    if (typeof text === "string") inputs.push(file("CAPTURE.md", text));
  }
  }
  inputs.push(...await preparedJobInputs(c,run));
  inputs.push(file("PACKAGE.json", JSON.stringify(run.preparation_manifest_digest?pkg.body:{ ...pkg.body, status: pkg.status }, null, 2)));
  const own = findRoleIn(cfg, role) ?? findRoleIn(cfg, "general-author");
  // The role's own pack ships its templates, typicals and examples to author and pre-check alike.
  if (own) inputs.push(...packFiles(own.packDir));
  const roleText = run.role === "pre-check" ? preCheckRole(cfg, role) : (own?.text ?? "");
  const extra: string[] = [];
  if(run.preparation_manifest_digest)extra.push("PACKAGE.json is the immutable package body reviewed at release; the server owns current run and lifecycle status.");
  if(run.preparation_manifest_digest && run.role==="pre-check") {
    inputs.push(...criterionResultSchemaInputs(cfg.root));
    extra.push("## Controlled criterion results\n\nWrite out/criterion-results.json using inputs/schemas/CriterionResultSubmission.json. Use the exact package, revision and manifest digest from inputs/PREPARATION.json. Record every current criterion and mapped check once. Retain actual check evidence as separate out/ files and reference it as checker:<relative file name>. Claim JSON is not decisive evidence. Open/deferred checks must be reported honestly; required checks cannot be waived at acceptance. Also write the ordinary verification.json outcome and findings.");
  }
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
        "select id from runs where package_id = $1 and package_revision = $2 and role = 'author' and round = $3 and status = 'succeeded' order by created_at desc, id desc limit 1",
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
  return { run, package: run.preparation_manifest_digest?pkg.body:{ ...pkg.body, status: pkg.status }, inputs, ...(findings ? { findings } : {}) };
}

const CLAIM_PAGE = 50;
const MAX_LOG_LINES = 500;

/** The daemon asks for work. Only runs whose package is ready are handed out. */
/**
 * Leaves out of an offer every runtime whose role has a pin the daemon's installed artifact does
 * not match (specification 21), and says why when that leaves nothing.
 */
async function pinnedOffer(c: Tx, offer: string[], role: string, artifacts: Map<string, string>): Promise<{ offer: string[]; reason?: string }> {
  const out: string[] = [];
  const blocked: string[] = [];
  for (const r of offer) {
    const pin = await activePin(c, r, role);
    if (!pin || pin.artifact_digest.value === artifacts.get(r)) out.push(r);
    else blocked.push(`${r} here is not the pinned version (${String(artifacts.get(r) ?? "unknown").slice(0, 12)}, pinned ${String(pin.artifact_digest.value).slice(0, 12)})`);
  }
  return out.length || !blocked.length ? { offer: out } : { offer: out, reason: `${blocked.join("; ")}. An administrator pins the installed version, or the pinned one is reinstalled.` };
}

export async function claim(db: Db, cfg: WorkConfig, runtimes: string[], artifacts: Map<string, string> = new Map()) {
  return command(db, "run.claim", async (c) => {
    await enterScramGate(c);
    // Scan the whole queue in pages, so work queued behind blocked or held runs is still found.
    // Keyset paging: rows this loop stops leave the queue, so an offset would skip work.
    let cursor: { at: string; id: string } | null = null;
    for (;;) {
      const queued: { rows: { id: string; role: string; package_id: string; package_revision: number; round: number; body: Json; created_key: string }[] } =
        await c.query(
          cursor
            ? "select *, created_at::text as created_key from runs where status = 'queued' and (created_at, id) > ($2::timestamptz, $3) order by created_at, id limit $1"
            : "select *, created_at::text as created_key from runs where status = 'queued' order by created_at, id limit $1",
          cursor ? [CLAIM_PAGE, cursor.at, cursor.id] : [CLAIM_PAGE],
        );
      if (queued.rows.length === 0) break;
      const last = queued.rows[queued.rows.length - 1];
      // The key is the timestamp as text, at full microsecond precision; a JS Date would round it.
      if (last) cursor = { at: last.created_key, id: last.id };
      for (const candidate of queued.rows) {
        let row=candidate;
        if(!legacyRun(row)) continue;
        // SCRAM holds everything in its scope: nothing there is handed out until a restart lifts it.
        const scram = await scramHolding(c, await runSubject(c, row));
        if (scram) {
          await holdRun(c, cfg, row, row.package_id, `SCRAM ${scram.id} has stopped this work: ${scram.reason}`.slice(0, 300));
          continue;
        }
        if (row.role !== "intake") {
          const pkg = await currentPackage(c, row.package_id, true);
          if (!pkg || pkg.revision !== row.package_revision) {
            await c.query("update runs set status = 'stopped' where id = $1", [row.id]);
            continue;
          }
          const locked=await c.query<typeof row>("select *,created_at::text as created_key from runs where id=$1 and status='queued' for update skip locked",[row.id]);
          if(!locked.rows[0]) continue;row=locked.rows[0];
          if(!legacyRun(row)) continue;
          let preparation;
          try {preparation=await preparedExecutionGuard(c,cfg,pkg,row.body);} catch(error) {
            if(!(error instanceof Refusal)) throw error;
            const waiting_reason=error.message;
            if(row.body.waiting_reason!==waiting_reason) {await c.query("update runs set body=$2 where id=$1",[row.id,{...row.body,waiting_reason}]);await appendEvent(c,"run.waiting",row.id,SYSTEM,{package:pkg.id,reason:waiting_reason});}
            continue;
          }
          if (row.role === "author") {
            if (pkg.status === "released") {
              if (!(await dependenciesReady(c, pkg)).ready) continue;
            } else if (pkg.status !== "in-work") continue;
          }
          // The disclosure gate: only runtimes that every transmitted source's lane admits may see the
          // job. The claim holds the marking lock shared (command catalog), so no raise lands before it
          // and its job commit.
          const gate = await dispatchLane(c, cfg, pkg, row.body);
          if (!gate.lane) {
            await holdRun(c, cfg, row, pkg.id, gate.reason);
            continue;
          }
          const lane = gate.lane;
          const admittedHere = admitted(lane, runtimes);
          if (admittedHere.length === 0) {
            await holdRun(c, cfg, row, pkg.id, laneHoldReason(lane));
            continue;
          }
          const pinned = await pinnedOffer(c, admittedHere, row.role, artifacts);
          if (pinned.reason) {
            await holdRun(c, cfg, row, pkg.id, pinned.reason);
            continue;
          }
          const offer = pinned.offer;
          let runtime: string | null;
          if (row.role === "pre-check") {
            if (pkg.status !== "in-verification") continue;
            const a = await latestAuthorRun(c, pkg.id, pkg.revision);
            const authorRuntime = runtimeName(a?.body.runtime?.provider);
            runtime = pickChecker(offer, authorRuntime, verifiedOverride(row.body));
            if (!runtime && offer.includes(authorRuntime) && !row.body.waiting_reason) {
              // Held, not skipped silently: say why on the run and in the office, once.
              const held = { ...row.body, waiting_reason: WAITING_FOR_INDEPENDENT_RUNTIME };
              validate(cfg, "Run.json", held);
              await c.query("update runs set body = $2 where id = $1", [row.id, held]);
              await appendEvent(c, "run.waiting", row.id, SYSTEM, { package: pkg.id, role: row.role, reason: held.waiting_reason, author_runtime: authorRuntime });
            }
          } else {
            runtime = pickRuntime(offer);
          }
          if (!runtime) continue;
          const baseline = `${row.role === "pre-check" ? "checker" : "author"}-${runtime}`;
          if (row.role === "author" && pkg.status === "released") {
            const next = kernel(
              decide({ status: pkg.status, action: "claim", actor_kind: "agent", actor_id: baseline, ...(preparation?{preparation}:{}) }),
              "claim",
            );
            await c.query("update packages set status = $3, updated_at = now() where id = $1 and revision = $2", [pkg.id, pkg.revision, next]);
            await appendEvent(c, "package.claimed", pkg.id, { kind: "agent", id: baseline }, { revision: pkg.revision, status: next });
          }
          return startRun(c, cfg, row, runtime, baseline);
        }
        // Intake reads the capture and its attachments: only a runtime its lane admits may.
        // The shared marking lock covers marked captures; the row lock also covers an unmarked one.
        const bodyLane = (await c.query<{ lane: string | null }>("select body->>'lane' as lane from captures where id = $1 for share", [row.package_id])).rows[0]?.lane;
        const capLane = await laneOf(c, "capture", row.package_id, bodyLane);
        const admittedIntake = admitted(capLane, runtimes);
        if (admittedIntake.length === 0) {
          await holdRun(c, cfg, row, row.package_id, laneHoldReason(capLane));
          continue;
        }
        const pinnedIntake = await pinnedOffer(c, admittedIntake, "intake", artifacts);
        if (pinnedIntake.reason) {
          await holdRun(c, cfg, row, row.package_id, pinnedIntake.reason);
          continue;
        }
        const runtime = pickRuntime(pinnedIntake.offer);
        if (!runtime) continue;
        const locked=await c.query<typeof row>("select *,created_at::text as created_key from runs where id=$1 and status='queued' for update skip locked",[row.id]);
        if(!locked.rows[0]) continue;row=locked.rows[0];
          if(!legacyRun(row)) continue;
        return startRun(c, cfg, row, runtime, `intake-${runtime}`);
      }
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
/** Whether the controller looks to have been absent: no sweep for longer than a lease (the machine slept). */
function controllerAbsent(cfg: WorkConfig): boolean {
  const sup = cfg.supervision;
  return Boolean(sup && sup.sweepSeconds > 0 && sup.lastSweepAt !== undefined
    && Date.now() - sup.lastSweepAt > Math.max(leaseSeconds(cfg), 3 * sup.sweepSeconds) * 1000);
}

/** Whether most active runs look dead at once right now: an apparent outage (see sweepLost). */
async function outageNow(c: Tx): Promise<boolean> {
  const r = await c.query<{ active: number; lapsed: number }>(
    "select count(*)::int as active, count(*) filter (where lease_expires_at <= clock_timestamp())::int as lapsed from runs where status = 'running'");
  const { active = 0, lapsed = 0 } = r.rows[0] ?? {};
  return active >= 3 && lapsed * 2 > active;
}

/**
 * Why a heartbeat or completion that reaches a lapsed lease before the sweep may still count, or
 * null: the lease was granted before this controller started, the controller was absent, or most
 * runs lapsed together (an apparent outage). The sweep applies the same reasons, so whichever comes
 * first, a live daemon is never stopped by the controller's own interruption.
 */
async function leaseGrace(c: Tx, cfg: WorkConfig, runId: string): Promise<string | null> {
  const sup = cfg.supervision;
  if (!sup) return null;
  if ((await c.query("select 1 from runs where id = $1 and body ? 'scram_id'", [runId])).rowCount) return null;
  if (!sup.issued?.has(runId)) return "the lease was granted before the controller restarted";
  if (controllerAbsent(cfg)) return "the controller was not sweeping when the lease lapsed";
  // An outage, once seen, lasts a lease: runs that come back one by one each count, even after
  // the rest have made the lapsed ones a minority again.
  if (sup.outageUntil !== undefined && Date.now() < sup.outageUntil) return "most active runs lapsed at once, which looks like an outage";
  if (await outageNow(c)) {
    const until = Date.now() + leaseSeconds(cfg) * 1000;
    afterCommit(c, () => (sup.outageUntil = until));
    return "most active runs lapsed at once, which looks like an outage";
  }
  return null;
}

/**
 * Renews a lapsed lease without a heartbeat, counting it on the run (grace_renewals) so the bound
 * holds across controller restarts.
 */
async function renewLease(c: Tx, cfg: WorkConfig, row: { id: string; package_id: string; body: Json }, reason: string): Promise<string> {
  const lease = leaseFromNow(cfg);
  issuedLease(c, cfg, row.id);
  const grace = (row.body.grace_renewals ?? 0) + 1;
  await c.query(
    "update runs set lease_expires_at = $2, body = jsonb_set(jsonb_set(body, '{lease_expires_at}', to_jsonb($3::text)), '{grace_renewals}', to_jsonb($4::int)) where id = $1 and status = 'running'",
    [row.id, lease, lease, grace]);
  await appendEvent(c, "run.lease-renewed", row.id, SYSTEM, { package: row.package_id, lease_expires_at: lease, reason, grace_renewals: grace });
  return lease;
}

/** The most normalized events one run keeps; past it a single dropped marker records the overflow. */
const MAX_RUN_EVENTS = 20000;

/**
 * Stores a log post's normalized events in order (specification 20). A permission request becomes
 * a run.waiting event naming the tool and the digest of its input (plan task 2.9), and a breaker
 * notice becomes run.breaker, so both reach the office and the stream.
 */
async function recordRunEvents(c: Tx, cfg: WorkConfig, row: RunRow, raw: unknown, from?: unknown): Promise<void> {
  if (!Array.isArray(raw)) throw new Refusal(400, "invalid", "events must be a list");
  if (raw.length > 500) throw new Refusal(400, "too-many-lines", "Send at most 500 events per batch");
  for (const e of raw) validate(cfg, "NormalizedEvent.json", e);
  if (from !== undefined && !(Number.isInteger(from) && (from as number) >= 0)) throw new Refusal(400, "invalid", "events_from must be a whole number");
  const last = (await c.query<{ n: number; o: number | null }>(
    "select coalesce(max(seq), 0)::int as n, max(origin)::int as o from run_events where run_id = $1", [row.id])).rows[0]!;
  let seq = last.n;
  let events = raw as Json[];
  let origin: number | undefined;
  if (from !== undefined) {
    // Keep each daemon event once: drop what an earlier delivery of this batch already recorded.
    const received = last.o === null ? 0 : last.o + 1;
    origin = from as number;
    if (origin < received) {
      events = events.slice(received - origin);
      origin = received;
    } else if (origin > received && seq < MAX_RUN_EVENTS) {
      seq++;
      await c.query("insert into run_events (run_id, seq, body) values ($1, $2, $3)",
        [row.id, seq, { kind: "dropped", at: now(), dropped: origin - received }]);
    }
  }
  for (const e of events) {
    if (seq >= MAX_RUN_EVENTS) {
      if (seq === MAX_RUN_EVENTS) {
        seq++;
        await c.query("insert into run_events (run_id, seq, body) values ($1, $2, $3)",
          [row.id, seq, { kind: "notice", at: now(), text: `This run produced more than ${MAX_RUN_EVENTS} events; later ones are in the raw log only.` }]);
      }
      // Past the cap only the ending is still kept, so a run's story never stops short of it.
      if (e.kind !== "exit") {
        if (origin !== undefined) origin++;
        continue;
      }
    }
    seq++;
    await c.query("insert into run_events (run_id, seq, body, origin) values ($1, $2, $3, $4)", [row.id, seq, e, origin ?? null]);
    if (origin !== undefined) origin++;
    const agent: Actor = { kind: "agent", id: row.body.agent_baseline };
    if (e.kind === "permission_request")
      await appendEvent(c, "run.waiting", row.id, agent, { package: row.package_id, role: row.role, tool: e.tool, summary: e.summary,
        input_digest: e.input_digest, observed: "PermissionRequest hook; print mode refuses the tool, so the run continues without it" });
    if (e.kind === "notice" && typeof e.text === "string" && e.text.startsWith("Breaker"))
      await appendEvent(c, "run.breaker", row.id, agent, { package: row.package_id, role: row.role, text: e.text });
  }
}

/** A run's normalized events after a sequence number, in order (the run story; the raw log is beside it). */
export async function runEvents(db: Db, packageId: string, runId: string, after = 0) {
  const r = await db.query<{ package_id: string }>("select package_id from runs where id = $1", [runId]);
  if (!r.rows[0] || r.rows[0].package_id !== packageId) throw new Refusal(404, "not-found", "No such run");
  const ev = await db.query<{ seq: number; body: Json }>(
    "select seq, body from run_events where run_id = $1 and seq > $2 order by seq limit 2000", [runId, Math.max(0, Math.floor(after))]);
  return { events: ev.rows.map((x) => ({ seq: x.seq, event: x.body })) };
}

/** At most this many lease renewals without a heartbeat; a heartbeat resets the count. */
const MAX_GRACE_RENEWALS = 1;

/** Notes, once the transaction commits, that this controller process issued or renewed a run's lease. */
function issuedLease(c: Tx, cfg: WorkConfig, runId: string): void {
  const sup = cfg.supervision;
  if (!sup) return;
  afterCommit(c, () => (sup.issued ??= new Set()).add(runId));
}

/**
 * Whether a completion proves every process of the run ended: its scope reported empty (cgroup),
 * or no process was started at all. Process group containment, or no proof, does not.
 */
function provesEnded(row: RunRow, body: Json): boolean {
  if (body?.containment === "none") return true;
  const containment = body?.containment ?? row.body.receipt?.containment;
  return containment === "cgroup" && (row.body.receipt?.containment ?? "cgroup") === "cgroup";
}

/**
 * A run that ended without succeeding and without proof that all its processes ended keeps an
 * unknown outcome, so requeue waits for a person to reconcile (a process that left its group may
 * still run). Only a cgroup, or a run that started no process, proves it.
 */
function holdIfUnproven(row: RunRow, finished: Json, body: Json): void {
  if (finished.status === "succeeded" || provesEnded(row, body)) return;
  finished.outcome_unknown = { since: now(), reason: body?.containment === "process-group"
    ? "process group containment cannot prove every process of the run stopped"
    : "the daemon sent no proof that every process of the run stopped" };
}

/** Records the spawn receipt a completion carries, when no log post recorded it first. */
function takeReceipt(cfg: WorkConfig, row: RunRow, finished: Json, body: Json): void {
  if (body?.receipt === undefined) return;
  validate(cfg, "OwnershipReceipt.json", body.receipt);
  if (body.receipt.generation !== (row.body.generation ?? 1)) throw new Refusal(409, "receipt-mismatch", "The spawn receipt names another attempt of this run");
  if (row.body.receipt && !sameReceipt(row.body.receipt, body.receipt)) throw new Refusal(409, "receipt-mismatch", "This run already has a different spawn receipt on record");
  finished.receipt ??= body.receipt;
}

/** Whether two spawn receipts name the same process of the same attempt. */
function sameReceipt(a: Json, b: Json): boolean {
  return a.pid === b.pid && a.pgid === b.pgid && a.process_start === b.process_start && a.boot_id === b.boot_id && a.generation === b.generation
    && a.containment === b.containment && (a.unit ?? null) === (b.unit ?? null);
}

/** The generation fence: refuses a report from an attempt that a later attempt superseded. */
async function requireCurrentGeneration(c: Tx, row: RunRow): Promise<void> {
  const r = await c.query<{ g: number | null }>(
    "select max((body->>'generation')::int) as g from runs where package_id = $1 and package_revision = $2 and role = $3 and round = $4",
    [row.package_id, row.package_revision, row.role, row.round]);
  const newest = r.rows[0]?.g ?? null;
  if (newest !== null && (row.body.generation ?? 1) < newest)
    throw new Refusal(409, "superseded", "A later attempt of this run has started; this attempt can no longer report");
}

/**
 * Settles a run's unknown outcome with its evidence (specification 22). Only an unreconciled hold is
 * settled; the first reconciliation stands. Returns whether this call settled it.
 */
async function reconcileTx(c: Tx, cfg: WorkConfig, row: RunRow, disposition: "completed-late" | "process-gone" | "abandoned", evidence: string, by: Actor): Promise<boolean> {
  const fresh = (await c.query<{ body: Json; status: string }>("select body, status from runs where id = $1", [row.id])).rows[0];
  if (!fresh?.body.outcome_unknown || fresh.body.reconciliation) return false;
  const reconciliation = { disposition, evidence: evidence.slice(0, 2000), recorded_at: now(), by };
  const body = { ...fresh.body, reconciliation };
  validate(cfg, "Run.json", body);
  await c.query("update runs set body = $2 where id = $1", [row.id, body]);
  await appendEvent(c, "run.reconciled", row.id, by, { package: row.package_id, role: row.role, disposition });
  return true;
}

/**
 * A daemon's restart evidence (runner route): from its retained spawn receipt it found the run's
 * process gone, or stopped it after verifying the receipt. A run still marked running is retired
 * as lost and settled at once; a lost run's unknown outcome is settled.
 */
export async function runEvidence(db: Db, cfg: WorkConfig, runId: string, body: Json) {
  if (body?.observation !== "process-gone") throw new Refusal(400, "invalid", "observation must be process-gone");
  validate(cfg, "OwnershipReceipt.json", body?.receipt);
  return command(db, "run.reconcile-evidence", async (c) => {
    await enterScramGate(c);
    const row = await lockRun(c, runId);
    requireLegacyRun(row);
    if (!holdsClaim(row.claim_token_hash, body.claim_token)) throw new Refusal(403, "stale-claim", "This claim token does not hold the run");
    const r = body.receipt as Json;
    if (r.generation !== (row.body.generation ?? 1)) throw new Refusal(409, "receipt-mismatch", "The receipt names another attempt of this run");
    if (row.body.receipt && !sameReceipt(row.body.receipt, r)) throw new Refusal(409, "receipt-mismatch", "The receipt does not match the one on record for this run");
    const agent: Actor = { kind: "agent", id: row.body.agent_baseline };
    // Only a cgroup proves every process of the run gone; process group evidence cannot see a
    // process that left the group, so it is recorded but leaves the outcome unknown for a person.
    const whole = r.containment === "cgroup";
    const evidence = whole
      ? `After a restart the daemon confirmed scope ${String(r.unit ?? "")} empty (leader ${r.pid}, boot ${r.boot_id}), stopping what it held after verifying its receipt. No completion was reported.`
      : `After a restart the daemon found leader ${r.pid} and its process group gone (boot ${r.boot_id}); process group containment cannot see processes that left the group.`;
    if (row.status === "running") {
      const lost = { ...row.body, status: "lost", finished_at: now(), label: "Lost",
        error: "The daemon restarted while this run was running; its process is gone and nothing was reported. It can be requeued.",
        outcome_unknown: { since: now(), reason: "the daemon restarted before the run's completion was reported" } };
      delete lost.lease_expires_at;
      validate(cfg, "Run.json", lost);
      await c.query("update runs set status = 'lost', body = $2 where id = $1", [row.id, lost]);
      await appendEvent(c, "run.lost", row.id, SYSTEM, { package: row.package_id, role: row.role, round: row.round });
      await scramRunEnded(c, row.id);
    }
    if (!whole) {
      await appendEvent(c, "run.evidence", row.id, agent, { package: row.package_id, observation: "process-gone", containment: r.containment, evidence });
      return { run_id: runId, reconciled: false };
    }
    const reconciled = await reconcileTx(c, cfg, row, "process-gone", evidence, agent);
    return { run_id: runId, reconciled };
  });
}

/** What a person signs to settle a run's unknown outcome: the run, its attempt and the reason. */
export async function reconcileSubject(db: Db, user: string, packageId: string, runId: string, reason: unknown) {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) throw new Refusal(400, "reason-required", "Say why the run will not report, for example that its machine was replaced");
  const r = await db.query<RunRow>("select * from runs where id = $1", [runId]);
  const row = r.rows[0];
  if (!row || row.package_id !== packageId) throw new Refusal(404, "not-found", "No such run");
  if (!row.body.outcome_unknown || row.body.reconciliation) throw new Refusal(409, "not-unknown", "This run's outcome is not unknown; there is nothing to reconcile");
  await requireAuthority(db, user, "reconcile", needsOf((await currentPackage(db, packageId))?.body ?? {}));
  return { digest: digest({ act: "reconcile", run_id: runId, generation: row.body.generation ?? 1, reason: why.slice(0, 2000) }), reason: why.slice(0, 2000) };
}

/** A person's signed reconciliation: the run is abandoned, with the reason as evidence. */
export async function reconcileRun(db: Db, cfg: WorkConfig, user: string, packageId: string, runId: string, reason: unknown,
  signed: { subject_digest: string; assertion: Json } | null) {
  return command(db, "run.reconcile", async (c) => {
    if (!signed) throw new Refusal(403, "unsigned", "Reconciling an unknown outcome must be signed with your passkey");
    await lockSigner(c, user, String(signed.assertion.id ?? ""));
    const row = await lockRun(c, runId);
    if (row.package_id !== packageId) throw new Refusal(404, "not-found", "No such run");
    const why = typeof reason === "string" ? reason.trim().slice(0, 2000) : "";
    if (!why) throw new Refusal(400, "reason-required", "Say why the run will not report");
    if (!row.body.outcome_unknown || row.body.reconciliation) throw new Refusal(409, "not-unknown", "This run's outcome is not unknown; there is nothing to reconcile");
    await requireAuthority(c, user, "reconcile", needsOf((await currentPackage(c, packageId))?.body ?? {}));
    const expected = digest({ act: "reconcile", run_id: runId, generation: row.body.generation ?? 1, reason: why });
    if (signed.subject_digest !== expected) throw new Refusal(403, "signature-mismatch", "The signature does not cover this exact reconciliation");
    await reconcileTx(c, cfg, row, "abandoned", `${user} signed that this run will not report: ${why}`, { kind: "human", id: user });
    const after = (await c.query<{ body: Json; status: string }>("select body, status from runs where id = $1", [runId])).rows[0]!;
    return { ...after.body, status: after.status };
  });
}

function holdsClaim(storedHash: string | null, token: unknown): boolean {
  if (!storedHash || typeof token !== "string" || token.length === 0) return false;
  const want = Buffer.from(storedHash, "hex");
  const got = tokenHash(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

// Adding a serialized role must never activate it through legacy fallbacks.
const LEGACY_RUN_ROLES = new Set(["intake", "author", "pre-check"]);
function legacyRun(row: { role: string; body: Json }): boolean {
  return LEGACY_RUN_ROLES.has(row.role) && row.body.role === row.role;
}
function requireLegacyRun(row: { role: string; body: Json }): void {
  if (!legacyRun(row)) throw new Refusal(409,"unsupported-run-role","This run needs its own approved execution and custody path; legacy processing is refused");
}

async function startRun(c: Tx, cfg: WorkConfig, row: Json, runtime: string, baseline: string) {
  requireLegacyRun(row as {role:string;body:Json});
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
    ...(runtime === "claude" ? { permission_waits: "observed" } : runtime === "codex" ? { permission_waits: "not-observable" } : {}),
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
  issuedLease(c, cfg, row.id);
  const job = await buildJob(c, cfg, body, runtime);
  const pin = await activePin(c, runtime, row.role);
  return { ...job, claim: { token, lease_expires_at: lease, heartbeat_seconds: heartbeatSeconds(cfg) },
    ...(pin ? { runtime_pin: { runtime, digest: pin.artifact_digest } } : {}) };
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
  const owner=(await c.query<{package_id:string;role:string}>("select package_id,role from runs where id=$1",[runId])).rows[0];
  if(owner && owner.role!=="intake") await currentPackage(c,owner.package_id,true);
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
export async function runLog(db: Db, cfg: WorkConfig, runId: string, token: unknown, lines: string[], label?: string, receipt?: unknown, events?: unknown, eventsFrom?: unknown) {
  return command(db, "run.log", async (c) => {
    const row = await lockRun(c, runId);
    requireLegacyRun(row);
    if (!holdsClaim(row.claim_token_hash, token)) throw new Refusal(403, "stale-claim", "This claim token does not hold the run");
    if (row.status !== "running") throw new Refusal(409, "not-running", `The run is ${row.status}`);
    await requireCurrentGeneration(c, row);
    if((await c.query("select 1 from runs where id=$1 and (lease_expires_at is null or lease_expires_at<=clock_timestamp())",[runId])).rowCount) {
      const why = await leaseGrace(c, cfg, runId);
      if (!why) throw new Refusal(409,"run-lost","The run lease expired; a late heartbeat cannot revive it");
      await appendEvent(c, "run.lease-renewed", runId, SYSTEM, { package: row.package_id, reason: `the daemon's heartbeat reached a lapsed lease: ${why}` });
    }
    // Refuse, never truncate: a line the server drops after acknowledging it is lost for good.
    if (lines.length > MAX_LOG_LINES) {
      throw new Refusal(400, "too-many-lines", `Send at most ${MAX_LOG_LINES} lines per batch`);
    }
    const lease = leaseFromNow(cfg);
    const body = { ...row.body, lease_expires_at: lease, ...(label ? { label: label.slice(0, LABEL_MAX) } : {}) };
    issuedLease(c, cfg, runId);
    // A heartbeat proves the run alive: the grace bound starts over.
    delete body.grace_renewals;
    if (receipt !== undefined) {
      validate(cfg, "OwnershipReceipt.json", receipt);
      const r = receipt as Json;
      if (r.generation !== (row.body.generation ?? 1)) throw new Refusal(409, "receipt-mismatch", "The spawn receipt names another attempt of this run");
      if (row.body.receipt && !sameReceipt(row.body.receipt, r)) throw new Refusal(409, "receipt-mismatch", "This run already has a different spawn receipt on record");
      if (!row.body.receipt) {
        body.receipt = r;
        await appendEvent(c, "run.receipt", runId, { kind: "agent", id: row.body.agent_baseline }, { pid: r.pid, boot_id: r.boot_id, generation: r.generation });
      }
    }
    validate(cfg, "Run.json", body);
    if (events !== undefined) await recordRunEvents(c, cfg, row, events, eventsFrom);
    await c.query("update runs set log = log || $2::text[], body = $3, lease_expires_at = $4 where id = $1", [
      runId,
      lines.map((l) => l.slice(0, 4000)),
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
 * run becomes lost with an unknown outcome, which holds requeue until it is reconciled
 * (specification 22). Nothing is requeued and nothing is terminated; the sweep records facts.
 *
 * Two rules keep a controller's own absence from looking like dead runs:
 * - a lease this controller process never issued or renewed was granted by an earlier one, so its
 *   lapse may only reflect the restart; it is renewed once instead. So is every lapsed lease after
 *   a gap between sweeps longer than a lease, as when the machine slept;
 * - when more than half of at least three active runs look dead in one pass, that is an outage,
 *   not a fact about the runs: each such run gets one recovery lease and the outage is recorded
 *   once. A run that lapses again after its recovery lease is a fact, so no outage holds a dead
 *   run forever.
 * A heartbeat or completion that reaches a lapsed lease before the sweep does gets the same
 * treatment (leaseGrace), so a live daemon is never stopped by a controller's own restart.
 */
export async function sweepLost(db: Db, cfg: WorkConfig): Promise<string[]> {
  return command(db, "run.sweep-lost", async (c) => {
    // A lost run's unknown outcome blocks a SCRAM restart, so it lands under the gate.
    await enterScramGate(c);
    const sup = cfg.supervision;
    const slept = controllerAbsent(cfg);
    if (sup) {
      const at = Date.now();
      afterCommit(c, () => (sup.lastSweepAt = at));
    }
    const r = await c.query<RunRow & { expired_at: Date }>(
      "select *, lease_expires_at as expired_at from runs where status = 'running' and lease_expires_at < now() order by created_at,id",
    );
    const lost: string[] = [];
    const definite: typeof r.rows = [];
    const doubtful: typeof r.rows = [];
    for (const row of r.rows) {
      // A run already renewed once without a heartbeat gets no more grace, whatever the reason.
      if ((row.body.grace_renewals ?? 0) >= MAX_GRACE_RENEWALS) { definite.push(row); continue; }
      // A run SCRAM told to stop gets no grace: a daemon out of contact for a whole lease counts as
      // stopped with an unknown outcome, which holds restart until it is reconciled.
      if (row.body.scram_id) { definite.push(row); continue; }
      const inherited = sup !== undefined && !sup.issued?.has(row.id);
      if (slept || inherited) {
        await renewLease(c, cfg, row, slept ? "the controller was not sweeping when this lease lapsed" : "this lease was granted before the controller restarted");
        continue;
      }
      doubtful.push(row);
    }
    const active = (await c.query<{ n: number }>("select count(*)::int as n from runs where status = 'running'")).rows[0]?.n ?? 0;
    let candidates = [...definite, ...doubtful];
    // An outage heartbeats already recognized still holds for the sweep, within its window.
    const recognized = sup?.outageUntil !== undefined && Date.now() < sup.outageUntil;
    if (sup && doubtful.length > 0 && ((active >= 3 && doubtful.length * 2 > active) || recognized)) {
      for (const row of doubtful) await renewLease(c, cfg, row, "a recovery lease: most active runs stopped answering at once, which looks like an outage");
      const until = Date.now() + leaseSeconds(cfg) * 1000;
      afterCommit(c, () => (sup.outageUntil = until));
      if (!sup.outage) {
        afterCommit(c, () => (sup.outage = true));
        await appendEvent(c, "runs.sweep-outage", "runs", SYSTEM, { active, looking_dead: doubtful.length });
      }
      candidates = definite;
    } else if (sup) {
      afterCommit(c, () => (sup.outage = false));
    }
    if (sup) {
      // Forget runs that are no longer running, so the set stays the size of the live work.
      if (sup.issued?.size) {
        const live = new Set((await c.query<{ id: string }>("select id from runs where status = 'running'")).rows.map((x) => x.id));
        afterCommit(c, () => { for (const id of sup.issued ?? []) if (!live.has(id)) sup.issued?.delete(id); });
      }
    }
    for (const candidate of candidates) {
      const row=await lockRun(c,candidate.id);
      if(row.status!=="running" || !(await c.query("select 1 from runs where id=$1 and lease_expires_at < now()",[row.id])).rowCount) continue;
      const body = {
        ...row.body,
        status: "lost",
        finished_at: now(),
        label: "Lost",
        error: `Runner lost: no heartbeat from the daemon after ${String(row.body.lease_expires_at ?? "its lease")}. ${legacyRun(row) ? "Its outcome is unknown until the daemon reports what happened or a person reconciles it; then it can be requeued." : "This attempt may have retained proposals or receipts. Review its retained evidence; this role cannot be requeued. A retry requires a new authorized attempt."}`,
        outcome_unknown: { since: now(), reason: "the daemon stopped renewing the lease before the run's exit or completion was seen" },
      };
      delete body.lease_expires_at;
      validate(cfg, "Run.json", body);
      await c.query("update runs set status = 'lost', body = $2 where id = $1", [row.id, body]);
      await appendEvent(c, "run.lost", row.id, SYSTEM, { package: row.package_id, role: row.role, round: row.round });
      await scramRunEnded(c, row.id);
      lost.push(row.id);
    }
    return lost;
  });
}

/** The owner queues a new run in place of a lost, failed or stopped one. Repeating is harmless. */
export async function requeueRun(db: Db, cfg: WorkConfig, user: string, packageId: string, runId: string) {
  return command(db, "run.requeue", async (c) => {
    await enterScramGate(c);
    const row = await lockRun(c, runId);
    requireLegacyRun(row);
    if (row.package_id !== packageId) throw new Refusal(404, "not-found", "No such run");
    if (row.body.requeued_as) {
      const again = await c.query<{ body: Json; status: string }>("select body, status from runs where id = $1", [row.body.requeued_as]);
      if (again.rows[0]) return { ...again.rows[0].body, status: again.rows[0].status };
    }
    if (!["lost", "failed", "stopped"].includes(row.status)) {
      throw new Refusal(409, "not-requeueable", `A ${row.status} run cannot be requeued`);
    }
    if (row.body.outcome_unknown && !row.body.reconciliation)
      throw new Refusal(409, "outcome-unknown", "This run's outcome is unknown: its process may still be running. Reconcile it first");
    await refuseIfScrammed(c, await runSubject(c, row));
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
  return command(db, "run.stop", async (c) => {
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
  requireLegacyRun(row);
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
export async function overrideSubject(db: Db, packageId: string, runId: string, reason: unknown, user?: string) {
  const why = overrideReason(reason);
  const t = await overrideTarget(db, packageId, runId, why);
  // Refused before any passkey prompt when the person could not sign it anyway.
  if (user !== undefined) await requireAuthority(db, user, "override-independence", needsOf(t.pkg.body));
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
  return command(db, "run.override-independence", async (c) => {
    if (signed) await lockSigner(c, user, String(signed.assertion.id ?? ""));
    const { row, pkg, digest: d } = await overrideTarget(c, packageId, runId, why, true);
    await requireAuthority(c, user, "override-independence", needsOf(pkg.body));
    if (signed) await requireHardwareKey(c, String(signed.assertion.id ?? ""), needsOf(pkg.body));
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
    return await command(db, "run.complete", async (c) => {
      // The SCRAM gate before the row lock (the order pulls use), so a pull and this completion
      // cannot interleave.
      await enterScramGate(c);
      const row = await lockRun(c, runId);
      requireLegacyRun(row);
      if (!holdsClaim(row.claim_token_hash, body.claim_token)) throw new Refusal(403, "stale-claim", "This claim token does not hold the run");
      if (row.completion_key !== null) {
        if (row.completion_key === key) return row.receipt;
        throw new Refusal(409, "already-complete", "This run already has a different completion on record");
      }
      if (row.status === "running") await requireCurrentGeneration(c, row);
      if (row.status === "lost" || (row.status==="running" && (await c.query("select 1 from runs where id=$1 and (lease_expires_at is null or lease_expires_at<=clock_timestamp())",[runId])).rowCount && !(await leaseGrace(c, cfg, runId)))) throw new LateCompletion();
      if (row.status !== "running") throw new Refusal(409, "not-running", `The run is ${row.status}`);
      try {
        return await applyCompletion(c, cfg, row, key, body);
      } catch (e) {
        if (e instanceof Refusal) throw new ApplyRefusal(e);
        throw e;
      }
    });
  } catch (e) {
    if (e instanceof ApplyRefusal || e instanceof LateCompletion) {
      if (e instanceof ApplyRefusal) {
        try {
          return await recordRefused(db, cfg, runId, key, body, e.refusal);
        } catch (r) {
          // The run was marked lost between the refused attempt and its record: keep the report
          // through the late path rather than refusing it unread.
          if (!(r instanceof LateCompletion)) throw r;
        }
      }
      await retainLate(db, cfg, runId, key, body);
      throw new Refusal(409, "run-lost", "The lease expired or the run was marked lost before this completion arrived; its digests are on the record");
    }
    throw e;
  }
}

/** Keeps a completion that arrived after its run was lost: retained with its digests, never applied. */
async function retainLate(db: Db, cfg: WorkConfig, runId: string, key: string, body: Json) {
  await command(db, "run.complete", async c=>{
    await enterScramGate(c);
    const row=await lockRun(c,runId);
    if(!holdsClaim(row.claim_token_hash,body.claim_token)) throw new Refusal(403,"stale-claim","This claim token does not hold the run");
    const enrolled=Boolean((await c.query("select 1 from preparation_heads where package_id=$1",[row.package_id])).rowCount);
    // A completion that beats the sweep to an expired run retires it here, so the evidence it
    // carries settles the hold in the same transaction.
    if (row.status === "running") {
      const lostBody = { ...row.body, status: "lost", finished_at: now(), label: "Lost",
        error: "The daemon's completion arrived after the run's lease lapsed; it is retained with its digests and never applied. The run can be requeued.",
        outcome_unknown: { since: now(), reason: "the lease lapsed before the completion arrived" } };
      delete lostBody.lease_expires_at;
      validate(cfg, "Run.json", lostBody);
      await c.query("update runs set status = 'lost', body = $2 where id = $1", [runId, lostBody]);
      await appendEvent(c, "run.lost", runId, SYSTEM, { package: row.package_id, role: row.role, round: row.round });
      await scramRunEnded(c, row.id);
    }
    if (body.events !== undefined) await recordRunEvents(c, cfg, row, body.events, body.events_from);
    const fresh=await quarantineCompletion(c,runId,key,body,"run-lost");
    if ((await adoptHeldRun(c, row, { evenLifted: true })).associated) await quarantineScramCompletion(c, runId, key, body);
    // A late completion settles the hold only when a cgroup proved the whole run stopped; under
    // process group containment a process that left the group may still run.
    if (provesEnded(row, body))
      await reconcileTx(c, cfg, row, "completed-late", `The daemon's completion (${String(body.status ?? "unknown")}) arrived after the run was marked lost; it is retained with its digests and never applied.`, { kind: "agent", id: row.body.agent_baseline });
    if(!enrolled || fresh) await appendEvent(c,"run.late-completion",runId,SYSTEM,{outputs:(Array.isArray(body.outputs)?body.outputs:[]).slice(0,200).map((o:Json)=>({name:String(o?.name??"").slice(0,200),sha256:sha256(Buffer.from(String(o?.content_base64??""),"base64"))}))});
  });
}

async function applyCompletion(c: Tx, cfg: WorkConfig, row: RunRow, key: string, body: Json) {
  requireLegacyRun(row);
  // A run SCRAM stopped reports into quarantine: retained privately with its digests, never applied.
  if (row.body.scram_id || (await scramHolding(c, await runSubject(c, row)))) throw new Refusal(409, "scram-quarantined", `SCRAM ${String(row.body.scram_id)} stopped this run; what it reported is quarantined for review`);
  if(row.body.stop_requested_at && (body.status==="succeeded" || row.body.preparation_manifest_digest)) throw new Refusal(409,"stopped","The owner stopped this run; its output cannot advance the package");
  if(row.role!=="intake") {
    const pkg=await currentPackage(c,row.package_id,true);
    if(row.body.preparation_manifest_digest && (!pkg || pkg.revision!==row.package_revision)) throw new Refusal(409,"preparation-stale","Run belongs to a superseded preparation basis");
    if(pkg) await preparedExecutionGuard(c,cfg,pkg,row.body);
  }
  if(row.role!=="pre-check" && body.criterion_results!==undefined) throw new Refusal(403,"criterion-role","Only the assigned checker can submit criterion results");
  const runId = row.id;
  const agent: Actor = { kind: "agent", id: row.body.agent_baseline };
  const outputs: Output[] = [];
  for (const o of body.outputs ?? []) {
    if (typeof o.name !== "string" || !SAFE_OUTPUT.test(o.name) || o.name.includes("..")) {
      throw new Refusal(400, "invalid", "An output name is not a plain relative path");
    }
    if(outputs.some(v=>v.name===o.name)) throw new Refusal(400,"duplicate-output","Output names must be unique");
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
  takeReceipt(cfg, row, finished, body);
  holdIfUnproven(row, finished, body);
  validate(cfg, "Run.json", finished);
  // Events the last log post could not deliver arrive with the completion.
  if (body.events !== undefined) await recordRunEvents(c, cfg, row, body.events, body.events_from);
  await c.query("update runs set status = $2, body = $3 where id = $1", [runId, finished.status, finished]);
  for (const o of outputs) {
    await c.query(
      "insert into outputs (run_id, package_id, package_revision, name, sha256, bytes) values ($1, $2, $3, $4, $5, $6)",
      [runId, row.package_id, row.package_revision, o.name, sha256(o.bytes), o.bytes],
    );
  }
  // New author output is content no declassification has seen: any earlier one stops applying.
  if (row.role === "author" && outputs.length > 0) await endOverride(c, "package", row.package_id, `new author output from run ${runId}`);
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
    else if(row.role === "pre-check") await finishPreCheck(c, cfg, row, body, outputs, agent);
    else throw new Refusal(409,"unsupported-run-role","Unsupported completion role");
  }
  const receipt = receiptOf(runId, key, finished.status, outputs);
  await c.query("update runs set completion_key = $2, receipt = $3 where id = $1", [runId, key, receipt]);
  return receipt;
}

/** Applying a completion was refused: the run ends failed with the refusal as its reason. */
async function recordRefused(db: Db, cfg: WorkConfig, runId: string, key: string, body: Json, given: Refusal) {
  return command(db, "run.record-refused", async (c) => {
    await enterScramGate(c);
    const row = await lockRun(c, runId);
    // SCRAM may have reached the run after the refused attempt rolled back, or may hold its work
    // although it was lost before the pull: the locked row and the current state decide.
    if (row.status === "lost" && row.completion_key === null && holdsClaim(row.claim_token_hash, body.claim_token)) throw new LateCompletion();
    const adopted = await adoptHeldRun(c, row, { evenLifted: true });
    const scrammed = adopted.held;
    const refusal = scrammed && given.code !== "scram-quarantined"
      ? new Refusal(409, "scram-quarantined", `SCRAM ${String(row.body.scram_id)} stopped this run; what it reported is quarantined for review`)
      : given;
    requireLegacyRun(row);
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
    const status=refusal.code==="stopped"||refusal.code==="scram-quarantined"?"stopped":"failed";
    finished.status=status;
    if (refusal.code === "scram-quarantined") finished.label = "Quarantined";
    holdIfUnproven(row, finished, body);
    if (body.events !== undefined) await recordRunEvents(c, cfg, row, body.events, body.events_from);
    await quarantineCompletion(c,runId,key,body,refusal.code);
    if (adopted.associated) await quarantineScramCompletion(c, runId, key, body);
    const receipt = receiptOf(runId, key, status, [], refusal);
    await c.query("update runs set status = $5, body = $2, completion_key = $3, receipt = $4 where id = $1", [
      runId,
      finished,
      key,
      receipt,
      status,
    ]);
    await appendEvent(c, `run.${status}`, runId, SYSTEM, {
      package: row.package_id,
      role: row.role,
      round: row.round,
      refused: refusal.code,
      reason: refusal.message,
    });
    await scramRunEnded(c, row.id);
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
  // The whole capture id, so two requests never map a stable local id to the same package.
  const prefix = capture.id.slice(2).toUpperCase();
  const idMap = new Map<string, string>();
  for (const d of drafts) idMap.set(String(d.id), `${prefix}-${String(d.id).replace(/[^A-Za-z0-9-]/g, "").slice(0, 40)}`);
  const created: string[] = [];
  // Packages drafted together may depend on each other: insert each after the ones it waits for.
  const ordered: Json[] = [];
  const placing = new Set<string>();
  const place = (d: Json) => {
    const local = String(d.id);
    if (ordered.includes(d)) return;
    if (placing.has(local)) throw new Refusal(400, "invalid-dependency", "Packages drafted together cannot wait on each other");
    placing.add(local);
    for (const dep of d.depends_on ?? []) {
      const other = drafts.find((x: Json) => String(x.id) === String(dep?.package_id));
      if (other) place(other);
    }
    placing.delete(local);
    ordered.push(d);
  };
  for (const d of drafts) place(d);
  for (const d of ordered) {
    const pkg = {
      ...d,
      schema_version: "0.1.0",
      id: idMap.get(String(d.id)),
      revision: 0,
      status: "draft",
      design_inputs: (d.design_inputs ?? []).map((x: Json) => (idMap.has(x.doc) ? { ...x, doc: idMap.get(x.doc) } : x)),
      ...(Array.isArray(d.depends_on)
        ? { depends_on: d.depends_on.map((x: Json) => (idMap.has(String(x?.package_id)) ? { ...x, package_id: idMap.get(String(x.package_id)) } : x)) }
        : {}),
      agent_assignment: [{ role: String(d.agent_assignment?.[0]?.role ?? "general-author").slice(0, 60), agent_baseline: "author", baseline_revision: 0 }],
      verification: {
        method: "agent-pre-check",
        verifier: "checker",
        verifier_receives: ["deliverables", "acceptance criteria", "design inputs"],
        required_custody: { decisive_evidence_generated_by: "verifier", preparer_may_present: false },
      },
    };
    // An agent never lowers a lane: a package is at least as sensitive as the request it came from.
    const capLane = await laneOf(c, "capture", capture.id, capture.lane);
    if (capLane && isLane(pkg.data_lane) && !covers(pkg.data_lane, capLane)) pkg.data_lane = capLane;
    validate(cfg, "WorkPackage.json", pkg);
    await checkDependsOn(c, String(pkg.id), pkg);
    await c.query("insert into packages (id, revision, status, capture_id, body) values ($1, 0, 'draft', $2, $3)", [pkg.id, capture.id, pkg])
      .catch((e) => { throw dependencyRefusal(e); });
    await markObject(c, "package", String(pkg.id), pkg.data_lane, `drafted by intake from capture ${capture.id}`, await packageInputs(c, pkg, capture.id));
    await appendEvent(c, "package.drafted", pkg.id, agent, { capture: capture.id });
    if(cfg.guidedPreparation) await enrollPreparationTx(c,cfg,SYSTEM,pkg.id as string,{package_revision:0,idempotency_key:`intake-${capture.id}-${pkg.id}`});
    created.push(pkg.id as string);
  }
  const updated = { ...capture, disposition: "package", package_id: created[0] };
  validate(cfg, "Capture.json", updated);
  await c.query("update captures set body = $2 where id = $1", [capture.id, updated]);
}

async function finishAuthor(c: Tx, cfg: WorkConfig, row: Json, agent: Actor) {
  const pkg = await currentPackage(c, row.package_id, true);
  if (!pkg || pkg.revision !== row.package_revision) return;
  const preparation=await preparedExecutionGuard(c,cfg,pkg,row.body);
  const next = kernel(decide({ status: pkg.status, action: "submit-output", actor_kind: "agent", actor_id: agent.id, ...(preparation?{preparation}:{}) }), "submit output");
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
  const preparation=await preparedExecutionGuard(c,cfg,pkg,row.body);
  const suppliedEvidence = raw.evidence;
  if (suppliedEvidence !== undefined && !Array.isArray(suppliedEvidence)) {
    throw new Refusal(400, "invalid", "Pre-check evidence must be an array");
  }
  if (Array.isArray(suppliedEvidence)) {
    for (const item of suppliedEvidence) validate(cfg, "EvidenceItem.json", item);
  }
  const authorOutputs = author ? await outputsOf(c, author.id) : [];
  const authorRuntime = identityOf(author?.body, author?.body.trace);
  const checkerRuntime = identityOf(row.body, body.trace);
  const sharedRuntime = mayBeSameRuntime(authorRuntime, checkerRuntime);
  const override = verifiedOverride(row.body) ? row.body.independence_override : undefined;
  const asRef = (r: Json, id: RuntimeIdentity): NonNullable<VerificationRecord["independence"]>["author_runtime"] => {
    const kind=String(r?.runtime?.kind ?? "local");
    if(kind!=="local" && kind!=="subscription" && kind!=="account") throw new Refusal(400,"invalid-runtime","Unknown runtime kind");
    return {kind,provider:id.provider || "unknown",model:id.model};
  };
  const record: VerificationRecord = {
    schema_version: "0.1.0",
    package_id: pkg.id,
    package_revision: pkg.revision,
    output: {
      path: authorOutputs.map((o) => o.name).join(", ") || "(none)",
      digest: { algorithm: "sha256", value: digest(authorOutputs.map((o) => ({ name: o.name, sha256: o.sha256 }))) },
    },
    method: "agent-pre-check",
    verifier: agent.id,
    evidence: suppliedEvidence?.length ? suppliedEvidence : [
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
  const admitted=preparation?await prepareCriterionResults(c,cfg,row,record,body,outputs,sharedRuntime):null;
  if(admitted) record.evidence=admitted.evidence;
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
      ...(preparation?{preparation}:{}),
    }),
    "pre-check",
  );
  await c.query(
    "insert into verifications (run_id, package_id, package_revision, round, body) values ($1, $2, $3, $4, $5)",
    [row.id, pkg.id, pkg.revision, row.round, record],
  );
  if(admitted) await persistCriterionResults(c,cfg,row,admitted.submission,record);
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
      decide({ status: pkg.status, action: "revise", actor_kind: "agent", actor_id: author?.body.agent_baseline ?? "author", pre_check: record.outcome, ...(preparation?{preparation}:{}) }),
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

export async function decisionSubject(db: Db, id: string, kind: string, revision: number, cfg?: WorkConfig, user?: string) {
  if (!(kind in HUMAN_ACTIONS)) throw new Refusal(400, "invalid", "Unknown decision");
  const pkg = await currentPackage(db, id);
  if (!pkg) throw new Refusal(404, "not-found", "No such package");
  if (pkg.revision !== revision) throw new Refusal(409, "stale", "That revision is no longer current");
  if (user !== undefined) await requireAuthority(db, user, kind as SignerAction, needsOf(pkg.body));
  const s=await subjectOf(db,pkg);
  if(kind==="release" && s.preparation) {
    if(!cfg) throw new Refusal(409,"prepared-release-disabled","Prepared release is disabled");
    await preparedReleaseGuard(db,cfg,pkg,s.preparation);
  }
  if(s.preparation && (kind==="accept" || kind==="accept-with-findings") && cfg) await readTx(db,c=>preparedAcceptanceGuard(c,cfg,pkg,s.author,s.verification,false));
  return {pkg,...s};
}

/** The preparation facts the kernel weighs for a decision on a prepared package; undefined for a legacy one. */
async function decisionPreparation(c: Tx, cfg: WorkConfig, pkg: PackageRow, s: Awaited<ReturnType<typeof subjectOf>>, kind: string, lock: boolean) {
  if (!s.preparation) return undefined;
  if (kind === "release") return preparedReleaseGuard(c, cfg, pkg, s.preparation);
  if (kind === "accept" || kind === "accept-with-findings") return preparedAcceptanceGuard(c, cfg, pkg, s.author, s.verification, lock);
  return { requirements_confirmed: Boolean(s.preparation.confirmation), ready_for_release: false, basis_current: false, manifest_matches: false,
    results_complete: false, required_checks_complete: false, results_pass: false };
}

const DECISION_LABELS: Record<string, string> = {
  release: "Release", accept: "Accept", "accept-with-findings": "Accept with findings", return: "Return for revision", reject: "Reject",
};

/**
 * What the viewing person can do with a package now (specification 5.7 ActionDescriptor; plan task
 * 1.11): each decision allowed or refused, with the reason in words, what would change it, how it is
 * signed and the qualifications it needs. The kernel is asked as if the person had signed, so the
 * answer is exactly what a signed request would get; nothing is written.
 */
export async function packageActions(db: Db, cfg: WorkConfig, user: string, id: string) {
  return readTx(db, async (c) => {
    const pkg = await currentPackage(c, id);
    if (!pkg) throw new Refusal(404, "not-found", "No such package");
    const s = await subjectOf(c, pkg);
    const out: Json[] = [];
    const refused = (base: Json, code: string, message?: string) => {
      const t = teach(code);
      return { ...base, allowed: false, reason_code: code, reason: message ?? t.sentence, change: t.change, ...(t.floor ? { floor: true } : {}) };
    };
    const preparing = (await c.query("select 1 from preparation_heads where package_id = $1", [id])).rowCount;
    const edit = { command: "draft.edit", label: "Edit draft", signature: "none" };
    out.push(pkg.status !== "draft" ? refused(edit, "wrong-state", "Only a draft can be edited")
      : preparing ? refused(edit, "preparation-edit-required") : { ...edit, allowed: true });
    // While SCRAM holds the package, release is refused exactly as submitting it would be.
    const scram = await scramHolding(c, { kind: "package", id: pkg.id, ...(pkg.body.discipline ? { discipline: String(pkg.body.discipline) } : {}) });
    for (const kind of Object.keys(HUMAN_ACTIONS)) {
      const base = { command: kind, label: DECISION_LABELS[kind], signature: "direct", authority: ACTION_ROLES[kind as SignerAction] };
      if (kind === "release" && scram) {
        out.push(refused(base, "scram-stopped", `SCRAM ${scram.id} has stopped this work: ${scram.reason}`));
        continue;
      }
      const missing = await signingGaps(c, user, kind as SignerAction, needsOf(pkg.body));
      if (missing.length) {
        out.push({ ...refused(base, "qualification-missing", `This needs ${missing.join(" and ")}, which your qualification does not include`), missing });
        continue;
      }
      if (highConsequence(needsOf(pkg.body)) && !(await holdsHardwareKey(c, user))) {
        out.push({ ...refused(base, "hardware-key-required"), missing: ["an attested hardware key"] });
        continue;
      }
      let preparation;
      try {
        preparation = await decisionPreparation(c, cfg, pkg, s, kind, false);
      } catch (e) {
        if (e instanceof Refusal) { out.push(refused(base, e.code, e.message)); continue; }
        throw e;
      }
      const outcome = decide({
        status: pkg.status, action: HUMAN_ACTIONS[kind]!, actor_kind: "human", actor_id: user, author_baseline: s.author?.body.agent_baseline,
        pre_check: s.verification?.outcome, assertion_verified: true, digest_matches: true, reason_given: true, ...(preparation ? { preparation } : {}),
      });
      out.push(outcome.allowed ? { ...base, allowed: true } : refused(base, outcome.reason));
    }
    return out;
  });
}

/** Applies a person's decision. The assertion was verified by the caller against the stored challenge. */
export async function applyDecision(
  db: Db,
  cfg: WorkConfig,
  user: string,
  id: string,
  req: { kind: string; package_revision: number; reason?: string },
  signed: { subject_digest: string; assertion: Json; nonce?: string } | null,
) {
  return command(db, "decision.apply", async (c) => {
    // Lock order everywhere: marking (the executor), administration, the SCRAM gate, then rows.
    if (signed) await lockSigner(c, user, String(signed.assertion.id ?? ""));
    if (req.kind === "release") await enterScramGate(c);
    const pkg = await currentPackage(c, id, true);
    if (!pkg) throw new Refusal(404, "not-found", "No such package");
    if (pkg.revision !== req.package_revision) throw new Refusal(409, "stale", "That revision is no longer current");
    if (!(req.kind in HUMAN_ACTIONS)) throw new Refusal(400, "invalid", "Unknown decision");
    if (req.kind === "release") await refuseIfScrammed(c, { kind: "package", id: pkg.id, ...(pkg.body.discipline ? { discipline: String(pkg.body.discipline) } : {}) });
    // Authority is read inside the writer transaction, so a revocation that lands first is honored.
    await requireAuthority(c, user, req.kind as SignerAction, needsOf(pkg.body));
    if (signed) await requireHardwareKey(c, String(signed.assertion.id ?? ""), needsOf(pkg.body));
    const s = await subjectOf(c, pkg);
    const preparation = await decisionPreparation(c, cfg, pkg, s, req.kind, true);
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
      ...(preparation?{preparation}:{}),
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
      ...(signed?.nonce ? { challenge_nonce: signed.nonce } : {}),
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
    if(req.kind==="release" && s.preparation) await persistReleaseManifest(c,cfg,s.preparation,decision.id);
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
      await advancePreparationRevision(c,cfg,user,pkg,body);
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
          detail: last.body.outcome_unknown && !last.body.reconciliation
            ? `${last.body.role === "pre-check" ? "Pre-check" : "Author"} run lost: the daemon stopped answering and its outcome is unknown. Restart the daemon so it can report, or reconcile the run; then requeue it.`
            : `${last.body.role === "pre-check" ? "Pre-check" : "Author"} run lost: the daemon stopped answering. Requeue it, or return or reject the package.`,
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
  const r = await db.query<{ body: Json; run_id: string | null; run_status: string | null; run_body: Json | null }>(
    `select c.body, r.id as run_id, r.status as run_status, r.body as run_body
       from captures c
       left join lateral (
         select id, status, body from runs
          where package_id = c.id and role = 'intake'
          order by created_at desc, id desc limit 1
       ) r on true
      order by c.created_at desc limit 200`,
  );
  const links=await db.query<{capture_id:string;id:string}>("select distinct capture_id,id from packages where capture_id=any($1::text[]) order by id",[r.rows.map(x=>x.body.id)]);
  const marked = await db.query<{ id: string; lane: DataLane }>(
    `select distinct on (object_id) object_id as id, coalesce(body->>'effective_lane', body->>'lane') as lane
       from object_markings where object_kind = 'capture' and object_id = any($1::text[]) order by object_id, version desc`,
    [r.rows.map((x) => x.body.id)]);
  const lanes = new Map<string, DataLane>(marked.rows.map((m) => [m.id, m.lane]));
  for (const x of r.rows) if (!lanes.has(x.body.id) && isLane(x.body.lane)) lanes.set(x.body.id, x.body.lane);
  return r.rows.map((x) => {
    const package_ids=links.rows.filter(p=>p.capture_id===x.body.id).map(p=>p.id);
    const lane = lanes.get(x.body.id);
    const base={...x.body,...(package_ids.length?{package_ids}:{}),...(lane?{effective_lane:lane}:{})};
    // Only a pending capture carries its intake state; an answered or packaged one is done.
    if (x.body.disposition !== "pending" || !x.run_id || !x.run_status) return base;
    const error = typeof x.run_body?.error === "string" ? x.run_body.error : undefined;
    return { ...base, intake: { run_id: x.run_id, status: x.run_status, ...(error ? { error } : {}) } };
  });
}

/* ---------- runtime readiness ---------- */

const KNOWN_RUNTIMES = ["claude", "codex", "fake"];

export interface RuntimeStatus {
  runtime: string;
  ready: boolean;
  version?: string;
  reason?: string;
  login_checked: boolean;
  artifact?: ProbeArtifact;
}

function validArtifact(a: Json): boolean {
  return Boolean(a && typeof a.path === "string" && a.digest?.algorithm === "sha256" && /^[0-9a-f]{64}$/.test(String(a.digest?.value)));
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
      ...(validArtifact(x.artifact) ? { artifact: { path: String(x.artifact.path).slice(0, 4096), digest: { algorithm: "sha256" as const, value: x.artifact.digest.value } } } : {}),
    });
  }
  const value = JSON.stringify({ reported_at: now(), runtimes: list });
  await command(db, "runtime.report-status", async (c) => {
    await c.query("insert into settings (key, value) values ('runtime_status', $1) on conflict (key) do update set value = excluded.value", [value]);
    await recordProbes(c, list);
  });
  return list;
}

export async function runtimeStatus(db: Db): Promise<{ reported_at?: string; runtimes: RuntimeStatus[]; pins: Json[] }> {
  const r = await db.query<{ value: string }>("select value from settings where key = 'runtime_status'");
  // The active pins beside what the daemon found, so the roster shows both.
  const pins = (await db.query<{ body: Json }>("select body from runtime_pins where body->>'status' = 'active' order by body->>'runtime', body->>'role'")).rows.map((x) => x.body);
  if (!r.rows[0]) return { runtimes: [], pins };
  return { ...(JSON.parse(r.rows[0].value) as { reported_at?: string; runtimes: RuntimeStatus[] }), pins };
}
