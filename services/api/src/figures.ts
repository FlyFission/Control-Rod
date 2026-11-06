import type { Db } from "./db/index.js";
import { isLane } from "./disclosure.js";
import { inbox } from "./inbox.js";
import { budgetOfHold, budgetStatuses } from "./budgets.js";
import { callerFor } from "./admin.js";
import { effectiveLane } from "./markings.js";
import { scramHoldIndex } from "./scram.js";
import type { WorkConfig } from "./work.js";

/**
 * The AgentFigure projection (specification 13 and 18; plan task 4.6): one figure per agent at the
 * current revision of its package (or on its capture, for intake), its state, cause and place derived
 * only from recorded data. The viewer's standing comes from the Inbox, so Your office holds exactly
 * the agents whose next step is the viewer's (OV-01, OV-05). Reads are batched: a handful of queries
 * per refresh, whatever the number of packages.
 */

type Json = Record<string, any>;
type State = "working" | "needs" | "waiting" | "stuck" | "changed";
type Place =
  | "process" | "mechanical" | "electrical" | "civil" | "assurance" | "project-controls"
  | "review" | "interface" | "verification" | "your-office" | "document-control" | "bench" | "quarantine";

const withSpend = <T>(spend: T | undefined) => (spend === undefined ? {} : { spend });

/** Lanes shown in presenting mode; everything above internal is left out and only counted. */
const PRESENTABLE = new Set(["public", "internal"]);

/**
 * A package's discipline, as free text, to its cube set. Matched by the words a discipline name uses;
 * an unset or unmatched discipline stands in Process and the figure says so.
 */
const CUBE_WORDS: [Place, RegExp][] = [
  // Project controls first: "controls" alone means instrumentation and controls.
  ["project-controls", /project|schedul|cost|estimat|procure/],
  ["mechanical", /mechanical|piping|hvac|plumbing|fire/],
  ["electrical", /electrical|instrument|controls?\b|i&c|power/],
  ["civil", /civil|structural|architect|geotech|site/],
  ["assurance", /quality|safety|regulat|licens|assurance|nqa/],
  ["process", /process|chemical|nuclear|reactor|fuel/],
];
export function cubeFor(discipline: unknown): { place: Place; defaulted: boolean } {
  const d = typeof discipline === "string" ? discipline.toLowerCase() : "";
  for (const [place, words] of CUBE_WORDS) if (d && words.test(d)) return { place, defaulted: false };
  return { place: "process", defaulted: true };
}

const ROLE_WORDS: Record<string, string> = {
  author: "Author run",
  "pre-check": "Pre-check run",
  intake: "Intake run",
  "requirements-preparer": "Requirements preparation run",
  "technical-preparer": "Technical preparation run",
};

const clip = (s: string) => (s.length > 300 ? `${s.slice(0, 299)}…` : s);

/** The nearest gate, for the Gate lens. */
function gateStage(status: string, pending: Json[]): "release" | "in-work" | "pre-check" | "accept" | "settled" {
  if (status === "draft") return "release";
  if (status === "accepted" || status === "closed") return "settled";
  if (pending.some((i) => i.kind === "accept")) return "accept";
  if (status === "in-verification") return "pre-check";
  return "in-work";
}

interface RunRow {
  id: string;
  package_id: string;
  role: string;
  round: number;
  status: string;
  body: Json;
  created_at: Date;
}

