import { randomUUID } from "node:crypto";
import type { Ajv2020 } from "ajv/dist/2020.js";
import type { Db, Tx } from "./db/index.js";
import { type Actor, appendEvent } from "./events.js";
import { digest } from "./kernel.js";
import { Refusal } from "./refusal.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;
type Q = Db | Tx;

/**
 * A fail sticks to the deliverable digest. Another check of that digest is refused until the
 * deliverable changes or the owner signs one override, which pays for one check.
 */
export const STICKY_FAIL_REASON =
  "A check of this deliverable already failed. Another check of the same deliverable is refused until the author revises it, or the owner signs an override with a reason.";
export const STICKY_FAIL_CHANGE =
  "Revise the deliverable so its digest changes, or sign an override that says why this same deliverable may be checked again.";

const SYSTEM: Actor = { kind: "system", id: "control-plane" };
const now = () => new Date().toISOString();

function validate(ajv: Ajv2020, schema: string, value: unknown): void {
  const v = ajv.getSchema(schema);
  if (!v) throw new Error(`schema ${schema} not loaded`);
  if (!v(value)) {
    const first = v.errors?.[0];
    throw new Refusal(400, "invalid", `${schema}: ${first?.instancePath ?? ""} ${first?.message ?? "invalid"}`);
  }
}

/** Digest of author deliverables: name and sha256, in name order. The same value a verification records. */
export function deliverableDigest(outputs: { name: string; sha256: string }[]): string {
  return digest(outputs.map((o) => ({ name: o.name, sha256: o.sha256 })));
}

/**
 * A checker verdict stands only when the run succeeded and admitted one.
 * Anything else (timeout, error, quota, cancelled, a lost run) counts as inconclusive, never as pass.
 */
export function classifyCheckerOutcome(
  status: string,
  error: string | undefined,
  verdict: string | undefined,
): { outcome: "pass" | "fail" | "inconclusive" | "timeout" | "error" | "quota" | "cancelled"; counts_as: "pass" | "fail" | "inconclusive" } {
  if (status === "succeeded" && (verdict === "pass" || verdict === "fail" || verdict === "inconclusive")) {
    return { outcome: verdict, counts_as: verdict === "inconclusive" ? "inconclusive" : verdict };
  }
  const text = (error ?? "").toLowerCase();
  if (status === "stopped" || text.includes("cancel")) return { outcome: "cancelled", counts_as: "inconclusive" };
  if (text.includes("timeout")) return { outcome: "timeout", counts_as: "inconclusive" };
  if (/quota|rate limit|rate-limit|too many requests|\b429\b/.test(text)) return { outcome: "quota", counts_as: "inconclusive" };
  return { outcome: "error", counts_as: "inconclusive" };
}

function checkerRuntime(run: Json): string {
  const p = String(run?.runtime?.provider ?? "").trim().toLowerCase();
  if (!p || p === "any") return "unassigned";
  if (p === "anthropic" || p === "claude" || p === "claude-code") return "claude";
  if (p === "openai" || p === "codex") return "codex";
  return p.slice(0, 80);
}

/** The latest succeeded author run on this revision, and the digest of its deliverables. */
export async function currentDeliverable(q: Q, packageId: string, revision: number): Promise<{ runId: string; round: number; digest: string } | null> {
  const r = await q.query<{ id: string; round: number }>(
    `select id, round from runs
      where package_id = $1 and package_revision = $2 and role = 'author' and status = 'succeeded'
      order by round desc, created_at desc limit 1`,
    [packageId, revision],
  );
  const row = r.rows[0];
  if (!row) return null;
  const outs = await q.query<{ name: string; sha256: string }>("select name, sha256 from outputs where run_id = $1 order by name", [row.id]);
  return { runId: row.id, round: row.round, digest: deliverableDigest(outs.rows) };
}

