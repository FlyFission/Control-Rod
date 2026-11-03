import { createHash, randomUUID } from "node:crypto";
import type { Db, Tx } from "./db/index.js";
import { type Actor, appendEvent } from "./events.js";
import { Refusal } from "./refusal.js";
import { recordObject } from "./workbench.js";

/**
 * SCRAM (workbench specification 22a; plan task 2.10). Pulling SCRAM sets a persistent stopped
 * state on an organization or project, recorded by a signed ScramEvent with its reason. While it
 * holds, nothing in scope is claimed, requeued or released. Every run in scope that is running is
 * told to stop at its next heartbeat, its preparation grants are revoked at once, and whatever it
 * reports is quarantined in batches (retained privately with its digests, never applied). A person
 * reviews each stopped run, signed, covering the batches present; a staged restart, directly signed
 * per package, discipline or everything, lifts the stopped state for its scope, and is refused while
 * anything there has an unknown outcome, is still stopping, or has a batch no review covers. The
 * time from the pull to the last run stopped is recorded on every SCRAM, drills included.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

const idFor = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
const SYSTEM: Actor = { kind: "system", id: "control-plane" };

/**
 * The SCRAM gate. Claims, requeues, releases and completions hold it shared for their whole
 * transaction, taken before any row lock; pulls and restarts hold it exclusively. So a pull waits for
 * any claim already in flight and then sees the run it started, a restart's eligibility cannot be
 * overtaken by a quarantine batch landing meanwhile, and anything that begins after either commits
 * sees it.
 */
const GATE = "hashtext('controlrod.scram')";
export async function enterScramGate(c: Tx): Promise<void> {
  await c.query(`select pg_advisory_xact_lock_shared(${GATE})`);
}
async function holdScramGate(c: Tx): Promise<void> {
  await c.query(`select pg_advisory_xact_lock(${GATE})`);
}

/** What a SCRAM's scope reaches: a package (with its discipline) or a capture. */
export interface ScramSubject { kind: "package" | "capture"; id: string; discipline?: string }

interface Owner { org_id: string; project_id: string | null }
async function ownerOf(q: Db | Tx, kind: string, id: string): Promise<Owner | null> {
  const r = await q.query<Owner>("select org_id, project_id from object_owners where object_kind = $1 and object_id = $2", [kind, id]);
  return r.rows[0] ?? null;
}

/** Whether a SCRAM's scope (its organization, and its project if it has one) reaches an owner. */
const reaches = (scram: Json, owner: Owner | null) =>
  owner !== null && owner.org_id === scram.org_id && (scram.scope !== "project" || owner.project_id === scram.project_id);

/** SCRAMs not lifted for everything, newest first. */
/** Every SCRAM not yet restarted for its whole scope. */
export async function activeScrams(q: Db | Tx): Promise<Json[]> {
  const r = await q.query<{ body: Json }>(
    `select s.body from scram_events s
      where not exists (select 1 from scram_restarts x where x.scram_id = s.id and x.scope = 'all')
      order by s.recorded_at desc`);
  return r.rows.map((x) => x.body);
}

/** Whether a restart of this SCRAM for the subject's package or discipline lifts it for the subject. */
async function liftedFor(q: Db | Tx, scramId: string, s: ScramSubject): Promise<boolean> {
  if (s.kind !== "package") return false;
  const r = await q.query(
    `select 1 from scram_restarts where scram_id = $1 and ((scope = 'package' and body->>'package_id' = $2) or (scope = 'discipline' and body->>'discipline' = $3)) limit 1`,
    [scramId, s.id, s.discipline ?? null]);
  return Boolean(r.rowCount);
}

/**
 * The SCRAM holding a subject stopped, or null. A SCRAM reaches what its organization owns, or with
 * project scope what that project owns; a restart for the subject's package or discipline lifts it.
 */
export async function scramHolding(q: Db | Tx, s: ScramSubject): Promise<Json | null> {
  const scrams = await activeScrams(q);
  if (!scrams.length) return null;
  const owner = await ownerOf(q, s.kind, s.id);
  for (const scram of scrams) {
    if (!reaches(scram, owner)) continue;
    if (await liftedFor(q, scram.id, s)) continue;
    return scram;
  }
  return null;
}

