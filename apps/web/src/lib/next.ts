import type { ActionDescriptor, AdminView, OfficeItem, PersonVerificationEntry, Run, WorkPackage } from "../api/types.js";
import { blockUnverifiedAccept, boardColumn, isVerified, preCheckState } from "./board.js";

export type NextLine = {
  tone: "needs" | "wait" | "block" | "ok";
  text: string;
  command?: string;
  /** Set on the line of a run that is executing now: when it started, so the card can show the elapsed time. */
  since?: string;
  /** The run a "requeue" line would queue again. */
  runId?: string;
  /** One more line under the next step: what went wrong, in the runner's words. */
  detail?: string;
};

/**
 * The run that ended without a result and is the card's to fix: the newest author or pre-check run,
 * when it failed, was stopped or was lost and has not been queued again. A failed check is not the author's fault, so the next step is to run it again, not to return the work.
 */
export function stalledRun(runs: readonly Run[] | undefined): Run | undefined {
  const newest = [...(runs ?? [])]
    .filter((r) => r.role === "author" || r.role === "pre-check")
    .sort((a, b) => (Date.parse(b.queued_at) || 0) - (Date.parse(a.queued_at) || 0))[0];
  if (!newest) return undefined;
  if (newest.status !== "failed" && newest.status !== "stopped" && newest.status !== "lost") return undefined;
  if (newest.requeued_as !== undefined) return undefined;
  return newest;
}

/** What to tell the person about a run that ended without a result, and the one thing to do. */
export function stalledLine(run: Run): NextLine {
  const who = run.role === "pre-check" ? "The check" : "The agent";
  const what =
    run.status === "lost" ? `${who} stopped answering` : run.status === "stopped" ? `${who} was stopped` : `${who} could not finish`;
  const detail = run.error?.trim();
  // Its process may still be running somewhere: requeue stays shut until the run log settles it.
  if (run.outcome_unknown !== undefined && run.reconciliation === undefined) {
    return {
      tone: "needs",
      text: `${what}, and it may not have stopped. Open its run log to confirm, then run it again`,
      command: "open-run-log",
      runId: run.id,
      ...(detail ? { detail: detail.length > 160 ? `${detail.slice(0, 157)}...` : detail } : {}),
    };
  }
  return {
    tone: "needs",
    text: `${what}. Run it again`,
    command: "requeue",
    runId: run.id,
    ...(detail ? { detail: detail.length > 160 ? `${detail.slice(0, 157)}...` : detail } : {}),
  };
}

const RUN_ROLE_WORD: Record<Run["role"], string> = {
  intake: "Intake",
  author: "Author",
  "pre-check": "Pre-check",
  "requirements-preparer": "Requirements preparation",
  "technical-preparer": "Technical preparation",
};

/** The run a card's status line speaks for: one that is running, else the first queued. */
export function activeRun(runs: readonly Run[] | undefined): Run | undefined {
  return runs?.find((r) => r.status === "running") ?? runs?.find((r) => r.status === "queued");
}

/**
 * "Writing tests" from the run's label (written by the runner, never raw model text), or
 * "Author running" when it has none; "Author queued" while it only waits for a runtime.
 */
export function runLine(run: Run | undefined): NextLine {
  if (!run) return { tone: "wait", text: "Author running" };
  const label = run.label?.trim();
  if (run.status === "running") {
    return { tone: "wait", text: label && label.length > 0 ? label : `${RUN_ROLE_WORD[run.role]} running`, ...(run.started_at ? { since: run.started_at } : {}) };
  }
  return { tone: "wait", text: label && label.length > 0 ? label : `${RUN_ROLE_WORD[run.role]} queued` };
}

export type NextInput = {
  pkg: WorkPackage;
  actions: ActionDescriptor[];
  office: OfficeItem[];
  verifications: PersonVerificationEntry[];
  /**
   * Whether a passing person verification is recorded, exactly as the card's column was chosen with it.
   * null means not known. Leave it out to derive it from `verifications`.
   */
  verified?: boolean | null;
  /** The people who originated the work (user names, from the package view), first originator first. */
  originators: string[];
  /** Whether someone other than every originator could verify it (see hasOtherQualified). */
  otherQualifiedVerifier: boolean;
  runActive: boolean;
  /**
   * Whether a queued pre-check is held for want of a runtime independent of the author's. The work is
   * not the person's to return then: the check has not run. Found by the live persona pass.
   */
  heldPreCheck?: boolean;
  /** Runs for the current revision, or explicit hold metadata from a queued run. */
  runs?: readonly Run[];
  waitingReason?: string;
  waitingCause?: Run["waiting_cause"];
};

