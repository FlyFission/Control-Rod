import type { Db } from "./db/index.js";
import { callerFor } from "./admin.js";
import { highConsequence, needsOf } from "./authority.js";
import { scramAttention } from "./scram.js";
import { type WorkConfig, currentPackage, office, packageActions, subjectOf } from "./work.js";

/**
 * The Inbox (specification 12, AttentionItem in 5.11; plan task 3.3): what waits on the viewing
 * person, ordered by gate risk then age, each decision stating exactly what a signature would bind;
 * what waits on someone else, apart; and a six line "since you last looked" digest (OV-01, OV-09).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

/** Items older than this count as late in the digest. */
export const LATE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Decisions each kind of item asks for. */
const DECISIONS: Record<string, string[]> = {
  release: ["release"],
  accept: ["accept", "accept-with-findings", "return", "reject"],
  dispute: ["return", "reject", "accept-with-findings"],
};

const RIGOR_TIER: Record<string, number> = { "high-consequence": 0, standard: 1, quick: 2, administrative: 3 };
const GATE_LABEL = ["High consequence gate", "Standard gate", "Quick gate", "Administrative gate"];

/**
 * Gate risk, highest first: a security hold, an agent held waiting, an unknown outcome, a dispute,
 * then gate decisions by consequence (Safety and Material grade or high consequence rigor first).
 */
export function gateRisk(kind: string, pkg: Json | undefined, outcomeUnknown = false): { rank: number; label: string } {
  switch (kind) {
    case "scram":
      return { rank: 0, label: "Security hold" };
    case "permission":
      return { rank: 10, label: "Holds an agent" };
    case "lost":
      return outcomeUnknown ? { rank: 20, label: "Outcome unknown" } : { rank: 21, label: "Run lost" };
    case "dispute":
      return { rank: 30, label: "Dispute" };
  }
  const tier = pkg && highConsequence(needsOf(pkg)) ? 0 : (RIGOR_TIER[String(pkg?.rigor_mode)] ?? 1);
  return { rank: 40 + tier, label: GATE_LABEL[tier]! };
}