/** Refuses a command on a subject SCRAM holds stopped. */
export async function refuseIfScrammed(q: Db | Tx, s: ScramSubject): Promise<void> {
  const scram = await scramHolding(q, s);
  if (scram) throw new Refusal(409, "scram-stopped", `SCRAM ${scram.id} has stopped this work: ${scram.reason}`);
}

/** The subject a run belongs to, for scope checks. */
export async function runSubject(q: Db | Tx, run: { role: string; package_id: string }): Promise<ScramSubject> {
  if (run.role === "intake") return { kind: "capture", id: run.package_id };
  const p = await q.query<{ discipline: string | null }>("select body->>'discipline' as discipline from packages where id = $1 order by revision desc limit 1", [run.package_id]);
  return { kind: "package", id: run.package_id, ...(p.rows[0]?.discipline ? { discipline: p.rows[0].discipline } : {}) };
}

/**
 * Pulls SCRAM (admin command scram.pull, signed). Running runs in scope are stopped and their grants
 * revoked in the same transaction; the ScramEvent lists them, and each is associated with the SCRAM.
 */
export async function pullScram(c: Tx, orgId: string, memberId: string, p: Json, assertion: Json, actor: Actor) {
  await holdScramGate(c);
  const scope = p.scope === "project" ? "project" : p.scope === "organization" ? "organization" : null;
  if (!scope) throw new Refusal(400, "invalid", "scope must be organization or project");
  const reason = typeof p.reason === "string" ? p.reason.trim() : "";
  if (!reason) throw new Refusal(400, "reason-required", "Say why SCRAM is pulled");
  const projectId = scope === "project" ? String(p.project_id ?? "") : undefined;
  if (scope === "project" && !(await c.query("select 1 from projects where id = $1 and org_id = $2", [projectId, orgId])).rowCount)
    throw new Refusal(404, "not-found", "No such project");
  // Only this organization's runs, and for a project SCRAM only what that project owns.
  const running = await c.query<{ id: string; role: string; package_id: string }>(
    `select r.id, r.role, r.package_id from runs r join object_owners o on o.object_kind = 'run' and o.object_id = r.id
      where r.status = 'running' and o.org_id = $1 order by r.id for update of r`, [orgId]);
  const draft = { org_id: orgId, scope, ...(projectId ? { project_id: projectId } : {}) };
  const quarantine: string[] = [];
  for (const r of running.rows) {
    const s = await runSubject(c, r);
    if (reaches(draft, await ownerOf(c, s.kind, s.id))) quarantine.push(r.id);
  }
  const scram = { id: idFor("scr"), ...draft, pulled_by: memberId, reason: reason.slice(0, 2000),
    assertion, quarantine, ...(p.drill === true ? { drill: true } : {}) };
  await recordObject(c, "scram_event", scram as never, actor);
  const at = new Date().toISOString();
  for (const id of quarantine) {
    await c.query("insert into scram_runs (scram_id, org_id, run_id) values ($1, $2, $3)", [scram.id, orgId, id]);
    // Stop at the next heartbeat (the daemon's graceful stop). The first SCRAM to reach a run marks
    // it; whatever it reports from now on is quarantined.
    await c.query(
      `update runs set body = body || jsonb_build_object(
         'stop_requested_at', coalesce(body->>'stop_requested_at', $2::text),
         'stop_requested_by', coalesce(body->>'stop_requested_by', $3::text),
         'scram_id', coalesce(body->>'scram_id', $4::text),
         'label', 'Stopping') where id = $1`,
      [id, at, `SCRAM ${scram.id}`, scram.id]);
    // Credentials go at once: a preparation grant for the run can no longer be used.
    await c.query(
      "update preparation_grant_state set revoked_at = clock_timestamp() where grant_id in (select id from preparation_grants where run_id = $1) and revoked_at is null", [id]);
  }
  await appendEvent(c, "scram.pulled", scram.id, actor, { scope, ...(projectId ? { project_id: projectId } : {}), reason: scram.reason, stopping: quarantine.length, drill: p.drill === true });
  await recordStoppedIfDone(c, scram.id);
  return scram;
}

