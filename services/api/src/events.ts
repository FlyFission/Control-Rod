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

/** In-process fan-out for server-sent events. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

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

export async function listEvents(db: Db, after = 0, limit = 500): Promise<EventRecord[]> {
  const r = await db.query<{ body: EventRecord }>(
    "select body from events where seq > $1 order by seq limit $2",
    [after, limit],
  );
  return r.rows.map((x) => x.body);
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
    if (family === "decision" && ev.data && typeof ev.data.verdict === "string" && !ev.data.verdict.trim()) {
      violations.push({ seq: ev.seq, type: ev.type, reason: "Decision event has empty verdict" });
    }
  }
  return violations;
}

/** Recomputes the whole chain and verifies per-event-family semantic invariants. */
export async function verifyChain(
  db: Db | Tx,
): Promise<{ ok: boolean; count: number; broken_at?: number; semantic_violations: SemanticViolation[] }> {
  const r = await db.query<{ body: EventRecord; digest: string }>(
    "select body, digest from events order by seq",
  );
  const events: EventRecord[] = [];
  let prev: string | undefined;
  for (const row of r.rows) {
    const { digest: d, ...rest } = row.body;
    const recomputed = eventDigest(rest);
    if (recomputed !== d.value || recomputed !== row.digest || rest.prev?.value !== prev) {
      return {
        ok: false,
        count: r.rows.length,
        broken_at: row.body.seq,
        semantic_violations: verifySemanticInvariants(events),
      };
    }
    events.push(row.body);
    prev = d.value;
  }
  const semantic_violations = verifySemanticInvariants(events);
  return { ok: semantic_violations.length === 0, count: r.rows.length, semantic_violations };
}
