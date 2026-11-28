import { EventEmitter } from "node:events";
import type { Db, Tx } from "./db/index.js";
import { digest } from "./kernel.js";

export interface Actor {
  kind: "human" | "agent" | "system";
  id: string;
}

export interface EventRecord {
  seq: number;
  at: string;
  type: string;
  subject: string;
  actor: Actor;
  data?: Record<string, unknown>;
  prev?: { algorithm: "sha256"; value: string };
  digest: { algorithm: "sha256"; value: string };
}

/**
 * The most event streams open at once. Each open tab holds one; past this, a new stream is refused
 * (the page retries) so a runaway client cannot pile up listeners and database reads.
 */
export const STREAM_MAX = 200;

/** In-process fan-out for server-sent events: one listener per open stream, plus a few of the app's own. */
export const bus = new EventEmitter();
bus.setMaxListeners(STREAM_MAX + 20);

const PENDING = Symbol("pendingEvents");

/** Events appended in a transaction are announced only after it commits. */
export function pendingEvents(c: Tx): EventRecord[] {
  const holder = c as unknown as { [PENDING]?: EventRecord[] };
  holder[PENDING] ??= [];
  return holder[PENDING];
}

const AFTER = Symbol("afterCommit");

/**
 * Work to do only once the transaction commits, such as updating memory that must agree with the
 * database (the sweep's lease bookkeeping). Dropped if the transaction rolls back.
 */
export function afterCommit(c: Tx, fn: () => void): void {
  afterCommits(c).push(fn);
}

export function afterCommits(c: Tx): (() => void)[] {
  const holder = c as unknown as { [AFTER]?: (() => void)[] };
  return (holder[AFTER] ??= []);
}

/** The digest covers every field except the digest itself, so any edit breaks the chain. */
export function eventDigest(e: Omit<EventRecord, "digest">): string {
  return digest(e);
}

/**
 * Appends one event inside the caller's transaction. The table lock serializes appends, so
 * every entry carries the digest of the one before it.
 */
export async function appendEvent(
  c: Tx,
  type: string,
  subject: string,
  actor: Actor,
  data?: Record<string, unknown>,
): Promise<EventRecord> {
  await c.query("lock table events in exclusive mode");
  const last = await c.query<{ seq: number; digest: string }>(
    "select seq, digest from events order by seq desc limit 1",
  );
  const seq = (last.rows[0]?.seq ?? 0) + 1;
  const at = new Date().toISOString();
  const base: Omit<EventRecord, "digest"> = { seq, at, type, subject, actor };
  if (data !== undefined) base.data = data;
  if (last.rows[0]) base.prev = { algorithm: "sha256", value: last.rows[0].digest };
  const value = eventDigest(base);
  const record: EventRecord = { ...base, digest: { algorithm: "sha256", value } };
  await c.query("insert into events (seq, at, body, digest) values ($1, $2, $3, $4)", [
    seq,
    at,
    record,
    value,
  ]);
  pendingEvents(c).push(record);
  return record;
}

// Resolve the organization through the event's typed subject. A human actor can act on behalf of
// another organization, so only the subjectless administrative command uses the actor's membership.
// The installation-wide chain remains intact for single-organization installs and internal proof
// verification. With multiple organizations, unrecognized subjects and installation events are private.
const organizationEvents = `from events e
  cross join lateral (select e.body->>'type' as type, e.body->>'subject' as subject) event
  where (not exists (select 1 from organizations where id <> $1) or case
    when event.type = 'admin.command' then e.body->'actor'->>'kind' = 'human' and exists
      (select 1 from members where id = e.body->'actor'->>'id' and org_id = $1)
    when event.type like 'organization.%' then event.subject = $1
    when event.type like 'package.%' or event.type like 'decision.%' or event.type = 'output.mismatch'
      or (event.type like 'preparation.%' and event.type not like 'preparation.grant-%' and event.type <> 'preparation.output-quarantined')
      then exists (select 1 from object_owners where object_kind = 'package' and object_id = event.subject and org_id = $1)
    when event.type like 'run.%' or event.type in ('scram.quarantined', 'preparation.output-quarantined')
      then exists (select 1 from object_owners where object_kind = 'run' and object_id = event.subject and org_id = $1)
    when event.type like 'capture.%' then exists
      (select 1 from object_owners where object_kind = 'capture' and object_id = event.subject and org_id = $1)
    when event.type like 'preparation.grant-%' then exists
      (select 1 from object_owners where object_kind = 'grant' and object_id = event.subject and org_id = $1)
    when event.type = 'marking.declassified' then exists (select 1 from object_owners
      where object_kind = split_part(event.subject, '/', 1) and object_id = substr(event.subject, strpos(event.subject, '/') + 1) and org_id = $1)
    ${Object.entries({
      member: "members",
      "signer-qualification": "signer_qualifications",
      "authenticator-credential": "authenticator_credentials",
      delegation: "delegations",
      project: "projects",
      "repo-binding": "repo_bindings",
      "policy-set": "policy_sets",
      machine: "machines",
      "runtime-probe": "runtime_probes",
      "runtime-artifact-version": "runtime_artifact_versions",
      "runtime-pin": "runtime_pins",
      "sandbox-policy": "sandbox_policies",
      "candidate-assignment": "candidate_assignments",
      "person-verification": "person_verifications",
      "change-request": "change_requests",
      budget: "budgets",
      "budget-reservation": "budget_reservations",
      "usage-record": "usage_records",
      "scram-event": "scram_events",
      scram: "scram_events",
      "quarantine-review": "quarantine_reviews",
      "scram-restart": "scram_restarts",
      "chain-seal": "chain_seals",
      chain: "chain_seals",
    }).map(([family, table]) =>
      `when event.type like '${family}.%' then exists (select 1 from ${table} where id = event.subject and org_id = $1)`
    ).join("\n    ")}
    else false end)`;

