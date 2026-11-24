import type { CheckIn } from "../api/types.js";
import type { AgentRow } from "./agents.js";

/**
 * The person's workflow as a block flow: who plans, who writes, who checks without seeing how it was
 * written, where the baton passes, which author steps in when the first is out, and where the card
 * stops for the person (ADR 0024 decisions 2, 6 and 7).
 *
 * It is drawn from what the dispatcher does today (services/api/src/work.ts pickRuntime and
 * pickChecker): the planner and author are the first seated agent that is ready, in the built-in order;
 * the checker is the next ready, seated agent from another vendor, never the author's own; a failed
 * check goes back to the author with its findings at most twice, and the third failure comes to the person. Steps
 * the person chose that are not built yet are marked "coming", never drawn as if they ran. It is a
 * preview, as the setup read-back is: a card's lane, pins and sandbox can still change who takes a job.
 */

/** Checks a card gets before a failure comes to the person (work.ts MAX_ROUNDS; the first attempt is round 1). */
export const CHECK_ROUNDS = 3;
/** So a failed check goes back to the author at most this many times. */
export const SEND_BACKS = CHECK_ROUNDS - 1;

export type StepKind = "start" | "agent" | "you" | "decision" | "end";
export type SeatRole = "planner" | "author" | "fallback" | "checker";
/**
 * Whether a person step stops the card. "on": it stops today. "always": it stops and cannot be turned
 * off. "coming": the person chose it, and it starts when check-in points are built.
 */
export type StopState = "on" | "always" | "coming";

export interface Seat {
  id: string;
  name: string;
  vendor: string;
  ready: boolean;
}

export interface FlowStep {
  id: string;
  kind: StepKind;
  title: string;
  detail: string;
  role?: SeatRole;
  seat?: Seat;
  /** The workflow pack the author follows (Playbook, Superpowers, Pocock), when one is named. */
  method?: string;
  stop?: StopState;
}

export type EdgeKind = "flow" | "baton" | "fallback" | "send-back" | "yes" | "no";

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

export interface MatrixRow {
  step: string;
  who: Seat | "you" | "nobody" | "control-rod";
  /** What the step decides or produces. */
  does: string;
  stopsForYou: StopState | "no";
  ifItFails: string;
}

export interface Council {
  author?: Seat;
  checker?: Seat;
  /** Authors that take over, in order, when the one before is out of quota, signed out or missing. */
  fallbacks: Seat[];
  /** Seated, can run, not ready yet. */
  waiting: Seat[];
  /** Turned off by the person. */
  benched: Seat[];
  /** Listed, but Control Rod cannot run them yet. */
  later: Seat[];
}

export interface CouncilFlow {
  council: Council;
  steps: FlowStep[];
  edges: FlowEdge[];
  matrix: MatrixRow[];
  /** One plain sentence for screen readers and the page head. */
  summary: string;
}

const seatOf = (r: AgentRow): Seat => ({ id: r.info.id, name: r.info.name, vendor: r.info.vendor, ready: r.state === "ready" });

export function councilOf(rows: AgentRow[]): Council {
  const seated = rows.filter((r) => r.info.runnable && r.seated);
  const ready = seated.filter((r) => r.state === "ready");
  const author = ready[0];
  const checker = author ? ready.find((r) => r.info.vendor !== author.info.vendor) : undefined;
  return {
    ...(author ? { author: seatOf(author) } : {}),
    ...(checker ? { checker: seatOf(checker) } : {}),
    // Any other seated agent can take the author's seat when it comes back, ready or not yet.
    fallbacks: seated.filter((r) => r !== author).map(seatOf),
    waiting: seated.filter((r) => r.state !== "ready").map(seatOf),
    benched: rows.filter((r) => r.info.runnable && !r.seated).map(seatOf),
    later: rows.filter((r) => !r.info.runnable).map(seatOf),
  };
}

/** Where the person's answer puts each optional stop. Plan approval and sign-off stay on in every answer today. */
function stops(checkIn: CheckIn): { afterAuthor: StopState | null; afterCheck: StopState | null } {
  return {
    afterAuthor: checkIn === "every-step" ? "coming" : null,
    afterCheck: checkIn === "every-step" ? "coming" : null,
  };
}