export async function hasStickyFail(q: Q, packageId: string, deliverable: string): Promise<boolean> {
  const r = await q.query(
    `select 1 from checker_attempts
      where package_id = $1 and body->'deliverable_digest'->>'value' = $2 and body->>'counts_as' = 'fail'
      limit 1`,
    [packageId, deliverable],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function hasUnconsumedOverride(q: Q, packageId: string, deliverable: string): Promise<boolean> {
  const r = await q.query(
    `select 1 from checker_recheck_overrides o
      where o.package_id = $1 and o.deliverable_digest = $2
        and not exists (select 1 from checker_recheck_uses u where u.override_id = o.id)
      limit 1`,
    [packageId, deliverable],
  );
  return (r.rowCount ?? 0) > 0;
}

/** The oldest unused override for this digest, locked so two checks cannot spend it. */
export async function lockNextOverride(c: Tx, packageId: string, deliverable: string): Promise<{ id: string; body: Json } | null> {
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`recheck-override:${packageId}`]);
  const r = await c.query<{ id: string; body: Json }>(
    `select id, body from checker_recheck_overrides o
      where package_id = $1 and deliverable_digest = $2
        and not exists (select 1 from checker_recheck_uses u where u.override_id = o.id)
      order by created_at, id
      limit 1
      for update`,
    [packageId, deliverable],
  );
  return r.rows[0] ?? null;
}

export async function consumeOverride(c: Tx, overrideId: string, runId: string): Promise<void> {
  await c.query("insert into checker_recheck_uses (override_id, run_id) values ($1, $2)", [overrideId, runId]);
}

/**
 * Why a check of the current deliverable cannot start. Null when one may start, or one is already queued.
 */
export async function checkBlocked(q: Q, packageId: string, revision: number): Promise<Json | null> {
  const current = await currentDeliverable(q, packageId, revision);
  if (!current || !(await hasStickyFail(q, packageId, current.digest))) return null;
  const live = await q.query(
    "select 1 from runs where package_id = $1 and package_revision = $2 and role = 'pre-check' and status in ('queued', 'running') limit 1",
    [packageId, revision],
  );
  if ((live.rowCount ?? 0) > 0) return null;
  if (await hasUnconsumedOverride(q, packageId, current.digest)) return null;
  return {
    code: "sticky-fail",
    reason: STICKY_FAIL_REASON,
    change: STICKY_FAIL_CHANGE,
    deliverable_digest: { algorithm: "sha256", value: current.digest },
  };
}

/** The latest pass or fail on this digest. A later inconclusive attempt does not replace it. */
export async function governingVerification(q: Q, packageId: string, revision: number, deliverable: string): Promise<Json | null> {
  const rows = await q.query<{ body: Json }>(
    `select body from checker_attempts
      where package_id = $1 and package_revision = $2 and body->'deliverable_digest'->>'value' = $3
      order by seq`,
    [packageId, revision, deliverable],
  );
  let decisive: Json | null = null;
  for (const row of rows.rows) {
    if (row.body.counts_as === "pass" || row.body.counts_as === "fail") decisive = row.body;
  }
  const runId = decisive?.verification_run_id;
  if (typeof runId !== "string") return null;
  const v = await q.query<{ body: Json }>("select body from verifications where run_id = $1", [runId]);
  return v.rows[0]?.body ?? null;
}

export async function listCheckerAttempts(q: Q, packageId: string): Promise<Json[]> {
  const r = await q.query<{ body: Json }>("select body from checker_attempts where package_id = $1 order by seq", [packageId]);
  return r.rows.map((row) => row.body);
}

export async function listRecheckOverrides(q: Q, packageId: string): Promise<Json[]> {
  const r = await q.query<{ id: string; package_id: string; package_revision: number; deliverable_digest: string; body: Json }>(
    "select id, package_id, package_revision, deliverable_digest, body from checker_recheck_overrides where package_id = $1 order by created_at, id",
    [packageId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    package_id: row.package_id,
    package_revision: row.package_revision,
    deliverable_digest: { algorithm: "sha256", value: row.deliverable_digest },
    override: row.body,
  }));
}