export async function eventPosition(db: Db, orgId: string, after?: number, replayLimit?: number) {
  const r = await db.query<{ head: number; pending: number }>(
    `with visible as not materialized (select e.seq ${organizationEvents})
     select coalesce((select seq from visible order by seq desc limit 1), 0) as head,
       (select count(*)::int from (select 1 from visible where seq > $2::bigint limit $3) replay) as pending`,
    [orgId, Number.isSafeInteger(after) ? after : null, replayLimit ?? null],
  );
  return r.rows[0]!;
}

/** The page of up to `limit` events whose sequence is below `before`, newest first (the Records page). */
export async function listEventsBefore(db: Db, orgId: string, before: number, limit = 500): Promise<EventRecord[]> {
  const r = await db.query<{ body: EventRecord }>(
    `select e.body ${organizationEvents} and e.seq < $2::bigint order by e.seq desc limit $3`,
    [orgId, before, limit],
  );
  return r.rows.map((x) => x.body);
}

export async function listEvents(db: Db, orgId: string, after = 0, limit = 500): Promise<EventRecord[]> {
  const r = await db.query<{ body: EventRecord }>(
    `select e.body ${organizationEvents} and e.seq > $2::bigint order by e.seq limit $3`,
    [orgId, after, limit],
  );
  return r.rows.map((x) => x.body);
}

export async function eventsForDigest(db: Db, orgId: string, after: number, through: number) {
  return (await db.query<{ type: string; subject: string; actor: string; signature: string | null }>(
    `select event.type, event.subject, e.body->'actor'->>'kind' as actor, e.body->'data'->>'signature' as signature
      ${organizationEvents} and e.seq > $2 and e.seq <= $3 order by e.seq`,
    [orgId, after, through],
  )).rows;
}

/** Verifies each visible event against its stored digest and its real predecessor in the chain. */
export async function verifyOrganizationEvents(db: Db, orgId: string) {
  const r = await db.query<{ seq: number; body: EventRecord; digest: string; previous: string | null }>(
    `select e.seq, e.body, e.digest, (select digest from events where seq = e.seq - 1) as previous
      ${organizationEvents} order by e.seq`,
    [orgId],
  );
  for (const row of r.rows) {
    const { digest: d, ...rest } = row.body;
    if (rest.seq !== row.seq || (row.seq > 1 && row.previous === null) ||
        eventDigest(rest) !== d.value || d.value !== row.digest || rest.prev?.value !== (row.previous ?? undefined)) {
      return { ok: false, count: r.rows.length, broken_at: row.seq };
    }
  }
  return { ok: true, count: r.rows.length };
}

export interface SemanticViolation {
  seq: number;
  type: string;
  reason: string;
}

const VALID_ACTOR_KINDS = new Set(["human", "agent", "system"]);

/**
 * Per-event-family semantic invariant checks (inspired by bernstein audit_chain).
 */
export function verifySemanticInvariants(events: readonly EventRecord[]): SemanticViolation[] {
  const violations: SemanticViolation[] = [];
  let prevSeq = 0;
  let prevTime = 0;
  for (const ev of events) {
    if (ev.seq <= prevSeq) {
      violations.push({ seq: ev.seq, type: ev.type, reason: `Non-monotonic seq ${ev.seq} <= ${prevSeq}` });
    }
    prevSeq = ev.seq;

    const ts = Date.parse(ev.at);
    if (Number.isNaN(ts)) {
      violations.push({ seq: ev.seq, type: ev.type, reason: `Invalid ISO timestamp: ${ev.at}` });
    } else if (ts < prevTime) {
      violations.push({ seq: ev.seq, type: ev.type, reason: `Timestamp regressed: ${ev.at}` });
    } else {
      prevTime = ts;
    }

    if (!ev.type?.trim()) {
      violations.push({ seq: ev.seq, type: ev.type ?? "", reason: "Missing event type" });
    }
    if (!ev.subject?.trim()) {
      violations.push({ seq: ev.seq, type: ev.type, reason: "Missing event subject" });
    }
    if (!ev.actor || !VALID_ACTOR_KINDS.has(ev.actor.kind) || !ev.actor.id?.trim()) {
      violations.push({ seq: ev.seq, type: ev.type, reason: "Invalid or incomplete actor" });
    }

    const family = (ev.type ?? "").split(".")[0];
    if (family === "decision") {
      const status = ev.data?.status;
      if (typeof status !== "string" || !status.trim()) {
        violations.push({ seq: ev.seq, type: ev.type, reason: "Decision event missing non-empty status" });
      }
    }
  }
  return violations;
}

/** Recomputes the whole chain. Reports the first entry whose digest or link does not hold. */
export async function verifyChain(
  db: Db | Tx,
): Promise<{ ok: boolean; count: number; broken_at?: number }> {
  const r = await db.query<{ body: EventRecord; digest: string }>(
    "select body, digest from events order by seq",
  );
  let prev: string | undefined;
  for (const row of r.rows) {
    const { digest: d, ...rest } = row.body;
    const recomputed = eventDigest(rest);
    if (recomputed !== d.value || recomputed !== row.digest || rest.prev?.value !== prev) {
      return { ok: false, count: r.rows.length, broken_at: row.body.seq };
    }
    prev = d.value;
  }
  return { ok: true, count: r.rows.length };
}
