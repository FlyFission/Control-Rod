import type { Db } from "./db/index.js";
import { inbox } from "./inbox.js";
import { scramHolding, runSubject } from "./scram.js";
import type { WorkConfig } from "./work.js";

/**
 * The AgentFigure projection (specification 13 and 18; plan task 4.6): one figure per package with an
 * agent at its current revision, its state, cause and place derived only from recorded data. The
 * viewer's standing comes from the Inbox, so "needs you" means exactly what the Inbox counts (OV-01).
 */

type Json = Record<string, any>;
type State = "working" | "needs" | "waiting" | "stuck" | "changed";
type Place =
  | "process" | "mechanical" | "electrical" | "civil" | "assurance" | "project-controls"
  | "review" | "interface" | "verification" | "your-office" | "document-control" | "bench" | "quarantine";

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

export async function officeFigures(db: Db, cfg: WorkConfig, user: string, presenting = false) {
  const box = await inbox(db, cfg, user);
  const byPackage = (items: Json[]) => {
    const m = new Map<string, Json>();
    // Items arrive in gate risk order; the first for a package is the one that matters most.
    for (const i of items) if (i.package_id && !m.has(i.package_id)) m.set(i.package_id, i);
    return m;
  };
  const mine = byPackage(box.items);
  const others = byPackage(box.waiting_on_others);
  const pending = [...box.items, ...box.waiting_on_others];

  const packages = (
    await db.query<{ id: string; revision: number; status: string; body: Json; created_at: Date }>(
      "select distinct on (id) id, revision, status, body, created_at from packages order by id, revision desc",
    )
  ).rows;

  const figures: Json[] = [];
  let hidden = 0;
  for (const p of packages) {
    if (p.status === "accepted" || p.status === "closed") continue;
    const run = (
      await db.query<{ id: string; role: string; round: number; status: string; body: Json; created_at: Date }>(
        "select id, role, round, status, body, created_at from runs where package_id = $1 and package_revision = $2 order by created_at desc limit 1",
        [p.id, p.revision],
      )
    ).rows[0];
    if (!run) continue; // No agent has touched this revision yet: a draft is an Inbox decision, not a figure.
    const lane = String(p.body.data_lane ?? "internal");
    if (presenting && !PRESENTABLE.has(lane)) {
      hidden++;
      continue;
    }

    const title = String(p.body.title ?? p.id);
    const cube = cubeFor(p.body.discipline);
    const workPlace: Place = run.role === "pre-check" ? "verification" : cube.place;
    const r = run.body;
    const since = (v: unknown, fallback: Date) => (typeof v === "string" && v ? v : fallback.toISOString());
    const changed = await changedInput(db, p.id, p.revision, p.created_at);
    const forPackage = pending.filter((i) => i.package_id === p.id);
    // An active SCRAM reaching this work, which a restart has not lifted (with its recorded reason).
    const held = await scramHolding(db, await runSubject(db, { role: run.role, package_id: p.id }));

    let state: State;
    let cause: string;
    let place: Place;
    let at: string;
    let waitingOn: string | undefined;
    let hash = "runs";
    const own = mine.get(p.id);
    const theirs = others.get(p.id);
    // Disputes and lost runs are ruled on in Review (specification 13), whoever may rule; gate
    // decisions and permission holds the viewer may act on stand in Your office.
    const ruling = [own, theirs].find((i) => i && (i.kind === "dispute" || i.kind === "lost"));
    if (held && (r.scram_id || run.status === "queued" || run.status === "stopped")) {
      state = "stuck";
      place = "quarantine";
      cause = `Stopped by SCRAM ${held.id}${held.reason ? `: ${held.reason}` : ""}`;
      at = since(r.finished_at ?? r.stop_requested_at ?? r.queued_at, run.created_at);
    } else if (ruling) {
      state = "stuck";
      place = "review";
      if (ruling === theirs) waitingOn = String(theirs.waiting_on ?? "someone else");
      cause = ruling === theirs && theirs.reason ? `${ruling.detail} Waiting on ${waitingOn}: ${theirs.reason}.` : String(ruling.detail ?? ruling.title);
      at = String(ruling.since);
      hash = String(ruling.href?.hash ?? "runs");
    } else if (own) {
      state = "needs";
      place = "your-office";
      cause = String(own.detail ?? own.title);
      at = String(own.since);
      hash = String(own.href?.hash ?? "decide");
    } else if (r.outcome_unknown && !r.reconciliation) {
      state = "stuck";
      place = "review";
      cause = `Outcome unknown since ${r.outcome_unknown.since}: ${r.outcome_unknown.reason}. It must be reconciled before the work moves on.`;
      at = since(r.outcome_unknown.since, run.created_at);
    } else if (theirs) {
      state = "waiting";
      place = "interface";
      waitingOn = String(theirs.waiting_on ?? "someone else");
      cause = theirs.reason ? `${theirs.detail}. ${theirs.reason}` : String(theirs.detail ?? theirs.title);
      at = String(theirs.since);
    } else if (run.status === "failed" || run.status === "stopped" || run.status === "lost") {
      state = "stuck";
      place = "review";
      const what = run.status === "failed" ? `failed${r.error ? `: ${r.error}` : ""}` : run.status === "stopped" ? "was stopped" : "was lost when its daemon stopped renewing the lease";
      cause = `${ROLE_WORDS[run.role] ?? "Run"} ${what}`;
      at = since(r.finished_at, run.created_at);
    } else if (changed) {
      state = "changed";
      place = cube.place;
      cause = `Input ${changed.input} moved to revision ${changed.revision} after this revision was prepared`;
      at = changed.at;
    } else if (run.status === "running") {
      state = "working";
      place = workPlace;
      cause = r.label ? String(r.label) : `${ROLE_WORDS[run.role] ?? "Run"}, round ${run.round}`;
      at = since(r.started_at, run.created_at);
    } else if (run.status === "queued" && r.waiting_reason) {
      state = "waiting";
      place = "interface";
      waitingOn = "whoever may resolve the hold";
      cause = String(r.waiting_reason);
      at = since(r.queued_at, run.created_at);
    } else if (run.status === "queued") {
      state = "waiting";
      place = "bench";
      waitingOn = "a runtime";
      cause = `${ROLE_WORDS[run.role] ?? "Run"} queued for a runtime`;
      at = since(r.queued_at, run.created_at);
    } else {
      state = "waiting";
      place = "bench";
      waitingOn = "the next step";
      cause = `${ROLE_WORDS[run.role] ?? "Run"} finished; the next step has not started`;
      at = since(r.finished_at, run.created_at);
    }

    figures.push({
      id: run.id,
      package_id: p.id,
      package_revision: p.revision,
      title,
      role: run.role,
      state,
      cause: clip(cause),
      ...(waitingOn ? { waiting_on: waitingOn } : {}),
      since: at,
      place,
      ...(cube.defaulted && (place === cube.place) ? { place_defaulted: true } : {}),
      marks: {
        gate: forPackage.some((i) => i.kind === "release" || i.kind === "accept" || i.kind === "confirm"),
        ...(changed ? { changed_input: changed.input } : {}),
        ...(run.round > 1 ? { loop: run.round } : {}),
        safety: p.body.grade === "safety",
      },
      gate_stage: gateStage(p.status, forPackage),
      ...(r.permission_waits === "not-observable" ? { observability: "permission waits not observable in print mode" } : {}),
      data_lane: lane,
      href: { to: "/packages/$id", id: p.id, hash },
    });
  }
  return {
    figures,
    needs_me: figures.filter((f) => f.place === "your-office").length,
    hidden,
    generated_at: new Date().toISOString(),
  };
}

/** A recorded dependency whose target gained a revision after this package revision was made. */
async function changedInput(db: Db, id: string, revision: number, madeAt: Date) {
  const r = await db.query<{ depends_on: string; revision: number; created_at: Date }>(
    `select d.depends_on, t.revision, t.created_at
       from package_dependencies d
       join lateral (select revision, created_at from packages where id = d.depends_on order by revision desc limit 1) t on true
      where d.package_id = $1 and d.package_revision = $2 and t.revision > 0 and t.created_at > $3
      order by t.created_at desc limit 1`,
    [id, revision, madeAt],
  );
  const row = r.rows[0];
  return row ? { input: row.depends_on, revision: row.revision, at: row.created_at.toISOString() } : null;
}
