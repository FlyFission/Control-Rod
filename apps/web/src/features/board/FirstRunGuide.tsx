import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ProjectModal } from "../../components/ProjectModal.js";
import type { EngineeringMode } from "../../lib/mode.js";
import { readString, writeString } from "../../lib/storage.js";

/** What the guide reads to tell which steps are done. Every value comes from the server or the person's own settings. */
export interface GuideState {
  /** An agent is seated and ready to run (Setup). */
  agentReady: boolean;
  /** A project names the repository its changes land in. */
  hasRepoProject: boolean;
  /** Any card exists: a capture waiting for intake or a drafted package. */
  hasCard: boolean;
  /** A package has been released to the agents (it left draft). */
  released: boolean;
  /** A package has been accepted. */
  accepted: boolean;
}

export type StepId = "agents" | "project" | "card" | "release" | "accept";

export interface GuideStep {
  id: StepId;
  title: string;
  /** One sentence: what the step does and why. */
  why: string;
  done: boolean;
}

/** The five steps from install to a first change landing, in order. */
export function guideSteps(s: GuideState): GuideStep[] {
  return [
    { id: "agents", title: "Choose your agents", why: "Pick which installed agents do the work and which one checks it.", done: s.agentReady },
    { id: "project", title: "Connect a repository", why: "Make a project and point it at the repository the changes should land in.", done: s.hasRepoProject },
    { id: "card", title: "Describe your first change", why: "One or two sentences is enough. An agent turns it into a plan you can read.", done: s.hasCard },
    { id: "release", title: "Approve the plan", why: "Open the card in Ready, read the plan, and press Release. The agents start then, not before.", done: s.released },
    { id: "accept", title: "Review and accept the work", why: "When the check passes the card moves to Needs signature. Read the result and press Accept.", done: s.accepted },
  ];
}

const HIDDEN_KEY = "cr.firstRunGuide.hidden";

/** Whether this person hid the guide on this browser, and the way to hide it. */
export function useGuideHidden(user: string): [boolean, () => void] {
  const key = `${HIDDEN_KEY}:${user}`;
  const [hidden, setHidden] = useState(() => readString(key) === "1");
  return [hidden, () => {
    writeString(key, "1");
    setHidden(true);
  }];
}

/** The guide shows until every step is done or the person hides it. */
export const guideOpen = (s: GuideState, hidden: boolean) => !hidden && guideSteps(s).some((x) => !x.done);

/**
 * A short guided first run on the board (Linear and Vercel style): five steps, each ticked from real
 * state, and one primary button for the next step only. It hides itself once a change is accepted, and
 * the person can hide it sooner.
 */
export function FirstRunGuide({
  state,
  mode,
  onNewChange,
  onOpenCard,
  onHide,
}: {
  state: GuideState;
  mode: EngineeringMode;
  /** Opens the new-change box. */
  onNewChange: () => void;
  /** Opens the first card waiting on the step, when there is one. */
  onOpenCard?: (() => void) | undefined;
  onHide: () => void;
}) {
  const [projectOpen, setProjectOpen] = useState(false);
  const steps = guideSteps(state);
  const next = steps.find((s) => !s.done);
  if (next === undefined) return null;
  const doneCount = steps.filter((s) => s.done).length;

  const action = (() => {
    switch (next.id) {
      case "agents":
        return (
          <Link to="/setup" className="btn primary">
            Choose agents
          </Link>
        );
      case "project":
        return (
          <button type="button" className="btn primary" onClick={() => setProjectOpen(true)}>
            Connect a repository
          </button>
        );
      case "card":
        return (
          <button type="button" className="btn primary" onClick={onNewChange}>
            Describe a change
          </button>
        );
      case "release":
      case "accept":
        return onOpenCard ? (
          <button type="button" className="btn primary" onClick={onOpenCard}>
            {next.id === "release" ? "Open the plan" : "Open the work"}
          </button>
        ) : null;
    }
  })();

  return (
    <section className="bd-guide" aria-labelledby="bd-guide-title">
      <div className="bd-guide-head">
        <div>
          <h2 id="bd-guide-title">Get your first change done</h2>
          <p className="small muted">
            {doneCount} of {steps.length} done. Next: {next.title.toLowerCase()}.
          </p>
        </div>
        <button
          type="button"
          className="btn small ghost"
          onClick={onHide}
        >
          Hide guide
        </button>
      </div>
      <ol className="bd-guide-steps">
        {steps.map((s, i) => (
          <li key={s.id} className="bd-guide-step" data-state={s.done ? "done" : s === next ? "next" : "later"} {...(s === next ? { "aria-current": "step" as const } : {})}>
            <span className="bd-guide-mark" aria-hidden="true">
              {s.done ? "✓" : i + 1}
            </span>
            <span className="bd-guide-text">
              <span className="bd-guide-title">
                {s.title}
                {s.done && <span className="sr-only"> (done)</span>}
              </span>
              {s === next && <span className="small muted">{s.why}</span>}
            </span>
          </li>
        ))}
      </ol>
      {action && <div className="bd-guide-actions">{action}</div>}
      {projectOpen && <ProjectModal open={projectOpen} defaultMode={mode} onClose={() => setProjectOpen(false)} />}
    </section>
  );
}
