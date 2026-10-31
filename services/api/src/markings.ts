import type { Db, Tx } from "./db/index.js";
import { type DataLane, LANE_ORDER, isLane } from "./disclosure.js";
import { assertMarkingWrite } from "./marking-lock.js";
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
  override?: { lane: DataLane; change_request_id: string; covered?: MarkingInput[] };
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

async function markingAt(q: Tx, i: MarkingInput): Promise<Marking> {
  const r = await q.query<{ body: Marking }>(
    "select body from object_markings where object_kind = $1 and object_id = $2 and version = $3", [i.object_kind, i.object_id, i.version]);
  if (!r.rows[0]) throw new Error(`marking ${i.object_kind}/${i.object_id} v${i.version} does not exist`);
  return r.rows[0].body;
}

/**
 * Computes a marking's effective lane from its own lane, raise, override and its inputs' markings.
 * An override contributes its lane for the exact input versions its approval covered; an input added
 * after the approval, or changed since, counts at its own effective lane.
 */
async function compute(q: Tx, m: Omit<Marking, "effective_lane">): Promise<DataLane> {
  const lanes: DataLane[] = [m.override ? m.override.lane : (m.assigned ?? m.lane)];
  for (const i of m.inputs ?? []) {
    const lane = effectiveLane(await markingAt(q, i));
    // Covered means the exact input version the approval saw; any other version counts in full.
    if (m.override?.covered?.some((x) => x.object_kind === i.object_kind && x.object_id === i.object_id && x.version === i.version)) continue;
    lanes.push(lane);
  }
  return mostSensitive(lanes);
}

/**
 * One lock for the whole marking graph (marking-lock.ts). Writers (raises, new provenance edges,
 * declassification and the recomputation they cause) hold it exclusively, so a source read while
 * adding an edge cannot be raised underneath and recomputations never wait on each other in
 * different orders. A claim holds it shared while it reads a lane and builds the job. The executor
 * takes it at the start of each command; here a writer only confirms it is held.
 */
const lock = assertMarkingWrite;

async function write(c: Tx, m: Omit<Marking, "effective_lane">): Promise<Marking> {
  await lock(c);
  const full: Marking = { ...m, effective_lane: await compute(c, m) };
  checkSchema("MarkingEnvelope.json", full);
  await c.query("insert into object_markings (body) values ($1)", [full]);
  return full;
}

/** The marked objects a preparation basis reference names: a capture, a capture's attachment, or another package. */
export function basisRef(b: { kind?: unknown; reference?: unknown }, self: string): Ref | null {
  const ref = String(b.reference ?? "");
  if (b.kind === "capture" && ref.startsWith("capture:")) return { kind: "capture", id: ref.slice(8) };
  if (b.kind === "attachment" && ref.startsWith("attachment:")) return { kind: "capture", id: ref.slice(11).split("/")[0]! };
  if (b.kind === "package" && ref.startsWith("package:") && ref !== `package:${self}`) return { kind: "package", id: ref.slice(8) };
  return null;
}

/**
 * Every object a stored package's content may draw on: its capture, the packages it depends on, and
 * the captures, attachments and packages in its preparation basis and release manifests.
 */
export async function storedSources(q: Db | Tx, id: string): Promise<Ref[]> {
  const p = (await q.query<{ capture_id: string | null; revision: number }>(
    "select capture_id, revision from packages where id = $1 order by revision desc limit 1", [id])).rows[0];
  if (!p) return [];
  const out: Ref[] = p.capture_id ? [{ kind: "capture", id: p.capture_id }] : [];
  const deps = await q.query<{ depends_on: string }>(
    "select depends_on from package_dependencies where package_id = $1 and package_revision = $2 order by depends_on", [id, p.revision]);
  for (const d of deps.rows) out.push({ kind: "package", id: d.depends_on });
  const basis = await q.query<{ refs: unknown[] }>(
    `select s.body->'basis' as refs from preparation_heads h join preparation_snapshots s on s.preparation_id = h.preparation_id and s.revision = h.revision
      where h.package_id = $1
     union all
     select body->'basis_refs' from preparation_release_manifests where package_id = $1`, [id]);
  for (const row of basis.rows) for (const b of row.refs ?? []) {
    const r = basisRef(b as never, id);
    if (r) out.push(r);
  }
  const seen = new Set<string>();
  return out.filter((r) => !seen.has(`${r.kind}/${r.id}`) && seen.add(`${r.kind}/${r.id}`));
}

/**
 * An object's current marking, recording version 1 from the lane its record carries when it was
 * classified before markings existed. Null for an object with no classified lane.
 */