export async function insertRecheckOverride(
  c: Tx,
  ajv: Ajv2020,
  row: { id: string; packageId: string; revision: number; digest: string; override: Json },
): Promise<Json> {
  validate(ajv, "OwnerOverride.json", row.override);
  await c.query(
    "insert into checker_recheck_overrides (id, package_id, package_revision, deliverable_digest, body) values ($1, $2, $3, $4, $5)",
    [row.id, row.packageId, row.revision, row.digest, row.override],
  );
  return {
    id: row.id,
    package_id: row.packageId,
    package_revision: row.revision,
    deliverable_digest: { algorithm: "sha256", value: row.digest },
    override: row.override,
  };
}

/**
 * Records one checker attempt. A second call for the same run does nothing, so a late report
 * cannot add a second row or replace the first.
 */
export async function recordCheckerAttempt(
  c: Tx,
  ajv: Ajv2020,
  run: { id: string; package_id: string; package_revision: number; role: string; round: number; status: string; body: Json },
): Promise<void> {
  if (run.role !== "pre-check") return;
  if ((await c.query("select 1 from checker_attempts where run_id = $1", [run.id])).rowCount) return;
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`checker-attempt:${run.package_id}`]);
  const verification = await c.query<{ body: Json }>("select body from verifications where run_id = $1", [run.id]);
  const verdict = verification.rows[0]?.body?.outcome as string | undefined;
  const classified = classifyCheckerOutcome(run.status, typeof run.body.error === "string" ? run.body.error : undefined, verdict);
  const current = await currentDeliverable(c, run.package_id, run.package_revision);
  const fromRecord = verification.rows[0]?.body?.output?.digest?.value;
  const deliverable = typeof fromRecord === "string" ? fromRecord : (current?.digest ?? deliverableDigest([]));
  const reported = String(run.body.trace?.reported_model ?? "").slice(0, 200);
  const use = await c.query<{ body: Json }>(
    `select o.body from checker_recheck_uses u
      join checker_recheck_overrides o on o.id = u.override_id
      where u.run_id = $1`,
    [run.id],
  );
  const seq = ((await c.query<{ n: number }>("select coalesce(max(seq), 0)::int as n from checker_attempts where package_id = $1", [run.package_id])).rows[0]?.n ?? 0) + 1;
  const attempt: Json = {
    schema_version: "0.1.0",
    id: `CA-${randomUUID().slice(0, 8)}`,
    package_id: run.package_id,
    package_revision: run.package_revision,
    run_id: run.id,
    round: run.round,
    checker_runtime: checkerRuntime(run.body),
    ...(reported ? { reported_model: reported } : {}),
    deliverable_digest: { algorithm: "sha256", value: deliverable },
    outcome: classified.outcome,
    counts_as: classified.counts_as,
    started_at: String(run.body.started_at ?? run.body.queued_at ?? now()),
    finished_at: String(run.body.finished_at ?? now()),
    evidence: `/packages/${run.package_id}/runs/${run.id}/log`,
    ...(verification.rows[0] ? { verification_run_id: run.id } : {}),
    ...(use.rows[0] ? { recheck_override: use.rows[0].body } : {}),
  };
  validate(ajv, "CheckerAttempt.json", attempt);
  await c.query(
    "insert into checker_attempts (id, package_id, package_revision, run_id, seq, body) values ($1, $2, $3, $4, $5, $6)",
    [attempt.id, run.package_id, run.package_revision, run.id, seq, attempt],
  );
  await appendEvent(c, "package.checker-attempt", run.package_id, SYSTEM, {
    attempt: attempt.id,
    run_id: run.id,
    revision: run.package_revision,
    round: run.round,
    outcome: attempt.outcome,
    counts_as: attempt.counts_as,
    deliverable_digest: deliverable,
    checker_runtime: attempt.checker_runtime,
    ...(reported ? { reported_model: reported } : {}),
    evidence: attempt.evidence,
  });
}