export async function officeFigures(db: Db, cfg: WorkConfig, user: string, presenting = false) {
  const box = await inbox(db, cfg, user);
  // Only the caller's organization's packages and captures become figures.
  const orgId = (await callerFor(db, user)).orgId;
  const shape = (t: Awaited<ReturnType<typeof budgetStatuses>>[number]) => ({
    budget_id: t.budget.id, mode: t.budget.mode, unit: t.budget.limit.unit, limit: t.budget.limit.value, period: t.budget.period, state: t.state,
    ...(t.used === null ? {} : { used: t.used.toFixed(2) }), ...(t.unreported_runs > 0 ? { unreported_runs: t.unreported_runs } : {}),
  });
  // Spend: each budget's use this window, read once; a figure carries its tightest applicable budget.
  // Never while presenting (specification 13: presenting mode shows no spend).
  // Suspended budgets stay on Usage but govern nothing, so they never drive a figure.
  const statuses = presenting ? [] : (await budgetStatuses(db, (await callerFor(db, user)).orgId)).filter((t) => t.budget.status === "active");
  const spendOf = (projectId: string | undefined, run: Json) => {
    // A run a budget holds names that budget, whatever baseline it would have run as.
    const holding = budgetOfHold(run).budget_id;
    const mine = statuses.filter(({ budget: b }) => b.id === holding || b.scope === "organization" || (b.scope === "project" && b.scope_id === projectId) || (b.scope === "agent" && b.scope_id === run.agent_baseline));
    if (!mine.length) return undefined;
    if (holding) {
      const h = mine.find((x) => x.budget.id === holding);
      if (h) return shape(h);
    }
    // The tightest: the highest share of its limit used; a budget whose use is not reported counts last.
    const share = (x: (typeof mine)[number]) => (x.used === null ? -1 : x.used / Number(x.budget.limit.value));
    return shape([...mine].sort((a, b) => share(b) - share(a) || a.budget.id.localeCompare(b.budget.id))[0]!);
  };
  // Items arrive in gate risk order; the first for a subject is the one that matters most.
  const firstBy = (items: Json[], key: "package_id" | "capture_id") => {
    const m = new Map<string, Json>();
    for (const i of items) if (i[key] && !m.has(i[key])) m.set(i[key], i);
    return m;
  };
  const mine = firstBy(box.items, "package_id");
  const others = firstBy(box.waiting_on_others, "package_id");
  const mineCapture = firstBy(box.items, "capture_id");
  const othersCapture = firstBy(box.waiting_on_others, "capture_id");
  const pendingFor = new Map<string, Json[]>();
  for (const i of [...box.items, ...box.waiting_on_others]) if (i.package_id) pendingFor.set(i.package_id, [...(pendingFor.get(i.package_id) ?? []), i]);

  const packages = (
    await db.query<{ id: string; revision: number; status: string; body: Json }>(
      `select distinct on (p.id) p.id, p.revision, p.status, p.body from packages p
         join object_owners o on o.object_kind = 'package' and o.object_id = p.id and o.org_id = $1
        order by p.id, p.revision desc`,
      [orgId],
    )
  ).rows;
  // The latest run at each package's current revision, in one read.
  const runs = new Map(
    (
      await db.query<RunRow>(
        `select distinct on (r.package_id) r.id, r.package_id, r.role, r.round, r.status, r.body, r.created_at
           from runs r join (select distinct on (id) id, revision from packages order by id, revision desc) c
             on c.id = r.package_id and c.revision = r.package_revision
          where r.role <> 'intake'
          order by r.package_id, r.created_at desc`,
      )
    ).rows.map((r) => [r.package_id, r]),
  );
  // Each package's current effective lane: its marking when it has one (raises and inherited
  // classification included), else the lane its body states.
  const lanes = new Map(
    (
      await db.query<{ object_id: string; body: Json }>(
        "select distinct on (object_id) object_id, body from object_markings where object_kind = 'package' order by object_id, version desc",
      )
    ).rows.map((m) => [m.object_id, effectiveLane(m.body as never)]),
  );
  // Recorded dependencies at the current revision, with each target's latest revision and status.
  const deps = new Map<string, { depends_on: string; revision: number; status: string }[]>();
  for (const d of (
    await db.query<{ package_id: string; depends_on: string; revision: number; status: string }>(
      `select d.package_id, d.depends_on, t.revision, t.status
         from package_dependencies d
         join (select distinct on (id) id, revision from packages order by id, revision desc) c on c.id = d.package_id and c.revision = d.package_revision
         join lateral (select revision, status from packages where id = d.depends_on order by revision desc limit 1) t on true
        order by d.package_id, d.depends_on`,
    )
  ).rows)
    deps.set(d.package_id, [...(deps.get(d.package_id) ?? []), d]);
  // The revision of each package a preparation basis pinned, the baseline for "input changed".
  const pinned = new Map<string, Map<string, number>>();
  for (const b of (
    await db.query<{ package_id: string; basis: Json[] | null }>(
      `select h.package_id, s.body->'basis' as basis from preparation_heads h
         join preparation_snapshots s on s.preparation_id = h.preparation_id and s.revision = h.revision`,
    )
  ).rows) {
    const m = new Map<string, number>();
    for (const e of b.basis ?? []) if (e?.kind === "package" && String(e.reference).startsWith("package:")) m.set(String(e.reference).slice(8), Number(e.revision));
    pinned.set(b.package_id, m);
  }
  // The project that owns each package and capture, for the portfolio rollup.
  const projects = new Map(
    (await db.query<{ object_kind: string; object_id: string; project_id: string | null }>(
      "select object_kind, object_id, project_id from object_owners where object_kind in ('package', 'capture') and project_id is not null",
    )).rows.map((o) => [`${o.object_kind}:${o.object_id}`, o.project_id!]),
  );
  // SCRAM holds for every agent from one load of the active SCRAMs, owners and restarts.
  const holdOf = await scramHoldIndex(db);
  const currentRevision = new Map(packages.map((p) => [p.id, p.revision]));

  const figures: Json[] = [];
  let hidden = 0;
  for (const p of packages) {
    if (p.status === "accepted" || p.status === "closed") continue;
    const run = runs.get(p.id);
    // No agent at this revision (a draft, or a returned package before its new run): its decision
    // is in the Inbox, counted by inbox_items, not drawn as an agent.
    if (!run) continue;
    // Fail closed: a lane that cannot be read counts as above internal.
    const lane = lanes.get(p.id) ?? (isLane(p.body.data_lane) ? p.body.data_lane : "restricted");
    if (presenting && !PRESENTABLE.has(lane)) {
      hidden++;
      continue;
    }
    const held = holdOf({ kind: "package", id: p.id, ...(typeof p.body.discipline === "string" ? { discipline: p.body.discipline } : {}) });
    const cube = cubeFor(p.body.discipline);
    const pending = pendingFor.get(p.id) ?? [];
    const changed = changedInput(deps.get(p.id) ?? [], pinned.get(p.id), currentRevision);
    const { hash, ...figure } = project({
      run, held, cube, own: mine.get(p.id), theirs: others.get(p.id), changed, presenting,
      // Dispatch holds only an author run on a released package for its dependencies (claim in
      // work.ts); any other queued run is not waiting on them.
      unaccepted: run.role === "author" && p.status === "released" ? (deps.get(p.id) ?? []).filter((d) => d.status !== "accepted").map((d) => d.depends_on) : [],
    });
    figures.push({
      id: run.id,
      package_id: p.id,
      package_revision: p.revision,
      title: String(p.body.title ?? p.id),
      role: run.role,
      ...figure,
      ...(cube.defaulted && figure.place === cube.place ? { place_defaulted: true } : {}),
      marks: {
        gate: pending.some((i) => i.kind === "release" || i.kind === "accept" || i.kind === "confirm"),
        ...(changed.changed ? { changed_input: changed.changed.input } : {}),
        ...(run.round > 1 ? { loop: run.round } : {}),
        safety: p.body.grade === "safety",
      },
      ...(changed.unverified.length ? { unverified_inputs: changed.unverified } : {}),
      ...(changed.fresh.length ? { current_inputs: changed.fresh } : {}),
      gate_stage: gateStage(p.status, pending),
      ...(run.body.permission_waits === "not-observable" ? { observability: "permission waits not observable in print mode" } : {}),
      data_lane: lane,
      ...(projects.has(`package:${p.id}`) ? { project_id: projects.get(`package:${p.id}`) } : {}),
      ...withSpend(spendOf(projects.get(`package:${p.id}`), run.body)),
      run_status: run.status,
      ...(run.body.stop_requested_at ? { stop_requested: true } : {}),
      href: { to: "/packages/$id", id: p.id, hash },
    });
  }

  // Intake agents work on captures, before any package exists.
  const intakes = (
    await db.query<RunRow & { text: string | null }>(
      `select distinct on (r.package_id) r.id, r.package_id, r.role, r.round, r.status, r.body, r.created_at, c.body->>'text' as text
         from runs r left join captures c on c.id = r.package_id
         join object_owners o on o.object_kind = 'capture' and o.object_id = r.package_id and o.org_id = $1
        where r.role = 'intake' order by r.package_id, r.created_at desc`,
      [orgId],
    )
  ).rows;
  const captureLanes = new Map(
    (
      await db.query<{ object_id: string; body: Json }>(
        "select distinct on (object_id) object_id, body from object_markings where object_kind = 'capture' order by object_id, version desc",
      )
    ).rows.map((m) => [m.object_id, effectiveLane(m.body as never)]),
  );
  // A capture whose intake produced a package is settled; its work is on that package's figure.
  const promoted = new Set(
    (await db.query<{ capture_id: string }>("select distinct capture_id from packages where capture_id is not null")).rows.map((r) => r.capture_id),
  );
  for (const run of intakes) {
    const own = mineCapture.get(run.package_id);
    const theirs = othersCapture.get(run.package_id);
    // Active intake, anything the Inbox routes, and an intake that failed, stopped or was lost
    // (an unknown outcome included) before its capture became a package: none may vanish.
    const unresolved = (run.status === "failed" || run.status === "stopped" || run.status === "lost") && !promoted.has(run.package_id);
    if (!own && !theirs && run.status !== "queued" && run.status !== "running" && !unresolved) continue;
    // Fail closed: a capture with no marking counts as above internal.
    const lane = captureLanes.get(run.package_id) ?? "restricted";
    if (presenting && !PRESENTABLE.has(lane)) {
      hidden++;
      continue;
    }
    const held = holdOf({ kind: "capture", id: run.package_id });
    const { hash: _hash, ...figure } = project({ run, held, cube: { place: "interface" }, own, theirs, changed: { changed: null }, unaccepted: [], presenting });
    const first = (run.text ?? "").split("\n")[0]!.trim();
    figures.push({
      id: run.id,
      package_id: run.package_id,
      package_revision: 0,
      title: `Intake: ${first.length > 80 ? `${first.slice(0, 79)}…` : first || run.package_id}`,
      role: run.role,
      ...figure,
      marks: { gate: false, safety: false },
      gate_stage: "release",
      data_lane: lane,
      ...(projects.has(`capture:${run.package_id}`) ? { project_id: projects.get(`capture:${run.package_id}`) } : {}),
      ...withSpend(spendOf(projects.get(`capture:${run.package_id}`), run.body)),
      run_status: run.status,
      ...(run.body.stop_requested_at ? { stop_requested: true } : {}),
      href: { to: "/packages" },
    });
  }

  return {
    figures,
    needs_me: figures.filter((f) => f.place === "your-office").length,
    // Everything the Inbox holds for the viewer, agents or not, so the floor never claims less.
    inbox_items: box.items.length,
    hidden,
    generated_at: new Date().toISOString(),
  };
}