/**
 * Records the time to stop once no run the SCRAM stopped is still running (specification 22a),
 * measured from its scram.pulled event (after the gate was won, so lock waits do not count).
 * Recorded once.
 */
export async function recordStoppedIfDone(c: Tx, scramId: string): Promise<void> {
  const s = (await c.query<{ body: Json }>("select body from scram_events where id = $1", [scramId])).rows[0];
  if (!s) return;
  if ((await c.query("select 1 from events where body->>'type' = 'scram.stopped' and body->>'subject' = $1 limit 1", [scramId])).rowCount) return;
  const still = await c.query("select 1 from scram_runs x join runs r on r.id = x.run_id where x.scram_id = $1 and r.status = 'running' limit 1", [scramId]);
  if (still.rowCount) return;
  const pulled = (await c.query<{ at: string }>("select body->>'at' as at from events where body->>'type' = 'scram.pulled' and body->>'subject' = $1 limit 1", [scramId])).rows[0];
  if (!pulled) return;
  const runs = (await c.query<{ n: number }>("select count(*)::int as n from scram_runs where scram_id = $1", [scramId])).rows[0]!.n;
  // Whole milliseconds: event data holds integers only, so the chain digests stay canonical.
  const ms = Math.max(0, Math.round(Date.now() - new Date(pulled.at).getTime()));
  await appendEvent(c, "scram.stopped", scramId, SYSTEM, { ms_to_stop: ms, runs, drill: s.body.drill === true });
}

/** When a run is no longer running, records the time to stop of every SCRAM that stopped it, if it was their last. */
export async function scramRunEnded(c: Tx, runId: string): Promise<void> {
  const r = await c.query<{ scram_id: string }>("select scram_id from scram_runs where run_id = $1 order by scram_id", [runId]);
  for (const x of r.rows) await recordStoppedIfDone(c, x.scram_id);
}

/**
 * Associates a run that is reporting with the SCRAMs whose scope reaches it, so what it reports is
 * quarantined and reviewed before those SCRAMs fully restart. `held` says a SCRAM still holds the
 * run's work (not lifted by a partial restart): its report is refused as quarantined and the run is
 * marked stopped by SCRAM. With `evenLifted`, reports that are never applied anyway (refused or
 * late ones) from work a partial restart resumed are associated too, so a broader restart still
 * waits for their review. `associated` says the run now belongs to at least one SCRAM.
 */
export async function adoptHeldRun(c: Tx, run: { id: string; role: string; package_id: string; body: Json }, opts: { evenLifted?: boolean } = {}):
  Promise<{ held: boolean; associated: boolean }> {
  const subject = await runSubject(c, run);
  const owner = await ownerOf(c, subject.kind, subject.id);
  let first: string | null = run.body.scram_id ? String(run.body.scram_id) : null;
  let associated = first !== null;
  for (const scram of await activeScrams(c)) {
    if (!reaches(scram, owner)) continue;
    const lifted = await liftedFor(c, scram.id, subject);
    if (lifted && !opts.evenLifted) continue;
    await c.query("insert into scram_runs (scram_id, org_id, run_id) values ($1, $2, $3) on conflict do nothing", [scram.id, scram.org_id, run.id]);
    associated = true;
    if (!lifted) first ??= scram.id;
  }
  if (first && !run.body.scram_id) {
    await c.query("update runs set body = body || jsonb_build_object('scram_id', $2::text) where id = $1", [run.id, first]);
    run.body = { ...run.body, scram_id: first };
  }
  return { held: first !== null, associated };
}

/**
 * Keeps what a SCRAM-stopped run reported as one quarantine batch, every output with its digest,
 * and lists the digests on the event log. Nothing of it is applied. A retried completion (same
 * idempotency key) adds nothing.
 */
