import type { Db } from "./db/index.js";
import { adminActions, callerFor } from "./admin.js";
import { ACTION_ROLES, highConsequence, needsOf, signingGaps } from "./authority.js";
import { bindingSentence, plural } from "./binding.js";
import { pendingConfirmation } from "./preparation/subjects.js";
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

/** "someone who is an approver or a checker", from the roles that may take an action. */
const who = (roles: readonly string[]) => (roles.length ? `someone who is ${roles.map(article).join(" or ")}` : "someone qualified");
const article = (w: string) => `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;
export async function inbox(db: Db, cfg: WorkConfig, user: string, since?: number) {
  const caller = await callerFor(db, user);
  const mine: Json[] = [];
  const others: Json[] = [];
  for (const it of await office(db)) {
    const pkg = await currentPackage(db, it.package_id);
    const body = pkg?.body;
    if (it.kind === "lost" || it.kind === "permission" || !pkg) {
      // Holds on runs. A lost run whose outcome is unknown can only be settled by someone who may
      // reconcile; anything else (requeue, stop, a waiting agent) is the owner's to settle.
      const lastRun = it.kind === "lost"
        ? (await db.query<{ body: Json }>("select body from runs where package_id = $1 and package_revision = $2 order by created_at desc limit 1", [it.package_id, it.package_revision])).rows[0]?.body
        : undefined;
      const unknown = Boolean(lastRun?.outcome_unknown && !lastRun?.reconciliation);
      const risk = gateRisk(it.kind, body, unknown);
      const item = { ...it, risk, href: { to: "/packages/$id", id: it.package_id, hash: "runs" } };
      const gaps = unknown ? await signingGaps(db, user, "reconcile", needsOf(body ?? {})) : [];
      if (gaps.length === 0) mine.push(item);
      else others.push({ ...item, waiting_on: who(ACTION_ROLES.reconcile), reason: `Reconciling it needs ${gaps.join(" and ")}, which your qualification does not include` });
      continue;
    }
    const risk = gateRisk(it.kind, body);
    const s = await subjectOf(db, pkg);
    // A prepared draft whose requirements are ready but unconfirmed asks for the confirmation first.
    if (it.kind === "release" && s.preparation?.blockers.some((x: Json) => x.code === "requirements-unconfirmed")) {
      const pending = await pendingConfirmation(db, pkg.id);
      if (pending) {
        const gaps = await signingGaps(db, user, "confirm", needsOf(body));
        const item = { ...it, kind: "confirm", detail: "The requirements are ready to confirm with a passkey; release waits on it.", risk: { rank: risk.rank, label: risk.label },
          binds: `Signing confirms the requirements of revision ${pkg.revision} of ${pkg.id} (sha256:${pending.requirements_digest.value.slice(0, 12)}).`,
          subject_digest: pending.requirements_digest, href: { to: "/packages/$id", id: pkg.id, hash: "preparation" } };
        if (gaps.length === 0) mine.push({ ...item, decisions: ["confirm"] });
        else others.push({ ...item, decisions: [], waiting_on: who(ACTION_ROLES.confirm), reason: `Confirming needs ${gaps.join(" and ")}, which your qualification does not include` });
        continue;
      }
    }
    const wanted = DECISIONS[it.kind] ?? [];
    const actions = (await packageActions(db, cfg, user, it.package_id)).filter((a: Json) => wanted.includes(a.command));
    const allowed = actions.filter((a: Json) => a.allowed).map((a: Json) => a.command);
    const binds = bindingSentence(it.kind, { ...body, id: pkg.id }, pkg.revision, s.outputs.length, s.verification, s.digest,
      { preparation: Boolean(s.preparation), criterionResults: Boolean(s.criterionResults) });
    const base = { ...it, risk, binds, subject_digest: { algorithm: "sha256", value: s.digest }, href: { to: "/packages/$id", id: it.package_id, hash: "decide" } };
    if (allowed.length > 0 || (it.kind === "dispute" && !s.verification)) {
      // A dispute from a failed or stopped run can always be requeued by the owner.
      mine.push({ ...base, decisions: allowed });
    } else {
      const refused = actions.find((a: Json) => !a.allowed);
      const roles = [...new Set(actions.flatMap((a: Json) => a.authority ?? []))] as string[];
      others.push({ ...base, decisions: [], waiting_on: refused?.reason_code === "scram-stopped" ? "a restart after SCRAM" : who(roles),
        ...(refused?.reason ? { reason: refused.reason } : {}) });
    }
  }
  const standing = new Map((await adminActions(db, caller)).map((a: Json) => [a.command, a]));
  const mayReconcile = (await signingGaps(db, user, "reconcile", {})).length === 0;
  for (const a of await scramAttention(db, caller.orgId)) {
    // What stands between the SCRAM and a full restart, and which next step is this person's.
    const blockers = [
      a.stopping > 0 ? `${plural(a.stopping, "run")} still stopping` : "",
      a.unknown > 0 ? `${plural(a.unknown, "run")} in scope with an unknown outcome to reconcile` : "",
      a.unreviewed > 0 ? `${plural(a.unreviewed, "stopped run")} to review` : "",
    ].filter(Boolean);
    const mayReview = standing.get("scram.review")?.allowed === true;
    const mayRestart = standing.get("scram.restart")?.allowed === true;
    let mineToo = false;
    let waiting = "";
    let detail: string;
    let hash = "command-scram.restart";
    if (blockers.length > 0) {
      detail = `Before a restart: ${blockers.join("; ")}. Nothing in scope runs until then.`;
      if (a.unreviewed > 0) hash = "command-scram.review";
      mineToo = (a.unreviewed > 0 && mayReview) || (a.unknown > 0 && mayReconcile);
      if (!mineToo) waiting = a.unreviewed > 0 || a.unknown > 0 ? who(ACTION_ROLES.reconcile) : "the daemon to stop the runs";
    } else {
      detail = mayRestart
        ? "Nothing blocks a restart. You may restart it when it is safe."
        : "Nothing blocks a restart. An administrator restarts it.";
      mineToo = mayRestart;
      if (!mineToo) waiting = "an administrator";
    }
    const item = { kind: "scram", scram_id: a.scram.id, title: `SCRAM: ${a.scram.reason}`, detail, since: a.since, risk: gateRisk("scram", undefined), href: { to: "/policies", hash } };
    if (mineToo) mine.push(item);
    else others.push({ ...item, waiting_on: waiting });
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
  "preparation.edited": "with requirements edited",
};
/** Signed acts by people, in words. */
const SIGNED_WORDS: Record<string, string> = {
  "preparation.confirmed": "requirements confirmed",
  "run.reconciled": "runs reconciled",
  "run.independence-override": "independence overrides",
  "scram.pulled": "SCRAM pulled",
  "quarantine-review.recorded": "quarantine reviews",
  "scram-restart.recorded": "SCRAM restarts",
  "person-verification.recorded": "person verifications",
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
  // Bounded by the head this answer reports, so marking seen never skips or double counts an event.
  const rows = (await db.query<{ type: string; subject: string; actor: string }>(
    "select body->>'type' as type, body->>'subject' as subject, body->'actor'->>'kind' as actor from events where seq > $1 and seq <= $2 order by seq", [since, head])).rows;

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
      const k = DECISION_WORDS[r.type.slice("decision.".length)] ?? "other decisions";
      signed[k] = (signed[k] ?? 0) + 1;
    } else if (SIGNED_WORDS[r.type] && r.actor === "human") {
      const k = SIGNED_WORDS[r.type]!;
      signed[k] = (signed[k] ?? 0) + 1;
    }
    if (r.type === "run.breaker") breaker++;
  }
  const packages = new Set([...changed.values()].flatMap((s) => [...s]));
  const changes = packages.size === 0
    ? "No package changed."
    : `${plural(packages.size, "package")} changed: ${[...changed.entries()].map(([w, s]) => `${s.size} ${w}`).join(", ")}.`;
  const signatures = Object.keys(signed).length === 0
    ? "Nothing was signed."
    : `${plural(Object.values(signed).reduce((a, b) => a + b, 0), "signature")}: ${Object.entries(signed).map(([k, n]) => `${n} ${k}`).join(", ")}.`;
  const late = mine.filter((m) => Date.now() - Date.parse(m.since) > LATE_AFTER_MS).length;
  const lateness = late === 0 ? "Nothing has waited on you more than a day." : `${plural(late, "item")} ${late === 1 ? "has" : "have"} waited on you more than a day.`;
  const disputes = mine.filter((m) => m.kind === "dispute").length;
  const disputeLine = disputes === 0 && breaker === 0
    ? "No disputes are open."
    : `${plural(disputes, "dispute")} open${breaker > 0 ? `; the breaker stopped ${plural(breaker, "run")}` : ""}.`;
  const gates = await openCriteria(db);
  const gateLine = gates.criteria === 0
    ? "No gate criteria are open."
    : `${plural(gates.criteria, "gate criterion", "gate criteria")} not yet met across ${plural(gates.packages, "package")} in verification.`;
  return {
    head,
    lines: [
      { topic: "changes", text: changes, count: packages.size },
      { topic: "signatures", text: signatures, count: Object.values(signed).reduce((a, b) => a + b, 0) },
      { topic: "lateness", text: lateness, count: late },
      { topic: "disputes", text: disputeLine, count: disputes },
      { topic: "gates", text: gateLine, count: gates.criteria },
      // Spend is recorded with budgets and usage (plan 5.2); until then there is none to report.
      { topic: "spend", text: "No spend recorded.", count: 0 },
    ],
  };
}

/**
 * Readiness as counts (OV-09), from the criteria each package in verification must meet: a
 * criterion is open until an admitted result passes it, and for a package without per criterion
 * results, until its pre-check passes. Absence of a result is never counted as met.
 */
async function openCriteria(db: Db): Promise<{ criteria: number; packages: number }> {
  const pk = await db.query<{ id: string }>("select distinct on (id) id from packages where status = 'in-verification' order by id, revision desc");
  let criteria = 0;
  let packages = 0;
  for (const p of pk.rows) {
    const pkg = await currentPackage(db, p.id);
    if (!pkg || pkg.status !== "in-verification") continue;
    const s = await subjectOf(db, pkg);
    let open: number;
    if (s.preparation) {
      const inventory: Json[] = s.preparation.snapshot?.criteria ?? [];
      const passed = new Set(((s.criterionResults?.evidence_valid ? s.criterionResults.body?.results : undefined) ?? [])
        .filter((r: Json) => r.outcome === "pass").map((r: Json) => r.criterion_id));
      open = inventory.filter((c) => !passed.has(c.id)).length;
    } else {
      open = s.verification?.outcome === "pass" ? 0 : (pkg.body.acceptance_criteria?.length ?? 0);
    }
    if (open > 0) {
      criteria += open;
      packages++;
    }
  }
  return { criteria, packages };
}
