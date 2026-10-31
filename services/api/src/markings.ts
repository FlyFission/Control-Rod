import type { Db, Tx } from "./db/index.js";
import { type DataLane, LANE_ORDER, isLane } from "./disclosure.js";
import { Refusal } from "./refusal.js";
import { checkSchema } from "./tenancy.js";

/**
 * Markings, provenance and declassification (workbench specification 11.3 M-1 to M-3; plan task 1.9).
 *
 * Every marked object has a version 1 marking with the lane it carried at creation, which never
 * changes. Its effective lane is the most sensitive of that lane (or a lane someone raised it to)
 * and the effective lane of every input it was derived from. An approved declassification gives an
 * object an override: it then contributes the declassified lane whatever its inputs say. Objects
 * derived from it are recomputed into new marking versions that cite the change request; no version
 * is ever edited in place.
 */
export interface MarkingInput { object_kind: string; object_id: string; version: number }
export interface Marking {
  object_kind: string;
  object_id: string;
  version: number;
  lane: DataLane;
  reason: string;
  assigned?: DataLane;
  inputs?: MarkingInput[];
  override?: { lane: DataLane; change_request_id: string };
  effective_lane?: DataLane;
  change_request_id?: string;
}

/** An object reference without a version: the current marking of it is used. */
export interface Ref { kind: string; id: string }

const rank = (l: DataLane) => LANE_ORDER.indexOf(l);

/** The most sensitive of several lanes. */
export function mostSensitive(lanes: DataLane[]): DataLane {
  return lanes.reduce((a, b) => (rank(b) > rank(a) ? b : a), "public" as DataLane);
}

/** Whether lane `a` is at least as sensitive as `b`. */
export const covers = (a: DataLane, b: DataLane) => rank(a) >= rank(b);

/** The effective lane a marking version records (versions before 1.9 carry only `lane`). */
export const effectiveLane = (m: Marking): DataLane => m.effective_lane ?? m.lane;

export async function currentMarking(q: Db | Tx, kind: string, id: string): Promise<Marking | null> {
  const r = await q.query<{ body: Marking }>(
    "select body from object_markings where object_kind = $1 and object_id = $2 order by version desc limit 1", [kind, id]);
  return r.rows[0]?.body ?? null;
}

/** The effective lane of an object, or `fallback` for objects marked before markings existed. */
export async function laneOf(q: Db | Tx, kind: string, id: string, fallback: unknown): Promise<DataLane | undefined> {
  const m = await currentMarking(q, kind, id);
  if (m) return effectiveLane(m);
  return isLane(fallback) ? fallback : undefined;
}

/** Computes a marking's effective lane from its own lane, raise, override and its inputs' current markings. */
async function compute(q: Tx, m: Omit<Marking, "effective_lane">): Promise<DataLane> {
  if (m.override) return m.override.lane;
  const lanes: DataLane[] = [m.assigned ?? m.lane];
  for (const i of m.inputs ?? []) {
    const r = await q.query<{ body: Marking }>(
      "select body from object_markings where object_kind = $1 and object_id = $2 and version = $3", [i.object_kind, i.object_id, i.version]);
    if (!r.rows[0]) throw new Error(`marking ${i.object_kind}/${i.object_id} v${i.version} does not exist`);
    lanes.push(effectiveLane(r.rows[0].body));
  }
  return mostSensitive(lanes);
}

/** Serializes marking writers of one object, so versions never collide and reads inside see the latest. */
async function lock(c: Tx, kind: string, id: string): Promise<void> {
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`marking:${kind}/${id}`]);
}

async function write(c: Tx, m: Omit<Marking, "effective_lane">): Promise<Marking> {
  const full: Marking = { ...m, effective_lane: await compute(c, m) };
  checkSchema("MarkingEnvelope.json", full);
  await c.query("insert into object_markings (body) values ($1)", [full]);
  return full;
}

/** The current marking version of each input that has one; unmarked inputs contribute nothing. */
async function resolve(c: Tx, inputs: Ref[]): Promise<MarkingInput[]> {
  const out: MarkingInput[] = [];
  for (const i of inputs) {
    const m = await currentMarking(c, i.kind, i.id);
    if (m && !out.some((o) => o.object_kind === i.kind && o.object_id === i.id))
      out.push({ object_kind: i.kind, object_id: i.id, version: m.version });
  }
  return out;
}

/**
 * Marks an object at creation with its lane and the objects it was derived from. Marking an object
 * that already has a marking adds inputs or raises; it never lowers (that is a declassification).
 */