export async function quarantineScramCompletion(c: Tx, runId: string, key: string, body: Json): Promise<boolean> {
  const outputs = Array.isArray(body?.outputs) ? body.outputs : [];
  const batch = (await c.query<{ id: string }>(
    "insert into scram_quarantine_batches (run_id, idempotency_key, reported, output_count) values ($1, $2, $3, $4) on conflict do nothing returning id::text",
    [runId, key, String(body?.status ?? "unknown").slice(0, 40), outputs.length])).rows[0];
  if (!batch) return false;
  const listed: { name: string; sha256: string }[] = [];
  for (const [i, o] of outputs.entries()) {
    const bytes = Buffer.from(String(o?.content_base64 ?? ""), "base64");
    const entry = { name: String(o?.name ?? "").slice(0, 300), sha256: createHash("sha256").update(bytes).digest("hex") };
    await c.query("insert into scram_quarantine (batch_id, ordinal, name, sha256, bytes) values ($1, $2, $3, $4, $5)", [batch.id, i, entry.name, entry.sha256, bytes]);
    listed.push(entry);
  }
  const scrams = (await c.query<{ scram_id: string }>("select scram_id from scram_runs where run_id = $1 order by scram_id", [runId])).rows.map((r) => r.scram_id);
  await appendEvent(c, "scram.quarantined", runId, SYSTEM, {
    batch: Number(batch.id), scrams, reported: String(body?.status ?? "unknown"), output_count: outputs.length, outputs: listed.slice(0, 200) });
  return true;
}

/** The newest quarantine batch for a run, or 0 when it reported nothing. */
async function newestBatch(c: Db | Tx, runId: string): Promise<number> {
  return (await c.query<{ n: number }>("select coalesce(max(id), 0)::int as n from scram_quarantine_batches where run_id = $1", [runId])).rows[0]!.n;
}

/** The newest batch a review of this SCRAM covered for the run: -1 with no review, 0 for a review of nothing. */
async function reviewedThrough(c: Db | Tx, scramId: string, runId: string): Promise<number> {
  const r = await c.query<{ n: number | null; reviews: number }>(
    "select max(coalesce((body->>'covers_batch')::int, 0))::int as n, count(*)::int as reviews from quarantine_reviews where scram_id = $1 and run_id = $2", [scramId, runId]);
  return r.rows[0]!.reviews === 0 ? -1 : (r.rows[0]!.n ?? 0);
}

/**
 * A person's signed review of one run a SCRAM stopped (admin command scram.review). It covers every
 * quarantine batch present; a batch that arrives later needs another review.
 */
export async function reviewQuarantine(c: Tx, orgId: string, memberId: string, p: Json, assertion: Json, actor: Actor) {
  await enterScramGate(c);
  const scramId = String(p.scram_id ?? "");
  const runId = String(p.run_id ?? "");
  const scram = (await c.query<{ body: Json }>("select body from scram_events where id = $1 and org_id = $2", [scramId, orgId])).rows[0]?.body;
  if (!scram || !(await c.query("select 1 from scram_runs where scram_id = $1 and run_id = $2", [scramId, runId])).rowCount)
    throw new Refusal(404, "not-found", "That run was not stopped by that SCRAM");
  if (p.disposition !== "discard" && p.disposition !== "retain") throw new Refusal(400, "invalid", "disposition must be discard or retain");
  const reason = typeof p.reason === "string" ? p.reason.trim() : "";
  if (!reason) throw new Refusal(400, "reason-required", "Say what the review found");
  const status = (await c.query<{ status: string }>("select status from runs where id = $1 for share", [runId])).rows[0]?.status;
  if (status === "running") throw new Refusal(409, "still-running", "This run has not stopped yet; review it once it has");
  const newest = await newestBatch(c, runId);
  if ((await reviewedThrough(c, scramId, runId)) >= newest)
    throw new Refusal(409, "already-reviewed", "Everything this run reported has already been reviewed");
  // The signature covers the batch the person saw last; it never stretches over one they did not.
  const seen = p.covers_batch === undefined ? 0 : p.covers_batch;
  if (!Number.isInteger(seen) || seen < 0) throw new Refusal(400, "invalid", "covers_batch must be a whole number");
  if (seen !== newest)
    throw new Refusal(409, "quarantine-changed", `This run has reported more since you looked (newest batch ${newest}); look again and sign for what is there now`);
  const review = { id: idFor("qrv"), org_id: orgId, scram_id: scramId, run_id: runId, disposition: p.disposition, reviewed_by: memberId,
    reason: reason.slice(0, 2000), assertion, ...(newest > 0 ? { covers_batch: newest } : {}) };
  await recordObject(c, "quarantine_review", review as never, actor);
  return review;
}

