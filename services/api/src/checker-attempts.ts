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

/** PostgreSQL SQLSTATE. A Refusal code is a word, so it does not match, and the transaction is still open. */
function isDatabaseError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
}

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

type Decisive = { outcome: "pass" | "fail"; revision: number; runId: string | null; overrideUse: boolean; at: string; seq: number };

/**
 * The decisive result for this digest. Fails stick across revisions. A pass counts only for the
 * revision asked, and a pass supersedes an earlier fail only when that attempt spent a recheck override.
 * Inconclusive never becomes the result while a pass or a fail exists.
 */
export async function governingDecisive(q: Q, packageId: string, revision: number, deliverable: string): Promise<Decisive | null> {
  const attempts = await q.query<{ body: Json; seq: number; created_at: Date; used: boolean }>(
    `select a.body, a.seq, a.created_at, exists(select 1 from checker_recheck_uses u where u.run_id = a.run_id) as used
       from checker_attempts a
      where a.package_id = $1 and a.body->'deliverable_digest'->>'value' = $2 and a.body->>'digest_unknown' is distinct from 'true'
      order by a.seq`,
    [packageId, deliverable],
  );
  const legacy = await q.query<{ body: Json; run_id: string; package_revision: number; created_at: Date }>(
    `select v.body, v.run_id, v.package_revision, v.created_at from verifications v
      where v.package_id = $1 and v.body->>'outcome' in ('pass', 'fail')
        and v.body->'output'->'digest'->>'value' = $2
        and not exists (select 1 from checker_attempts a where a.run_id = v.run_id)
      order by v.created_at, v.run_id`,
    [packageId, deliverable],
  );
  const timeline: Decisive[] = [
    ...attempts.rows
      .filter((row) => row.body.counts_as === "pass" || row.body.counts_as === "fail")
      .map((row) => ({
        outcome: row.body.counts_as as "pass" | "fail",
        revision: Number(row.body.package_revision),
        runId: typeof row.body.verification_run_id === "string" ? row.body.verification_run_id : String(row.body.run_id ?? ""),
        overrideUse: Boolean(row.used || row.body.recheck_override),
        at: String(row.body.finished_at ?? row.created_at.toISOString()),
        seq: row.seq,
      })),
    ...legacy.rows.map((row) => ({
      outcome: row.body.outcome as "pass" | "fail",
      revision: row.package_revision,
      runId: row.run_id,
      overrideUse: false,
      at: row.created_at.toISOString(),
      seq: 0,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq || String(a.runId).localeCompare(String(b.runId)));
  let decisive: Decisive | null = null;
  for (const item of timeline) {
    if (item.outcome === "fail") {
      decisive = item;
      continue;
    }
    if (item.revision !== revision) continue;
    if (decisive?.outcome === "fail" && !item.overrideUse) continue;
    decisive = item;
  }
  return decisive;
}

/** Sticky means the governing decisive outcome for this revision and digest is fail. */
export async function hasStickyFail(q: Q, packageId: string, revision: number, deliverable: string): Promise<boolean> {
  return (await governingDecisive(q, packageId, revision, deliverable))?.outcome === "fail";
}

export async function hasUnconsumedOverride(q: Q, packageId: string, revision: number, deliverable: string): Promise<boolean> {
  const r = await q.query(
    `select 1 from checker_recheck_overrides o
      where o.package_id = $1 and o.package_revision = $2 and o.deliverable_digest = $3
        and not exists (select 1 from checker_recheck_uses u where u.override_id = o.id)
      limit 1`,
    [packageId, revision, deliverable],
  );
  return (r.rowCount ?? 0) > 0;
}

/** The oldest unused override for this revision and digest, locked so two checks cannot spend it. */
export async function lockNextOverride(c: Tx, packageId: string, revision: number, deliverable: string): Promise<{ id: string; body: Json } | null> {
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`recheck-override:${packageId}`]);
  const r = await c.query<{ id: string; body: Json }>(
    `select id, body from checker_recheck_overrides o
      where package_id = $1 and package_revision = $2 and deliverable_digest = $3
        and not exists (select 1 from checker_recheck_uses u where u.override_id = o.id)
      order by created_at, id
      limit 1
      for update`,
    [packageId, revision, deliverable],
  );
  return r.rows[0] ?? null;
}

export async function consumeOverride(c: Tx, overrideId: string, runId: string): Promise<void> {
  await c.query("insert into checker_recheck_uses (override_id, run_id) values ($1, $2)", [overrideId, runId]);
}

/**
 * Why a check of the current deliverable cannot start. Null when one may start, or one is already queued.
 */
export const REPEATED_INCONCLUSIVE_AT = 3;
export const REPEATED_INCONCLUSIVE_REASON =
  "Several checks of this deliverable were inconclusive. Another check is still allowed; the earlier results stay on the record.";

export async function checkWarning(q: Q, packageId: string, deliverable: string): Promise<Json | null> {
  const n = await q.query<{ n: number }>(
    `select count(*)::int as n from checker_attempts
      where package_id = $1 and body->'deliverable_digest'->>'value' = $2 and body->>'counts_as' = 'inconclusive'`,
    [packageId, deliverable],
  );
  const count = n.rows[0]?.n ?? 0;
  if (count < REPEATED_INCONCLUSIVE_AT) return null;
  return { code: "repeated-inconclusive", reason: REPEATED_INCONCLUSIVE_REASON, count };
}

export async function checkBlocked(q: Q, packageId: string, revision: number): Promise<Json | null> {
  const current = await currentDeliverable(q, packageId, revision);
  if (!current || !(await hasStickyFail(q, packageId, revision, current.digest))) return null;
  if (await hasUnconsumedOverride(q, packageId, revision, current.digest)) return null;
  const authorized = await q.query(
    `select 1 from runs r join checker_recheck_uses u on u.run_id = r.id
      where r.package_id = $1 and r.package_revision = $2 and r.role = 'pre-check' and r.status in ('queued', 'running') limit 1`,
    [packageId, revision],
  );
  if ((authorized.rowCount ?? 0) > 0) return null;
  return {
    code: "sticky-fail",
    reason: STICKY_FAIL_REASON,
    change: STICKY_FAIL_CHANGE,
    deliverable_digest: { algorithm: "sha256", value: current.digest },
  };
}

/** The verification `decide` should see. Null when nothing decisive is on record for this revision and digest. */
export async function governingVerification(q: Q, packageId: string, revision: number, deliverable: string): Promise<Json | null> {
  const decisive = await governingDecisive(q, packageId, revision, deliverable);
  if (!decisive?.runId) return null;
  const v = await q.query<{ body: Json }>("select body from verifications where run_id = $1", [decisive.runId]);
  return v.rows[0]?.body ?? null;
}

/**
 * Claim and completion gate. "drift" means the author bytes are no longer the ones pinned at queue.
 * "sticky" means a fail still governs and this run has not spent an override. "ok" may spend one.
 */
export async function preCheckClaimGate(
  c: Tx,
  packageId: string,
  revision: number,
  runId: string,
  claimed?: string | null,
): Promise<"ok" | "drift" | "sticky"> {
  const pinned = (await c.query<{ deliverable_digest: string }>("select deliverable_digest from checker_queued_digests where run_id = $1", [runId])).rows[0]?.deliverable_digest;
  const actual = await currentDeliverable(c, packageId, revision);
  if (pinned && claimed && pinned !== claimed) return "drift";
  if (pinned && actual && pinned !== actual.digest) return "drift";
  if (claimed && actual && claimed !== actual.digest) return "drift";
  const digestValue = pinned ?? actual?.digest;
  if (!digestValue) return "ok";
  if (!(await hasStickyFail(c, packageId, revision, digestValue))) return "ok";
  if ((await c.query("select 1 from checker_recheck_uses where run_id = $1", [runId])).rowCount) return "ok";
  const override = await lockNextOverride(c, packageId, revision, digestValue);
  if (!override) return "sticky";
  await consumeOverride(c, override.id, runId);
  return "ok";
}

/** How many attempts the package view carries. Older ones stay on GET /checker-attempts. */
export const PACKAGE_ATTEMPT_LIMIT = 50;

export async function listCheckerAttempts(q: Q, packageId: string, opts?: { limit?: number; before?: number }): Promise<Json[]> {
  const limit = opts?.limit;
  if (opts?.before !== undefined) {
    const r = await q.query<{ body: Json }>(
      `select body from checker_attempts where package_id = $1 and seq < $2 order by seq desc limit $3`,
      [packageId, opts.before, limit && limit > 0 ? limit : PACKAGE_ATTEMPT_LIMIT],
    );
    return r.rows.map((row) => row.body).reverse();
  }
  if (limit !== undefined && limit > 0) {
    const r = await q.query<{ body: Json }>(
      `select body from (
         select body, seq from checker_attempts where package_id = $1 order by seq desc limit $2
       ) latest order by seq`,
      [packageId, limit],
    );
    return r.rows.map((row) => row.body);
  }
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

type AttemptRun = {
  id: string;
  package_id: string;
  package_revision: number;
  role: string;
  round: number;
  status: string;
  body: Json;
};

/**
 * Copies terminal pre-checks that predate the attempts table, then stops a queued or running
 * check whose digest already has a governing fail and no override use. One malformed legacy run
 * is logged and skipped; it does not abort startup or roll back the runs that did copy.
 */
export async function backfillCheckerAttempts(c: Tx, ajv: Ajv2020): Promise<number> {
  const rows = await c.query<AttemptRun>(
    `select id, package_id, package_revision, role, round, status, body from runs
      where role = 'pre-check' and status in ('succeeded', 'failed', 'stopped', 'lost')
        and not exists (select 1 from checker_attempts a where a.run_id = runs.id)
      order by created_at, id`,
  );
  let copied = 0;
  for (const row of rows.rows) {
    try {
      await recordCheckerAttempt(c, ajv, row);
      copied += 1;
    } catch (error) {
      // A validation failure is a JavaScript error, so the transaction is still usable. Record a
      // minimal attempt and keep going. A database error aborts the transaction; log it and stop
      // rather than issuing another statement that would hide the cause.
      if (isDatabaseError(error)) {
        console.error(`[control-rod] checker attempt backfill stopped at ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
      console.error(`[control-rod] checker attempt backfill skipped ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      try {
        await recordUnknownAttempt(c, ajv, row);
        copied += 1;
      } catch (again) {
        console.error(`[control-rod] checker attempt backfill could not record ${row.id}: ${again instanceof Error ? again.message : String(again)}`);
        if (isDatabaseError(again)) throw again;
      }
    }
  }
  await reconcileLiveChecks(c, ajv);
  return copied;
}

/** Stops a queued or running pre-check that would be refused at claim: drifted bytes, or a governing fail with no override use. */
export async function reconcileLiveChecks(c: Tx, ajv: Ajv2020): Promise<number> {
  const rows = await c.query<AttemptRun>(
    `select id, package_id, package_revision, role, round, status, body from runs
      where role = 'pre-check' and status in ('queued', 'running')
      order by created_at, id`,
  );
  let stopped = 0;
  for (const row of rows.rows) {
    try {
      const gate = await preCheckClaimGate(c, row.package_id, row.package_revision, row.id);
      if (gate === "ok") continue;
      const error = gate === "drift"
        ? "Stopped because the deliverable changed after this check was queued."
        : "Stopped because a fail on this deliverable still stands and this check has no signed override.";
      const body = { ...row.body, status: "stopped", finished_at: now(), error };
      const valid = (() => {
        try {
          validate(ajv, "Run.json", body);
          return true;
        } catch {
          return false;
        }
      })();
      if (valid) await c.query("update runs set status = 'stopped', body = $2 where id = $1 and status in ('queued', 'running')", [row.id, body]);
      else await c.query("update runs set status = 'stopped' where id = $1 and status in ('queued', 'running')", [row.id]);
      await appendEvent(c, "run.stopped", row.id, SYSTEM, { package: row.package_id, role: row.role, round: row.round });
      await recordCheckerAttempt(c, ajv, { ...row, status: "stopped", body: valid ? body : { ...body, started_at: undefined, finished_at: now() } });
      stopped += 1;
    } catch (error) {
      console.error(`[control-rod] checker reconcile skipped ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      if (isDatabaseError(error)) throw error;
    }
  }
  return stopped;
}

/**
 * Records one checker attempt. A second call for the same run does nothing, so a late report
 * cannot add a second row or replace the first.
 */
async function recordUnknownAttempt(c: Tx, ajv: Ajv2020, run: AttemptRun): Promise<void> {
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`checker-attempt:${run.package_id}`]);
  if ((await c.query("select 1 from checker_attempts where run_id = $1", [run.id])).rowCount) return;
  const seq = ((await c.query<{ n: number }>("select coalesce(max(seq), 0)::int as n from checker_attempts where package_id = $1", [run.package_id])).rows[0]?.n ?? 0) + 1;
  const at = now();
  const attempt: Json = {
    schema_version: "0.1.0",
    id: `CA-${randomUUID().slice(0, 8)}`,
    package_id: run.package_id,
    package_revision: run.package_revision,
    run_id: run.id,
    round: run.round,
    seq,
    checker_runtime: checkerRuntime(run.body),
    digest_unknown: true,
    outcome: "error",
    counts_as: "inconclusive",
    started_at: at,
    finished_at: at,
    evidence: `/packages/${run.package_id}/runs/${run.id}/log`,
  };
  validate(ajv, "CheckerAttempt.json", attempt);
  const ins = await c.query(
    "insert into checker_attempts (id, package_id, package_revision, run_id, seq, body) values ($1, $2, $3, $4, $5, $6) on conflict (run_id) do nothing",
    [attempt.id, run.package_id, run.package_revision, run.id, seq, attempt],
  );
  if (ins.rowCount === 0) return;
  await appendEvent(c, "package.checker-attempt", run.package_id, SYSTEM, {
    attempt: attempt.id,
    run_id: run.id,
    revision: run.package_revision,
    round: run.round,
    outcome: attempt.outcome,
    counts_as: attempt.counts_as,
    digest_unknown: true,
    checker_runtime: attempt.checker_runtime,
    evidence: attempt.evidence,
  });
}

export async function recordCheckerAttempt(c: Tx, ajv: Ajv2020, run: AttemptRun): Promise<void> {
  if (run.role !== "pre-check") return;
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`checker-attempt:${run.package_id}`]);
  if ((await c.query("select 1 from checker_attempts where run_id = $1", [run.id])).rowCount) return;
  const verification = await c.query<{ body: Json }>("select body from verifications where run_id = $1", [run.id]);
  const verdict = verification.rows[0]?.body?.outcome as string | undefined;
  const classified = classifyCheckerOutcome(run.status, typeof run.body.error === "string" ? run.body.error : undefined, verdict);
  const captured = await c.query<{ deliverable_digest: string }>("select deliverable_digest from checker_queued_digests where run_id = $1", [run.id]);
  const fromRecord = verification.rows[0]?.body?.output?.digest?.value;
  // A legacy run with no captured digest and no verification digest is unknown. It is not attached to
  // whatever bytes the package holds today.
  const deliverable = captured.rows[0]?.deliverable_digest ?? (typeof fromRecord === "string" ? fromRecord : undefined);
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
    seq,
    checker_runtime: checkerRuntime(run.body),
    ...(reported ? { reported_model: reported } : {}),
    ...(deliverable ? { deliverable_digest: { algorithm: "sha256", value: deliverable } } : { digest_unknown: true }),
    outcome: classified.outcome,
    counts_as: classified.counts_as,
    started_at: String(run.body.started_at ?? run.body.queued_at ?? now()),
    finished_at: String(run.body.finished_at ?? now()),
    evidence: `/packages/${run.package_id}/runs/${run.id}/log`,
    ...(verification.rows[0] ? { verification_run_id: run.id } : {}),
    ...(use.rows[0] ? { recheck_override: use.rows[0].body } : {}),
  };
  validate(ajv, "CheckerAttempt.json", attempt);
  const ins = await c.query(
    "insert into checker_attempts (id, package_id, package_revision, run_id, seq, body) values ($1, $2, $3, $4, $5, $6) on conflict (run_id) do nothing",
    [attempt.id, run.package_id, run.package_revision, run.id, seq, attempt],
  );
  if (ins.rowCount === 0) return;
  await appendEvent(c, "package.checker-attempt", run.package_id, SYSTEM, {
    attempt: attempt.id,
    run_id: run.id,
    revision: run.package_revision,
    round: run.round,
    outcome: attempt.outcome,
    counts_as: attempt.counts_as,
    ...(deliverable ? { deliverable_digest: deliverable } : { digest_unknown: true }),
    checker_runtime: attempt.checker_runtime,
    ...(reported ? { reported_model: reported } : {}),
    evidence: attempt.evidence,
  });
}