export async function markObject(c: Tx, kind: string, id: string, lane: DataLane, reason: string, inputs: Ref[] = []): Promise<Marking> {
  await lock(c, kind, id);
  const existing = await currentMarking(c, kind, id);
  const resolved = await resolve(c, inputs);
  if (!existing) {
    const m: Omit<Marking, "effective_lane"> = { object_kind: kind, object_id: id, version: 1, lane, reason };
    if (resolved.length) m.inputs = resolved;
    return write(c, m);
  }
  const merged = [...(existing.inputs ?? [])];
  for (const r of resolved) {
    const at = merged.findIndex((x) => x.object_kind === r.object_kind && x.object_id === r.object_id);
    if (at >= 0) merged[at] = r;
    else merged.push(r);
  }
  // A raise is measured against the effective lane, so it also works after a declassification,
  // which it then ends. Adding inputs alone keeps any override.
  const current = effectiveLane(existing);
  const raising = lane !== current && covers(lane, current);
  const known = new Set((existing.inputs ?? []).map((x) => `${x.object_kind}/${x.object_id}/${x.version}`));
  const newInputs = merged.length !== known.size || merged.some((x) => !known.has(`${x.object_kind}/${x.object_id}/${x.version}`));
  if (!raising && !newInputs) return existing;
  const { effective_lane: _e, change_request_id: _cr, override, ...rest } = existing;
  const next: Omit<Marking, "effective_lane"> = { ...rest, version: existing.version + 1, reason };
  if (raising) next.assigned = lane;
  else if (override) next.override = override;
  if (merged.length) next.inputs = merged;
  const written = await write(c, next);
  if (effectiveLane(written) !== effectiveLane(existing)) await recomputeDerived(c, kind, id, reason);
  return written;
}

/** Objects whose current marking lists this object as an input. */
export async function derivedFrom(q: Db | Tx, kind: string, id: string): Promise<Ref[]> {
  const r = await q.query<{ object_kind: string; object_id: string }>(
    `select m.object_kind, m.object_id from object_markings m
      where m.version = (select max(version) from object_markings x where x.object_kind = m.object_kind and x.object_id = m.object_id)
        and m.body->'inputs' @> jsonb_build_array(jsonb_build_object('object_kind', $1::text, 'object_id', $2::text))
      order by 1, 2`, [kind, id]);
  return r.rows.map((x) => ({ kind: x.object_kind, id: x.object_id }));
}

/** Everything downstream of an object, nearest first: the impact a declassification must list. */
export async function downstreamOf(q: Db | Tx, kind: string, id: string): Promise<Ref[]> {
  const seen = new Set<string>([`${kind}/${id}`]);
  const out: Ref[] = [];
  const queue: Ref[] = [{ kind, id }];
  while (queue.length) {
    const at = queue.shift() as Ref;
    for (const d of await derivedFrom(q, at.kind, at.id)) {
      const key = `${d.kind}/${d.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
      queue.push(d);
    }
  }
  return out;
}

/**
 * Writes a new marking version for every object derived, directly or not, from this one, using the
 * current version of each input. Each new version cites the cause (a change request id or reason).
 */
async function recomputeDerived(c: Tx, kind: string, id: string, cause: string, changeRequestId?: string): Promise<void> {
  for (const d of await downstreamOf(c, kind, id)) {
    await lock(c, d.kind, d.id);
    const m = await currentMarking(c, d.kind, d.id);
    if (!m) continue;
    const inputs = await resolve(c, (m.inputs ?? []).map((i) => ({ kind: i.object_kind, id: i.object_id })));
    const { effective_lane: _e, change_request_id: _cr, ...rest } = m;
    const next: Omit<Marking, "effective_lane"> = { ...rest, version: m.version + 1, inputs, reason: cause };
    if (changeRequestId) next.change_request_id = changeRequestId;
    await write(c, next);
  }
}

/**
 * Applies an approved declassification to the exact marking version the change request named:
 * a new version with the override, then new versions of everything derived from it.
 */
export async function declassify(c: Tx, kind: string, id: string, version: number, lane: DataLane, changeRequestId: string): Promise<Marking> {
  await lock(c, kind, id);
  const m = await currentMarking(c, kind, id);
  if (!m) throw new Refusal(404, "not-found", "This object has no marking");
  if (m.version !== version)
    throw new Refusal(409, "marking-changed", `The marking moved from version ${version} to ${m.version} after the change request was made; propose it again`);
  if (covers(lane, effectiveLane(m))) throw new Refusal(409, "not-lower", `The object is already ${effectiveLane(m)}; declassification only lowers`);
  const { effective_lane: _e, ...rest } = m;
  const cause = `declassified to ${lane} by change request ${changeRequestId}`;
  const written = await write(c, { ...rest, version: m.version + 1, override: { lane, change_request_id: changeRequestId }, change_request_id: changeRequestId, reason: cause });
  await recomputeDerived(c, kind, id, cause, changeRequestId);
  return written;
}

/**
 * Refuses an export whose parts are more sensitive than the export's own lane (M-3). Returns the
 * lane the export carries when none is named: the most sensitive part.
 */
export function exportLane(parts: { name: string; lane: DataLane }[], requested?: DataLane): DataLane {
  const needed = mostSensitive(parts.map((p) => p.lane));
  if (requested && !covers(requested, needed)) {
    const over = parts.filter((p) => !covers(requested, p.lane)).map((p) => `${p.name} (${p.lane})`);
    throw new Refusal(409, "mixed-lane-export", `A ${requested} export cannot carry ${over.join(", ")}`);
  }
  return requested ?? needed;
}