/**
 * A staged restart (admin command scram.restart, signed): lifts the stopped state for one package,
 * one discipline, or everything the SCRAM reached. Every run in that scope is checked, not only the
 * ones the SCRAM stopped: it is refused while any has an unknown outcome, while a run the SCRAM
 * stopped is still running, and while one has a quarantine batch no review of this SCRAM covers.
 * Work legitimately running after an earlier partial restart does not block. The gate is held
 * exclusively, so no batch or run state lands between this check and the restart.
 */
export async function restartAfterScram(c: Tx, orgId: string, memberId: string, p: Json, assertion: Json, actor: Actor) {
  await holdScramGate(c);
  const scramId = String(p.scram_id ?? "");
  const scram = (await c.query<{ body: Json }>("select body from scram_events where id = $1 and org_id = $2", [scramId, orgId])).rows[0]?.body;
  if (!scram) throw new Refusal(404, "not-found", "No such SCRAM");
  if ((await c.query("select 1 from scram_restarts where scram_id = $1 and scope = 'all'", [scramId])).rowCount)
    throw new Refusal(409, "already-restarted", "Everything this SCRAM stopped has already been restarted");
  const scope = p.scope;
  if (scope !== "all" && scope !== "package" && scope !== "discipline") throw new Refusal(400, "invalid", "scope must be all, package or discipline");
  const reason = typeof p.reason === "string" ? p.reason.trim() : "";
  if (!reason) throw new Refusal(400, "reason-required", "Say why it is safe to restart");
  const target = scope === "package" ? String(p.package_id ?? "") : scope === "discipline" ? String(p.discipline ?? "") : "";
  if (scope !== "all" && !target) throw new Refusal(400, "invalid", `${scope} is required`);

  const inScope = async (r: { role: string; package_id: string }) => {
    const s = await runSubject(c, r);
    if (!reaches(scram, await ownerOf(c, s.kind, s.id))) return false;
    if (scope === "all") return true;
    if (s.kind !== "package") return false;
    return scope === "package" ? s.id === target : s.discipline === target;
  };
  const blockers: string[] = [];
  // Runs this SCRAM stopped: still running, or reported something no review covers.
  const stopped = (await c.query<{ id: string; role: string; package_id: string; status: string }>(
    "select r.id, r.role, r.package_id, r.status from scram_runs x join runs r on r.id = x.run_id where x.scram_id = $1 order by r.id", [scramId])).rows;
  for (const r of stopped) {
    if (!(await inScope(r))) continue;
    if (r.status === "running") {
      blockers.push(`${r.id} is still running`);
      continue;
    }
    // Every run the SCRAM stopped needs a review, and that review must cover its newest batch.
    const through = await reviewedThrough(c, scramId, r.id);
    if (through < 0 || through < (await newestBatch(c, r.id))) blockers.push(`${r.id} has unreviewed quarantine`);
  }
  // Any run in scope whose outcome is unknown, whether or not this SCRAM stopped it.
  const unknown = (await c.query<{ id: string; role: string; package_id: string }>(
    `select r.id, r.role, r.package_id from runs r join object_owners o on o.object_kind = 'run' and o.object_id = r.id
      where o.org_id = $1 and r.body ? 'outcome_unknown' and not r.body ? 'reconciliation' order by r.id`, [orgId])).rows;
  for (const r of unknown) if (await inScope(r)) blockers.push(`${r.id} has an unknown outcome`);
  if (blockers.length) throw new Refusal(409, "restart-blocked", `Not yet: ${[...new Set(blockers)].join("; ")}`);
  const restart = { id: idFor("srs"), org_id: orgId, scram_id: scramId, scope, ...(scope === "package" ? { package_id: target } : {}),
    ...(scope === "discipline" ? { discipline: target } : {}), released_by: memberId, reason: reason.slice(0, 2000), assertion };
  await recordObject(c, "scram_restart", restart as never, actor);
  return restart;
}