export async function ensureMarking(c: Tx, kind: string, id: string, seen = new Set<string>()): Promise<Marking | null> {
  const m = await currentMarking(c, kind, id);
  if (m) return m;
  if (kind === "capture") {
    const lane = (await c.query<{ lane: string }>("select body->>'lane' as lane from captures where id = $1", [id])).rows[0]?.lane;
    return isLane(lane) ? write(c, { object_kind: kind, object_id: id, version: 1, lane, reason: "marked from its recorded lane" }) : null;
  }
  if (kind !== "package") return null;
  const p = (await c.query<{ lane: string }>(
    "select body->>'data_lane' as lane from packages where id = $1 order by revision desc limit 1", [id])).rows[0];
  if (!p || !isLane(p.lane)) return null;
  // A package marked late gets its provenance edges too: every stored source, each marked the same
  // way first, so a later raise of any of them reaches it.
  if (seen.has(id)) throw new Error(`package ${id} depends on itself through its sources`);
  seen.add(id);
  const sources = await storedSources(c, id);
  const inputs: MarkingInput[] = [];
  for (const s of sources) {
    const sm = await ensureMarking(c, s.kind, s.id, seen);
    if (!sm) throw new Refusal(409, "unclassified-source", `${s.kind} ${s.id} has no classified data lane; classify it before using it as a source`);
    inputs.push({ object_kind: s.kind, object_id: s.id, version: sm.version });
  }
  return write(c, { object_kind: kind, object_id: id, version: 1, lane: p.lane, reason: "marked from its recorded lane and sources",
    ...(inputs.length ? { inputs } : {}) });
}

/**
 * Ends an object's declassification when it gains content the approval never saw, such as new
 * author output: a new version without the override, recomputed from its own lane and inputs, which
 * then propagates. A no-op for an object with no override.
 */
export async function endOverride(c: Tx, kind: string, id: string, reason: string): Promise<void> {
  await lock(c);
  const m = await currentMarking(c, kind, id);
  if (!m?.override) return;
  const { effective_lane: _e, change_request_id: _cr, override: _o, ...rest } = m;
  await write(c, { ...rest, version: m.version + 1, reason });
  await recomputeDerived(c, kind, id, reason);
}

/**
 * The current marking version of each input. An input with no classified lane is refused: nothing
 * unclassified may flow into another object, since whatever reads that object would receive it.
 */
async function resolve(c: Tx, inputs: Ref[]): Promise<MarkingInput[]> {
  const out: MarkingInput[] = [];
  for (const i of inputs) {
    if (out.some((o) => o.object_kind === i.kind && o.object_id === i.id)) continue;
    const m = await ensureMarking(c, i.kind, i.id);
    if (!m) throw new Refusal(409, "unclassified-source", `${i.kind} ${i.id} has no classified data lane; classify it before using it as a source`);
    out.push({ object_kind: i.kind, object_id: i.id, version: m.version });
  }
  return out;
}

/**
 * Marks an object at creation with its lane and the objects it was derived from. Marking an object
 * that already has a marking adds inputs or raises; it never lowers (that is a declassification).
 */
export async function markObject(c: Tx, kind: string, id: string, lane: DataLane, reason: string, inputs: Ref[] = []): Promise<Marking> {
  await lock(c);
  // A stored package's first marking always carries its own sources (ensureMarking), whoever marks it.
  const existing = kind === "package" ? await ensureMarking(c, kind, id) : await currentMarking(c, kind, id);
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
  // Every new version propagates, even at the same lane: a declassification downstream covers exact
  // input versions, so a changed input must reach it.
  await recomputeDerived(c, kind, id, reason);
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
  // Each object is recomputed only after every object in the set it was derived from, so a diamond
  // (A to B, A to C, B to C) never reads a stale intermediate.
  const set = await downstreamOf(c, kind, id);
  const key = (r: Ref) => `${r.kind}/${r.id}`;
  const pending = new Map(set.map((r) => [key(r), r]));
  const ordered: Ref[] = [];
  while (pending.size) {
    let progressed = false;
    for (const [k, r] of pending) {
      const m = await currentMarking(c, r.kind, r.id);
      const waits = (m?.inputs ?? []).some((i) => pending.has(`${i.object_kind}/${i.object_id}`));
      if (waits) continue;
      ordered.push(r);
      pending.delete(k);
      progressed = true;
    }
    if (!progressed) throw new Error(`marking provenance has a cycle among ${[...pending.keys()].join(", ")}`);
  }
  for (const d of ordered) {
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
  await lock(c);
  const m = await currentMarking(c, kind, id);
  if (!m) throw new Refusal(404, "not-found", "This object has no marking");
  if (m.version !== version)
    throw new Refusal(409, "marking-changed", `The marking moved from version ${version} to ${m.version} after the change request was made; propose it again`);
  if (covers(lane, effectiveLane(m))) throw new Refusal(409, "not-lower", `The object is already ${effectiveLane(m)}; declassification only lowers`);
  const { effective_lane: _e, ...rest } = m;
  const cause = `declassified to ${lane} by change request ${changeRequestId}`;
  const written = await write(c, { ...rest, version: m.version + 1, override: { lane, change_request_id: changeRequestId, covered: m.inputs ?? [] },
    change_request_id: changeRequestId, reason: cause });
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
