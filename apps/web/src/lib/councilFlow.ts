import type { CheckIn } from "../api/types.js";
import { type AgentRow, seatable } from "./agents.js";

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
    // Benched is the person's choice; an agent that is not installed, or not available here, is not at the table at all.
    benched: rows.filter((r) => seatable(r) && !r.seated).map(seatOf),
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

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** What acceptance of a prepared package also needs, said the same way everywhere. */
export const PREPARED_GATE =
  "A prepared package also has to clear its acceptance checks: current, confirmed preparation, every criterion's result and the required checks";

export function buildCouncilFlow(rows: AgentRow[], checkIn: CheckIn, method?: string): CouncilFlow {
  const council = councilOf(rows);
  const { author, checker } = council;
  // The dispatcher takes the first ready stand-in, so a ready one is shown before one still waiting.
  const fallback = author ? (council.fallbacks.find((s) => s.ready) ?? council.fallbacks[0]) : undefined;
  // pickChecker for the stand-in's work: a ready, seated agent from another vendor than the stand-in.
  // That can be the author it stood in for, once that author is back.
  // One that is ready now comes first; the author it stood in for checks only when nobody else can.
  const fallbackCheckers = fallback
    ? rows.filter((r) => r.info.runnable && r.seated && r.state === "ready" && r.info.vendor !== fallback.vendor).map(seatOf)
    : [];
  const fallbackChecker = fallbackCheckers.find((s) => s.id !== author?.id) ?? fallbackCheckers[0];
  const checksOnReturn = fallbackChecker !== undefined && fallbackChecker.id === author?.id;
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
    detail: author ? "Drafts the work package; intake picks a ready agent" : "Waits for an agent that is ready",
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
  // Every round, the first one and each send-back, picks its author again when the work is claimed.
  steps.push({ id: "pick", kind: "decision", title: "Author?", detail: "Who writes: the author is picked again at the start of every round" });
  edge("approve", "pick", "flow");
  edge("pick", "author", "flow");

  if (fallback) {
    steps.push({
      id: "fallback",
      kind: "agent",
      role: "fallback",
      seat: fallback,
      title: "Steps in as author",
      detail: fallback.ready
        ? `If ${author!.name} is signed out or missing when the work starts`
        : `If ${author!.name} is out, once it is ready itself; until then the card waits`,
    });
    edge("pick", "fallback", "fallback");
    steps.push({
      id: "see-fallback",
      kind: "you",
      stop: "coming",
      title: "You see the switch",
      detail: s.afterAuthor ? "Who stepped in and why, and the work before any checker sees it" : "Who stepped in and why, before it goes on",
    });
    edge("fallback", "see-fallback", "flow");
  }
  // The stand-in's work goes to the same checker only when that checker is independent of it.
  const sameCheck = fallback && fallbackChecker && fallbackChecker.id === checker?.id;

  let last = "author";
  if (s.afterAuthor) {
    steps.push({ id: "see-work", kind: "you", stop: s.afterAuthor, title: "You see the work", detail: "Before any checker sees it, on every path" });
    edge("author", "see-work", "flow");
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
  // The stand-in's own stop already showed its work, so it goes straight to the check.
  if (sameCheck) edge("see-fallback", "check", "baton");

  // With every-step check-ins, every verdict is shown to you before anything follows from it.
  let afterCheck = "verdict";
  if (s.afterCheck) {
    steps.push({ id: "see-check", kind: "you", stop: s.afterCheck, title: "You see the check", detail: "Every verdict and its evidence, pass or not, before what follows" });
    edge("check", "see-check", "flow");
    afterCheck = "see-check";
  }
  steps.push({ id: "verdict", kind: "decision", title: "Pass?", detail: "The checker's verdict: pass, fail or inconclusive" });
  edge(s.afterCheck ? "see-check" : "check", "verdict", "flow");

  if (fallback && !sameCheck) {
    steps.push({
      id: "fallback-check",
      kind: "agent",
      role: "checker",
      ...(fallbackChecker ? { seat: fallbackChecker } : {}),
      title: "Check the stand-in's work",
      detail: !fallbackChecker
        ? `Waits for a vendor other than ${fallback.vendor}, unless you sign an override`
        : checksOnReturn
          ? `Once ${fallbackChecker.name} is back; until then it waits, unless you sign an override`
          : `Never ${fallback.name}'s own vendor`,
    });
    edge("see-fallback", "fallback-check", "baton");
    edge("fallback-check", afterCheck, "flow");
  }

  edge("verdict", "pick", "send-back", `Fail or inconclusive: a new round with the findings, at most ${SEND_BACKS} times`);
  steps.push({
    id: "dispute",
    kind: "you",
    stop: "always",
    title: "You settle the dispute",
    detail: `After ${CHECK_ROUNDS} checks that did not pass: return to planning, reject, or accept with findings where every result is in and its evidence kept`,
  });
  edge("verdict", "dispute", "no", `${ordinal(CHECK_ROUNDS)} time`);
  steps.push({
    id: "merge",
    kind: "you",
    stop: "on",
    title: "You accept the work",
    detail:
      checkIn === "start"
        ? "Stays on: skipping it needs a signed standing acceptance, not built yet. Prepared packages have more checks"
        : "Signed and recorded. Prepared packages have more checks. Merging or shipping is a separate step",
  });
  edge("verdict", "merge", "yes", "yes");
  steps.push({ id: "ship", kind: "end", title: "Accepted", detail: `Control Rod records your signed acceptance with who wrote, who checked and who signed. ${PREPARED_GATE}. Merging or shipping is a separate step you take` });
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
      ifItFails:
        (fallback
          ? `Before it starts: if ${author!.name} is signed out or missing, ${fallback.name} takes the work` +
            (fallback.ready ? "" : " once it is ready itself") +
            (fallbackChecker ? "" : `, and its check waits for a vendor other than ${fallback.vendor}`) +
            ". "
          : author
            ? "Before it starts: the card waits; no other author is seated. "
            : "Before it starts: the card waits until a seated author is ready. ") +
        "Once it has started, a run that fails, stops or loses contact stops for you: requeue it, return it or reject it. Logged, flagged fall-over when a run hits its limit is coming.",
    },
    {
      step: "Check it blind",
      who: who(checker),
      does: "Passes or fails it with evidence, without seeing how it was written",
      stopsForYou: s.afterCheck ?? "no",
      ifItFails:
        `A fail or an inconclusive verdict starts a new round with the findings, at most ${SEND_BACKS} times, and the author is picked again for it. ` +
        `By default each round is checked by a vendor other than that round's author; when none is ready, the check waits unless you sign an override. ` +
        (fallback
          ? fallbackChecker
            ? `${fallbackChecker.name} checks ${fallback.name}'s work${checksOnReturn ? ` once it is back` : ""}. `
            : `${fallback.name}'s work waits for a vendor other than ${fallback.vendor}. `
          : "") +
        "A check is never moved to another checker to get a pass. A check run that fails, stops or loses contact stops for you.",
    },
    {
      step: "Settle a dispute",
      who: "you",
      does: `Decides after ${CHECK_ROUNDS} checks that did not pass`,
      stopsForYou: "always",
      ifItFails: "Return to planning, reject, or accept with findings; findings can be accepted only where every result is in and its evidence kept",
    },
    {
      step: "Accept the work",
      who: "you",
      does: "Signs acceptance; Control Rod records it. Merging or shipping is a separate step you take",
      stopsForYou: "on",
      ifItFails:
        (checkIn === "start" ? "Return it or reject it. Skipping this stop needs a signed standing acceptance, which is coming." : "Return it with a note, or reject it.") +
        ` A pass alone does not clear a prepared package. ${PREPARED_GATE}.`,
    },
    {
      step: "After a fall-back",
      who: "you",
      does: "Sees that another author stepped in",
      stopsForYou: "coming",
      ifItFails: "Until then you still sign acceptance on every card",
    },
    { step: "SCRAM or a tripped interlock", who: "you", does: "Stops the affected work", stopsForYou: "always", ifItFails: "Nothing restarts until you reset it" },
    {
      step: "Spend limit",
      who: "control-rod",
      does: "Holds new work at the budget limit, and asks a run past its own reserved ceiling to stop",
      stopsForYou: "coming",
      ifItFails: "New work starts again when budget frees up or you raise the limit. A stop that asks you first is coming.",
    },
  ];

  const summary = !author
    ? "No agent at the table is ready yet, so new cards wait after you ask."
    : `You ask, ${author.name} plans, you approve, ${author.name} writes${
        fallback ? ` (${fallback.name} steps in if ${author.name} is signed out or missing${fallback.ready ? "" : `, once ${fallback.name} is ready itself`})` : ""
      }, ${
        checker ? `${checker.name} checks it blind` : "the check waits for a second vendor unless you sign an override"
      }${
        fallback
          ? fallbackChecker
            ? `, and ${fallbackChecker.name} checks ${fallback.name}'s work${checksOnReturn ? " once it is back" : ""}`
            : `, and ${fallback.name}'s work waits for another vendor's check`
          : ""
      }. A fail or an inconclusive verdict starts a new round, with the author picked again, at most ${SEND_BACKS} times; after ${CHECK_ROUNDS} checks that do not pass you settle it. You sign acceptance; a prepared package also has to clear its acceptance checks. Merging or shipping is a separate step.`;

  return { council, steps, edges, matrix, summary };
}