/** What a person reviewing a SCRAM sees: its runs, every quarantine batch with digests, reviews and restarts. */
export async function scramView(q: Db, orgId: string, scramId: string) {
  const scram = (await q.query<{ body: Json }>("select body from scram_events where id = $1 and org_id = $2", [scramId, orgId])).rows[0]?.body;
  if (!scram) throw new Refusal(404, "not-found", "No such SCRAM");
  const runs = (await q.query<{ id: string; status: string; body: Json }>(
    "select r.id, r.status, r.body from scram_runs x join runs r on r.id = x.run_id where x.scram_id = $1 order by r.id", [scramId])).rows;
  const out = [];
  for (const r of runs) {
    const batches = (await q.query<{ id: number; reported: string; output_count: number; recorded_at: Date }>(
      "select id::int, reported, output_count, recorded_at from scram_quarantine_batches where run_id = $1 order by id", [r.id])).rows;
    const withOutputs = [];
    for (const b of batches) {
      const outputs = (await q.query<{ name: string; sha256: string }>("select name, sha256 from scram_quarantine where batch_id = $1 order by ordinal", [b.id])).rows;
      withOutputs.push({ ...b, recorded_at: b.recorded_at.toISOString(), outputs });
    }
    const reviews = (await q.query<{ body: Json }>("select body from quarantine_reviews where scram_id = $1 and run_id = $2 order by recorded_at", [scramId, r.id])).rows.map((x) => x.body);
    out.push({ run_id: r.id, status: r.status, outcome_unknown: Boolean(r.body.outcome_unknown && !r.body.reconciliation), batches: withOutputs, reviews });
  }
  const restarts = (await q.query<{ body: Json }>("select body from scram_restarts where scram_id = $1 order by recorded_at", [scramId])).rows.map((x) => x.body);
  return { scram, runs: out, restarts };
}

/**
 * SCRAMs that need a person, for the Inbox: each active SCRAM of the organization, with what stands
 * between it and a full restart: stopped runs still stopping, runs in scope with an unknown outcome,
 * and stopped runs awaiting review.
 */
export async function scramAttention(q: Db, orgId: string) {
  const out = [];
  for (const scram of await activeScrams(q)) {
    if (scram.org_id !== orgId) continue;
    const runs = (await q.query<{ id: string; status: string }>(
      "select r.id, r.status from scram_runs x join runs r on r.id = x.run_id where x.scram_id = $1 order by r.id", [scram.id])).rows;
    let stopping = 0;
    let unreviewed = 0;
    for (const r of runs) {
      if (r.status === "running") stopping++;
      else {
        const through = await reviewedThrough(q, scram.id, r.id);
        if (through < 0 || through < (await newestBatch(q, r.id))) unreviewed++;
      }
    }
    // Any run in its scope whose outcome is unknown also blocks a full restart.
    // The packages they belong to, so who may reconcile each is judged against its real needs.
    const unknown: { run_id: string; package_id: string }[] = [];
    const lost = (await q.query<{ id: string; role: string; package_id: string }>(
      `select r.id, r.role, r.package_id from runs r join object_owners o on o.object_kind = 'run' and o.object_id = r.id
        where o.org_id = $1 and r.body ? 'outcome_unknown' and not r.body ? 'reconciliation' order by r.id`, [orgId])).rows;
    for (const r of lost) {
      const subject = await runSubject(q, r);
      if (reaches(scram, await ownerOf(q, subject.kind, subject.id))) unknown.push({ run_id: r.id, package_id: r.package_id });
    }
    const pulled = (await q.query<{ at: string }>("select body->>'at' as at from events where body->>'type' = 'scram.pulled' and body->>'subject' = $1 limit 1", [scram.id])).rows[0]?.at;
    out.push({ scram, stopping, unreviewed, unknown, since: pulled ?? new Date().toISOString() });
  }
  return out;
}