/** Why an action is refused, in the API's own words where it gave them. */
function refusalText(a: ActionDescriptor): string {
  if (a.reason) return a.reason;
  if (a.missing && a.missing.length > 0) return `Missing: ${a.missing.join(", ")}`;
  return `${a.label} is not available yet`;
}

/**
 * The one line on a card that says what happens next: the first allowed action, or why the card waits,
 * or that it is blocked for want of a second qualified person (spec 6.2, O6).
 */
export function nextLine(i: NextInput): NextLine {
  const { pkg } = i;
  if (pkg.status === "accepted") return { tone: "ok", text: "Accepted" };
  if (pkg.status === "closed") return { tone: "ok", text: "Closed" };

  const verified = i.verified !== undefined ? i.verified : isVerified(pkg, i.verifications);
  const column = boardColumn(pkg, preCheckState(pkg, i.office), verified);
  // O6: shown to every viewer, since nobody can clear the step, and naming who is excluded and why.
  if (column === "person-verifies" && !i.otherQualifiedVerifier) {
    const who = i.originators.length > 0 ? `. Originators cannot verify their own work: ${i.originators.join(", ")}` : "";
    return { tone: "block", text: `Needs a second qualified person${who}` };
  }

  const queuedHold = i.runs?.find((r) => r.status === "queued" && (r.waiting_reason !== undefined || r.waiting_cause !== undefined));
  const holdReason = i.waitingReason ?? queuedHold?.waiting_reason;
  const holdCause = i.waitingCause ?? queuedHold?.waiting_cause;
  const hasExplicitHold = holdReason !== undefined || holdCause !== undefined;
  const isIndependenceHold = hasExplicitHold
    ? holdCause === "independent-runtime" ||
      (holdCause === undefined &&
        (i.heldPreCheck || queuedHold?.role === "pre-check") &&
        (holdReason === undefined || /independent runtime/i.test(holdReason)))
    : Boolean(i.heldPreCheck);

  if (isIndependenceHold) {
    return {
      tone: "needs",
      text: holdReason ? `Pre-check held: ${holdReason}` : "Pre-check held: it needs a runtime independent of the author's, or your signed override",
    };
  }

  // A run that ended without a result needs the person, and the step is to run it again. Returning
  // the work would send a finished author back over a check that never ran.
  const stalled = i.runActive ? undefined : stalledRun(i.runs);
  if (stalled) return stalledLine(stalled);

  // Ruling 16: the verification outranks an allowed accept (screen-only until D-4; see blockUnverifiedAccept).
  const offered = blockUnverifiedAccept(pkg, i.actions, verified);
  const first = offered.find((a) => a.allowed);
  if (first) return { tone: "needs", text: first.label, command: first.command };

  if (column === "person-verifies") return { tone: "wait", text: "Waiting on a person verification" };
  if (preCheckState(pkg, i.office) === "disputed") return { tone: "block", text: "The agent pre-check disputes this work" };
  if (hasExplicitHold) return { tone: "wait", text: holdReason ? `Held: ${holdReason}` : `Held: ${holdCause}` };
  if (i.runActive) return runLine(activeRun(i.runs));

  const refused = offered.find((a) => !a.allowed);
  return { tone: "wait", text: refused ? refusalText(refused) : "Nothing to do yet" };
}

/** The verify role set, as the server's ACTION_ROLES.verify (services/api/src/authority.ts). */
const VERIFY_ROLES = ["checker", "approver", "engineer-in-responsible-charge"];

/**
 * Whether some member other than every originator could verify the work, by the server's rules as
 * far as the web can see them (services/api/src/person-verification.ts admissible, authority.ts
 * gapsIn): an active member whose latest qualification version is not revoked, holds a verify role,
 * covers the grade and, for Safety and Material work with a discipline, that discipline.
 * `excluded` holds the originators' member ids. Licence currency for Safety work is not visible to
 * the web, so a lapsed licence can make this say yes when the server would refuse; Task 7 reads
 * eligibility from the server instead.
 */
export function hasOtherQualified(admin: AdminView, needs: { grade: string; discipline?: string }, excluded: ReadonlySet<string>): boolean {
  const active = new Set(admin.members.filter((m) => m.status === "active").map((m) => m.id));
  const latest = new Map<string, AdminView["registry"]["qualifications"][number]>();
  for (const q of admin.registry.qualifications) {
    const seen = latest.get(q.member_id);
    if (!seen || q.version > seen.version) latest.set(q.member_id, q);
  }
  const grade = needs.grade || "general-service";
  return [...latest.values()].some(
    (q) =>
      !q.revoked &&
      active.has(q.member_id) &&
      !excluded.has(q.member_id) &&
      q.roles.some((r) => VERIFY_ROLES.includes(r)) &&
      q.grades.includes(grade as never) &&
      (grade === "general-service" || !needs.discipline || q.disciplines.includes(needs.discipline)),
  );
}