/**
 * One agent's state, cause and place, in order of what matters most:
 * an active SCRAM hold (Quarantine); anything whose next step is the viewer's (Your office, OV-05:
 * permissions, signatures and disputes); disputes and lost runs someone else rules on (Review); an
 * unknown outcome (Review); work waiting on someone else (Interface, by name); a failed, stopped or
 * lost run (Review); an input that changed since the preparation pinned it; a running run; a queued
 * run held by a recorded hold or by unaccepted dependencies (Interface); queued for a runtime (Bench).
 */
function project(a: {
  run: RunRow;
  held: Json | null;
  cube: { place: Place };
  own: Json | undefined;
  theirs: Json | undefined;
  changed: { changed: { input: string; revision: number } | null };
  unaccepted: string[];
  presenting: boolean;
}): { state: State; cause: string; cause_key: string; place: Place; since: string; waiting_on?: string; hash: string } {
  const { run, held, own, theirs } = a;
  const r = run.body;
  const at = (v: unknown) => (typeof v === "string" && v ? v : run.created_at.toISOString());
  const role = ROLE_WORDS[run.role] ?? "Run";
  const work: Place = run.role === "pre-check" ? "verification" : a.cube.place;
  // Each cause carries a key naming the recorded thing behind it (a SCRAM, a hold, an input revision,
  // the dependencies awaited, or the run itself), so agents are grouped by what holds them and never
  // by matching prose (OV-03). A key unique to the run means its cause is its own.
  const itself = `run:${run.id}`;
  // A SCRAM hold's recorded words carry its reason. Presenting, they are never shown, even if a
  // restart has lifted the hold and the words are still on the run until its next claim attempt.
  // The run's own record and the Inbox items both say when their words came from a SCRAM, so a
  // restart landing between the two reads cannot let the reason through either way.
  const scramWords = a.presenting && (r.waiting_cause === "scram" || Boolean(own?.scram_id) || Boolean(theirs?.scram_id));
  // A budget hold's words state spend (use, ceiling, cap), which presenting never shows.
  const budgetWords = a.presenting && (r.waiting_cause === "budget" || Boolean(own?.budget_id) || Boolean(theirs?.budget_id));
  const out = (state: State, place: Place, cause: string, since: string, extra: { waiting_on?: string; hash?: string; key?: string } = {}) =>
    ({ state, place, cause: clip(scramWords && !held ? `${role} was held by a SCRAM; its reason is not shown while presenting`
      : budgetWords ? `${role} is held by a budget; spend is not shown while presenting` : cause), cause_key: extra.key ?? itself, since,
      hash: extra.hash ?? "runs", ...(extra.waiting_on ? { waiting_on: extra.waiting_on } : {}) });
  // A hold is shared only where dispatch recorded what it waits on (waiting_key: a lane's admission, or
  // a runtime pin for a role and the runtimes offered), so one decision resolves it for every run that
  // names it. Any other hold is this run's own, however alike the messages read.
  // Presenting, a budget's identifier is spend detail too, so a budget hold groups under its cause alone.
  const holdKey = (who: string) => (typeof r.waiting_key === "string" && r.waiting_key
    ? `hold:${budgetWords && r.waiting_key.startsWith("budget:") ? "budget" : r.waiting_key}\u0000${who}` : itself);

  if (held)
    return out("stuck", "quarantine",
      // Presenting, a SCRAM's reason is never shown, as GET /scrams?presenting=true leaves it out.
      `${run.status === "stopped" || r.scram_id ? `${role} stopped by` : "Held by"} SCRAM ${held.id}${held.reason && !a.presenting ? `: ${held.reason}` : ""}`,
      at(held.recorded_at ?? held.pulled_at ?? r.finished_at ?? r.queued_at), { key: `scram:${held.id}` });
  if (own) return out("needs", "your-office", String(own.detail ?? own.title), String(own.since), { hash: String(own.href?.hash ?? "decide") });
  if (theirs && (theirs.kind === "dispute" || theirs.kind === "lost")) {
    const who = String(theirs.waiting_on ?? "someone else");
    return out("stuck", "review", theirs.reason ? `${theirs.detail} Waiting on ${who}: ${theirs.reason}.` : String(theirs.detail ?? theirs.title), String(theirs.since), { waiting_on: who });
  }
  if (r.outcome_unknown && !r.reconciliation)
    return out("stuck", "review", `Outcome unknown since ${r.outcome_unknown.since}: ${r.outcome_unknown.reason}. It must be reconciled before the work moves on.`, at(r.outcome_unknown.since));
  if (theirs) {
    const who = String(theirs.waiting_on ?? "someone else");
    // A permission item is the run's recorded hold; any other item is this agent's own decision.
    const key = theirs.kind === "permission" && run.status === "queued" && r.waiting_reason ? holdKey(who) : itself;
    return out("waiting", "interface", theirs.reason ? `${theirs.detail}. ${theirs.reason}` : String(theirs.detail ?? theirs.title), String(theirs.since), { waiting_on: who, key });
  }
  if (run.status === "failed" || run.status === "stopped" || run.status === "lost") {
    const what = run.status === "failed" ? `failed${r.error ? `: ${r.error}` : ""}` : run.status === "stopped" ? "was stopped" : "was lost when its daemon stopped renewing the lease";
    return out("stuck", "review", `${role} ${what}`, at(r.finished_at));
  }
  if (a.changed.changed)
    return out("changed", a.cube.place, `Input ${a.changed.changed.input} moved to revision ${a.changed.changed.revision} after the preparation pinned it`, at(r.started_at ?? r.queued_at),
      { key: `input:${a.changed.changed.input}@${a.changed.changed.revision}` });
  if (run.status === "running") return out("working", work, r.label ? String(r.label) : `${role}, round ${run.round}`, at(r.started_at));
  if (run.status === "queued" && r.waiting_reason)
    return out("waiting", "interface", String(r.waiting_reason), at(r.queued_at), { waiting_on: "whoever may resolve the hold", key: holdKey("whoever may resolve the hold") });
  if (run.status === "queued" && a.unaccepted.length)
    return out("waiting", "interface", `${role} waits for ${a.unaccepted.join(", ")} to be accepted`, at(r.queued_at), { waiting_on: `the work it depends on (${a.unaccepted.join(", ")})`, key: `deps:${run.role}:${[...a.unaccepted].sort().join(",")}` });
  if (run.status === "queued") return out("waiting", "bench", `${role} queued for a runtime`, at(r.queued_at), { waiting_on: "a runtime", key: `queue:${run.role}` });
  return out("waiting", "bench", `${role} finished; the next step has not started`, at(r.finished_at), { waiting_on: "the next step" });
}

/**
 * Whether an input moved past the revision the preparation pinned: every package the preparation's
 * basis pinned (a design input or a dependency alike) is compared with its current revision. A
 * recorded dependency no basis pinned has no baseline, so its freshness is unknown and said so,
 * never guessed.
 */
function changedInput(deps: { depends_on: string }[], basis: Map<string, number> | undefined, current: Map<string, number>) {
  let changed: { input: string; revision: number } | null = null;
  const fresh: string[] = [];
  for (const [input, was] of basis ?? []) {
    const now = current.get(input);
    if (now === undefined || Number.isNaN(was)) continue;
    if (now > was) changed ??= { input, revision: now };
    else fresh.push(input);
  }
  const unverified = deps.map((d) => d.depends_on).filter((id) => {
    const was = basis?.get(id);
    return was === undefined || Number.isNaN(was);
  });
  return { changed, unverified, fresh };
}