export function buildCouncilFlow(rows: AgentRow[], checkIn: CheckIn, method?: string): CouncilFlow {
  const council = councilOf(rows);
  const { author, checker } = council;
  const fallback = author ? council.fallbacks[0] : undefined;
  // pickChecker for the stand-in's work: a ready, seated agent from another vendor than the stand-in,
  // never the author it stood in for (that author is out, which is why the stand-in has the work).
  const fallbackChecker = fallback
    ? rows
        .filter((r) => r.info.runnable && r.seated && r.state === "ready" && r.info.vendor !== fallback.vendor && r.info.id !== author?.id)
        .map(seatOf)[0]
    : undefined;
  const s = stops(checkIn);
  const steps: FlowStep[] = [];
  const edges: FlowEdge[] = [];
  const edge = (from: string, to: string, kind: EdgeKind, label?: string) =>
    edges.push({ id: `${from}->${to}`, from, to, kind, ...(label ? { label } : {}) });

  steps.push({ id: "ask", kind: "start", title: "You ask", detail: "A card, a capture or a line in the Planner" });
  steps.push({
    id: "plan",
    kind: "agent",
    role: "planner",
    ...(author ? { seat: author } : {}),
    title: "Plan the work",
    detail: author ? "Drafts the work package: scope, inputs, acceptance criteria" : "Waits for an agent that is ready",
  });
  steps.push({ id: "approve", kind: "you", stop: "on", title: "You approve the plan", detail: "Signed with your passkey, then released" });
  steps.push({
    id: "author",
    kind: "agent",
    role: "author",
    ...(author ? { seat: author } : {}),
    ...(method ? { method } : {}),
    title: "Write the work",
    detail: author ? "In its own worktree, inside the sandbox" : "Waits for an agent that is ready",
  });
  edge("ask", "plan", "flow");
  edge("plan", "approve", "flow");
  edge("approve", "author", "flow");

  if (fallback) {
    steps.push({
      id: "fallback",
      kind: "agent",
      role: "fallback",
      seat: fallback,
      title: "Steps in as author",
      detail: `If ${author!.name} is signed out or missing when the work starts`,
    });
    edge("approve", "fallback", "fallback");
  }
  // The stand-in's work goes to the same checker only when that checker is independent of it.
  const sameCheck = fallback && fallbackChecker && fallbackChecker.id === checker?.id;

  let last = "author";
  if (s.afterAuthor) {
    steps.push({ id: "see-work", kind: "you", stop: s.afterAuthor, title: "You see the work", detail: "Before it goes to the checker" });
    edge("author", "see-work", "flow");
    if (sameCheck) edge("fallback", "see-work", "flow");
    last = "see-work";
  }
  steps.push({
    id: "check",
    kind: "agent",
    role: "checker",
    ...(checker ? { seat: checker } : {}),
    title: "Check it blind",
    detail: checker
      ? "Sees the plan and the result, never how it was written"
      : "Waits for a second vendor, unless you sign an override",
  });
  edge(last, "check", last === "author" ? "baton" : "flow");
  if (sameCheck && last === "author") edge("fallback", "check", "baton");

  steps.push({ id: "verdict", kind: "decision", title: "Pass?", detail: "The checker's verdict, with evidence" });
  edge("check", "verdict", "flow");

  if (fallback && !sameCheck) {
    steps.push({
      id: "fallback-check",
      kind: "agent",
      role: "checker",
      ...(fallbackChecker ? { seat: fallbackChecker } : {}),
      title: "Check the stand-in's work",
      detail: fallbackChecker
        ? `Never ${fallback.name}'s own vendor`
        : `Waits for a vendor other than ${fallback.vendor}, unless you sign an override`,
    });
    edge("fallback", "fallback-check", "baton");
    edge("fallback-check", "verdict", "flow");
  }

  edge("verdict", "author", "send-back", `No: back to the author with findings (at most ${SEND_BACKS} times)`);
  steps.push({
    id: "dispute",
    kind: "you",
    stop: "always",
    title: "You settle the dispute",
    detail: `After ${CHECK_ROUNDS} failed checks: accept with findings, return to planning or reject`,
  });
  edge("verdict", "dispute", "no", `after ${CHECK_ROUNDS} fails`);
  last = "verdict";

  if (s.afterCheck) {
    steps.push({ id: "see-check", kind: "you", stop: s.afterCheck, title: "You see the check", detail: "The verdict and its evidence" });
    edge(last, "see-check", "yes", "yes");
    last = "see-check";
  }
  steps.push({
    id: "merge",
    kind: "you",
    stop: "on",
    title: "You sign off",
    detail:
      checkIn === "start"
        ? "Stays on: skipping it needs a signed standing acceptance, not built yet"
        : "Before anything merges or ships",
  });
  edge(last, "merge", last === "verdict" ? "yes" : "flow", last === "verdict" ? "yes" : undefined);
  steps.push({ id: "ship", kind: "end", title: "Merged", detail: "With the record of who wrote, who checked and who signed" });
  edge("merge", "ship", "flow");

  const who = (seat: Seat | undefined): MatrixRow["who"] => seat ?? "nobody";
  const matrix: MatrixRow[] = [
    { step: "Plan the work", who: who(author), does: "Writes the work package you approve", stopsForYou: "no", ifItFails: "You see why on the card and can retry" },
    { step: "Approve the plan", who: "you", does: "Releases the work, signed with your passkey", stopsForYou: "on", ifItFails: "Nothing starts until you approve" },
    {
      step: "Write the work",
      who: who(author),
      does: "Produces the deliverable in its own worktree",
      stopsForYou: s.afterAuthor ?? "no",
      ifItFails: fallback
        ? `If ${author!.name} is signed out or missing, ${fallback.name} takes the work` +
          (fallbackChecker ? "" : `, and its check waits for a vendor other than ${fallback.vendor}`) +
          ". Logged, flagged fall-over when a run hits its limit is coming."
        : "The card waits; no other author is seated",
    },
    {
      step: "Check it blind",
      who: who(checker),
      does: "Passes or fails it with evidence, without seeing how it was written",
      stopsForYou: s.afterCheck ?? "no",
      ifItFails: `Back to the author with its findings, at most ${SEND_BACKS} times. The checker never switches.`,
    },
    {
      step: "Settle a dispute",
      who: "you",
      does: `Decides after ${CHECK_ROUNDS} failed checks`,
      stopsForYou: "always",
      ifItFails: "Accept with findings, return to planning or reject",
    },
    {
      step: "Sign off and merge",
      who: "you",
      does: "Accepts the work before it ships",
      stopsForYou: "on",
      ifItFails: checkIn === "start" ? "Return it or reject it. Skipping this stop needs a signed standing acceptance, which is coming." : "Return it with a note, or reject it",
    },
    {
      step: "After a fall-back",
      who: "you",
      does: "Sees that another author stepped in",
      stopsForYou: "coming",
      ifItFails: "Until then you still sign off before merge",
    },
    { step: "SCRAM or a tripped interlock", who: "you", does: "Stops the affected work", stopsForYou: "always", ifItFails: "Nothing restarts until you reset it" },
    { step: "Spend limit", who: "control-rod", does: "Holds new work once the limit is reached; work already running goes on", stopsForYou: "no", ifItFails: "New work starts again when budget frees up or you raise the limit" },
  ];

  const summary = !author
    ? "No agent at the table is ready yet, so new cards wait after you ask."
    : `You ask, ${author.name} plans, you approve, ${author.name} writes${fallback ? ` (${fallback.name} steps in if it is signed out or missing)` : ""}, ${
        checker ? `${checker.name} checks it blind` : "the check waits for a second vendor"
      }. A failed check goes back to the author at most ${SEND_BACKS} times; after ${CHECK_ROUNDS} failed checks you settle it. You sign off before it merges.`;

  return { council, steps, edges, matrix, summary };
}
