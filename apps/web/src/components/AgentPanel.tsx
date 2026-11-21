import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { Run } from "../api/types.js";
import { isVisible } from "../lib/live.js";
import { story } from "../features/case/story.js";
import { StoryLine, allRunEvents } from "../features/case/StoryLine.js";
import { canStop, runState, runStatusText } from "./RunLog.js";
import { StateMark } from "./StateMark.js";
import { VendorBadge } from "./VendorBadge.js";

/** How many of the latest steps the panel shows; the full story is on the case page. */
export const PANEL_STEPS = 200;

const ROLE_WORDS: Record<string, string> = { intake: "Intake", author: "Author", "pre-check": "Pre-check", "requirements-preparer": "Requirements preparation", "technical-preparer": "Technical preparation" };

const stamp = (r: Run) => Date.parse(r.finished_at ?? r.started_at ?? r.queued_at);
const isLive = (r: Run) => r.status === "running" || r.status === "queued";

/**
 * The run the panel follows: the one asked for, else the newest live run, else the newest run.
 * Undefined when the package has no runs.
 */
export function pickRun(runs: readonly Run[], runId?: string): Run | undefined {
  if (runId !== undefined) {
    const asked = runs.find((r) => r.id === runId);
    if (asked) return asked;
  }
  const newest = [...runs].sort((a, b) => stamp(b) - stamp(a));
  return newest.find(isLive) ?? newest[0];
}

/**
 * The agent panel (click-to-talk design, slice S1): what an agent on a card is doing, as a live,
 * terminal-style transcript drawn from the run's recorded events. Every line maps to an event the
 * daemon reported; nothing is shown that the record does not hold. A controlled run takes one
 * prompt and cannot be steered (ADR 0020; board design K1), so the panel offers Stop and points to
 * the Return decision, whose reason the next run receives as direction.
 */
export function AgentPanel({ packageId, runId, showStop = true }: { packageId: string; runId?: string; showStop?: boolean }) {
  const view = useQuery({ queryKey: ["package", packageId], queryFn: () => api.packageView(packageId) });
  if (view.isError && view.data === undefined)
    return (
      <section className="agent-panel" aria-label="Agent">
        <p className="error small" role="alert">
          {explain(view.error, "The agent's runs could not be loaded.")}
        </p>
      </section>
    );
  if (!view.data)
    return (
      <section className="agent-panel" aria-label="Agent">
        <p className="muted small">Loading the agent…</p>
      </section>
    );
  const run = pickRun(view.data.runs, runId);
  if (!run)
    return (
      <section className="agent-panel" aria-label="Agent">
        <p className="muted small">No agent has run on this card yet.</p>
      </section>
    );
  return <Transcript key={run.id} packageId={packageId} run={run} showStop={showStop} />;
}

function Transcript({ packageId, run, showStop }: { packageId: string; run: Run; showStop: boolean }) {
  const qc = useQueryClient();
  const live = isLive(run);
  const events = useQuery({
    // Same key as the case page, so both read one cache; the status in the key reads a finished run once more in full.
    queryKey: ["run-events", packageId, run.id, run.status],
    queryFn: () => allRunEvents(packageId, run.id),
    refetchInterval: () => (live && isVisible() ? 2000 : false),
  });
  const stop = useMutation({
    mutationFn: () => api.stopRun(packageId, run.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["package", packageId] });
      void qc.invalidateQueries({ queryKey: ["office-figures"] });
    },
  });
  const steps = events.data ? story(events.data) : [];
  // Freezing holds what is shown so it can be read; polling carries on and the count stays true.
  const [frozen, setFrozen] = useState<number | null>(null);
  const shownAll = frozen === null ? steps : steps.slice(0, frozen);
  const shown = shownAll.slice(-PANEL_STEPS);
  const waiting = frozen === null ? 0 : Math.max(0, steps.length - frozen);
  const role = ROLE_WORDS[run.role] ?? run.role;
  return (
    <section className="agent-panel" aria-label={`${role} agent`}>
      <header className="agent-panel-head">
        <StateMark kind={runState(run)} />
        <span className="tag">{role}</span>
        <span className="small">round {run.round}</span>
        <span className="mono small">{run.runtime.provider}</span>
        <VendorBadge provider={run.runtime.provider} />
        <span className="muted small">{runStatusText(run)}</span>
      </header>
      <div className="agent-term-bar">
        {live && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              if (frozen !== null) void events.refetch();
              setFrozen(frozen === null ? steps.length : null);
            }}
          >
            {frozen === null ? "Pause updates" : "Resume updates"}
          </button>
        )}
        {frozen !== null && (
          <span className="muted small" role="status">
            {waiting === 0 ? "Paused: nothing new since you paused." : `Paused: ${waiting} new ${waiting === 1 ? "step" : "steps"} since you paused.`}
          </span>
        )}
        {shownAll.length > shown.length && (
          <Link to="/packages/$id/case" params={{ id: packageId }} className="small">
            Showing the latest {PANEL_STEPS} of {shownAll.length} steps; read all on the case
          </Link>
        )}
      </div>
      {events.isLoading ? (
        <p className="muted small">Loading the transcript…</p>
      ) : events.isError && events.data === undefined ? (
        <p className="error small" role="alert">
          The transcript could not be loaded; the raw log on the package page has everything.
        </p>
      ) : shown.length === 0 ? (
        <p className="muted small">{live ? "No events yet; the transcript updates as the agent works." : "No events were recorded for this run."}</p>
      ) : (
        <>
          {events.isError && (
            <p className="error small" role="status">
              The transcript could not be refreshed; it may be missing the latest steps.
            </p>
          )}
          <div className="agent-term" role="log" aria-live={live && frozen === null ? "polite" : "off"} aria-label={`${role} transcript`}>
            <ol className="story">
              {shown.map((s) => (
                <StoryLine key={s.seq} step={s} />
              ))}
            </ol>
          </div>
        </>
      )}
      <footer className="agent-panel-foot">
        {showStop && canStop(run) && (
          <button type="button" className="btn small" disabled={stop.isPending} onClick={() => stop.mutate()}>
            Stop this run
          </button>
        )}
        {stop.error && (
          <p className="error small" role="alert">
            {stop.error.message}
          </p>
        )}
        <p className="muted small">
          This run took one prompt and cannot be steered. To change what the next run does, return the work with a direction; the next run
          receives it.
        </p>
      </footer>
    </section>
  );
}