const article = (w: string) => `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;
const short = (d: string) => `sha256:${d.slice(0, 12)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The sentence a signer reads before signing: what the digest covers, in words. */
export function bindingSentence(kind: string, pkg: Json, revision: number, outputs: number, preCheck: Json | null, digest: string): string {
  if (kind === "release")
    return `Signing releases revision ${revision} of ${pkg.id} as drafted: ${plural(pkg.acceptance_criteria?.length ?? 0, "acceptance criterion", "acceptance criteria")} and ${plural(pkg.deliverables?.length ?? 0, "deliverable")} (${short(digest)}).`;
  const check = preCheck === null ? "no pre-check" : `its pre-check (${preCheck.outcome}, ${plural(preCheck.findings?.length ?? 0, "finding")})`;
  return `Signing binds revision ${revision} of ${pkg.id}, ${plural(outputs, "output")} and ${check} (${short(digest)}).`;
}

export async function inbox(db: Db, cfg: WorkConfig, user: string, since?: number) {
  const caller = await callerFor(db, user);
  const mine: Json[] = [];
  const others: Json[] = [];
  for (const it of await office(db)) {
    const pkg = await currentPackage(db, it.package_id);
    const body = pkg?.body;
    const lastRun = it.kind === "lost"
      ? (await db.query<{ body: Json }>("select body from runs where package_id = $1 and package_revision = $2 order by created_at desc limit 1", [it.package_id, it.package_revision])).rows[0]?.body
      : undefined;
    const risk = gateRisk(it.kind, body, Boolean(lastRun?.outcome_unknown && !lastRun?.reconciliation));
    const wanted = DECISIONS[it.kind];
    if (!wanted || !pkg) {
      // Holds on runs (a waiting agent, a lost run) are the owner's to settle: requeue, reconcile, stop.
      mine.push({ ...it, risk, href: { to: "/packages/$id", id: it.package_id, hash: "runs" } });
      continue;
    }
    const actions = (await packageActions(db, cfg, user, it.package_id)).filter((a: Json) => wanted.includes(a.command));
    const allowed = actions.filter((a: Json) => a.allowed).map((a: Json) => a.command);
    const s = await subjectOf(db, pkg);
    const binds = bindingSentence(it.kind, { ...body, id: pkg.id }, pkg.revision, s.outputs.length, s.verification, s.digest);
    const base = { ...it, risk, binds, subject_digest: { algorithm: "sha256", value: s.digest }, href: { to: "/packages/$id", id: it.package_id, hash: "decide" } };
    if (allowed.length > 0 || (it.kind === "dispute" && !s.verification)) {
      // A dispute from a failed or stopped run can always be requeued by the owner.
      mine.push({ ...base, decisions: allowed });
    } else {
      const refused = actions.find((a: Json) => !a.allowed);
      const roles = [...new Set(actions.flatMap((a: Json) => a.authority ?? []))] as string[];
      others.push({ ...base, decisions: [], waiting_on: roles.length ? `someone who is ${roles.map(article).join(" or ")}` : "someone qualified",
        ...(refused?.reason ? { reason: refused.reason } : {}) });
    }
  }
  for (const a of await scramAttention(db, caller.orgId)) {
    // Every blocker is named; "ready" is said only when a full restart would be accepted.
    const blockers = [
      a.stopping > 0 ? `${plural(a.stopping, "run")} still stopping` : "",
      a.unknown > 0 ? `${plural(a.unknown, "run")} in scope with an unknown outcome to reconcile` : "",
      a.unreviewed > 0 ? `${plural(a.unreviewed, "stopped run")} to review` : "",
    ].filter(Boolean);
    const detail = blockers.length > 0
      ? `Before a restart: ${blockers.join("; ")}. Nothing in scope runs until then.`
      : "Nothing blocks a restart; restart when it is safe.";
    mine.push({ kind: "scram", scram_id: a.scram.id, title: `SCRAM: ${a.scram.reason}`, detail, since: a.since,
      risk: gateRisk("scram", undefined), href: { to: "/policies", hash: a.unreviewed > 0 ? "command-scram.review" : "command-scram.restart" } });
  }
  const order = (x: Json, y: Json) => x.risk.rank - y.risk.rank || Date.parse(x.since) - Date.parse(y.since);
  mine.sort(order);
  others.sort(order);
  return { items: mine, waiting_on_others: others, digest: await digestSince(db, since, mine) };
}

const CHANGE_TYPES: Record<string, string> = {
  "package.drafted": "drafted",
  "package.edited": "edited",
  "package.revising": "sent back for revision",
  "package.output": "with new output",
  "package.pre-checked": "pre-checked",
};
const DECISION_WORDS: Record<string, string> = {
  release: "released", accept: "accepted", "accept-with-findings": "accepted with findings", return: "returned", reject: "rejected",
};

/**
 * Six lines in words, never event codes (OV-09): changes, signatures, lateness, disputes, gate
 * criteria not yet met, and spend. Without a cursor (a first visit) it returns only the head, so
 * the client starts counting from now.
 */
export async function digestSince(db: Db, since: number | undefined, mine: Json[]) {
  const head = (await db.query<{ n: number }>("select coalesce(max(seq), 0)::int as n from events")).rows[0]!.n;
  if (since === undefined || !Number.isInteger(since) || since < 0 || since > head) return { head, lines: [] };
  const rows = (await db.query<{ type: string; subject: string }>(
    "select body->>'type' as type, body->>'subject' as subject from events where seq > $1 order by seq", [since])).rows;

  const changed = new Map<string, Set<string>>();
  const signed: Record<string, number> = {};
  let breaker = 0;
  for (const r of rows) {
    const what = CHANGE_TYPES[r.type];
    if (what) {
      if (!changed.has(what)) changed.set(what, new Set());
      changed.get(what)!.add(r.subject);
    }
    if (r.type.startsWith("decision.")) {
      const k = r.type.slice("decision.".length);
      signed[k] = (signed[k] ?? 0) + 1;
    }
    if (r.type === "run.breaker") breaker++;
  }
  const packages = new Set([...changed.values()].flatMap((s) => [...s]));
  const changes = packages.size === 0
    ? "No package changed."
    : `${plural(packages.size, "package")} changed: ${[...changed.entries()].map(([w, s]) => `${s.size} ${w}`).join(", ")}.`;
  const signatures = Object.keys(signed).length === 0
    ? "No decisions were signed."
    : `${plural(Object.values(signed).reduce((a, b) => a + b, 0), "decision")} signed: ${Object.entries(signed).map(([k, n]) => `${n} ${DECISION_WORDS[k] ?? k}`).join(", ")}.`;
  const late = mine.filter((m) => Date.now() - Date.parse(m.since) > LATE_AFTER_MS).length;
  const lateness = late === 0 ? "Nothing has waited on you more than a day." : `${plural(late, "item")} ${late === 1 ? "has" : "have"} waited on you more than a day.`;
  const disputes = mine.filter((m) => m.kind === "dispute").length;
  const disputeLine = disputes === 0 && breaker === 0
    ? "No disputes are open."
    : `${plural(disputes, "dispute")} open${breaker > 0 ? `; the breaker stopped ${plural(breaker, "run")}` : ""}.`;
  const gates = await openCriteria(db);
  const gateLine = gates.criteria === 0 && gates.failedChecks === 0
    ? "No gate criteria are open."
    : [gates.criteria > 0 ? `${plural(gates.criteria, "gate criterion", "gate criteria")} not yet met across ${plural(gates.packages, "package")}` : "",
      gates.failedChecks > 0 ? `${plural(gates.failedChecks, "package")} whose pre-check did not pass` : ""].filter(Boolean).join("; ") + ".";
  return {
    head,
    lines: [
      { topic: "changes", text: changes, count: packages.size },
      { topic: "signatures", text: signatures, count: Object.values(signed).reduce((a, b) => a + b, 0) },
      { topic: "lateness", text: lateness, count: late },
      { topic: "disputes", text: disputeLine, count: disputes },
      { topic: "gates", text: gateLine, count: gates.criteria + gates.failedChecks },
      // Spend is recorded with budgets and usage (plan 5.2); until then there is none to report.
      { topic: "spend", text: "No spend recorded.", count: 0 },
    ],
  };
}

/** Readiness as counts: criteria whose admitted result is not a pass, and packages whose pre-check did not pass. */
async function openCriteria(db: Db): Promise<{ criteria: number; packages: number; failedChecks: number }> {
  const pk = await db.query<{ id: string; revision: number }>("select distinct on (id) id, revision from packages where status = 'in-verification' order by id, revision desc");
  let criteria = 0;
  let packages = 0;
  let failedChecks = 0;
  for (const p of pk.rows) {
    const pkg = await currentPackage(db, p.id);
    if (!pkg || pkg.status !== "in-verification") continue;
    const s = await subjectOf(db, pkg);
    const results: Json[] | undefined = s.criterionResults?.body?.results;
    if (results) {
      const open = results.filter((r) => r.outcome !== "pass").length;
      if (open > 0) {
        criteria += open;
        packages++;
      }
    } else if (s.verification && s.verification.outcome !== "pass") failedChecks++;
  }
  return { criteria, packages, failedChecks };
}
