import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { NormalizedEvent, Run } from "../api/types.js";
import { isVisible } from "../lib/live.js";
import { sessionGeneration, stillCurrent } from "../lib/session.js";
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
  return <RunTranscript key={run.id} packageId={packageId} run={run} showStop={showStop} />;
}

type TranscriptEvent = { seq: number; event: NormalizedEvent };
type TranscriptPage = { events: TranscriptEvent[]; conflict: boolean };

function mergeTranscript(first: TranscriptPage | undefined, incoming: TranscriptEvent[]): TranscriptPage {
  const bySeq = new Map(first?.events.map((event) => [event.seq, event]));
  let conflict = first?.conflict ?? false;
  for (const next of incoming) {
    const previous = bySeq.get(next.seq);
    if (!previous) bySeq.set(next.seq, next);
    else if (JSON.stringify(previous.event) !== JSON.stringify(next.event)) conflict = true;
  }
  return { events: [...bySeq.values()].sort((a, b) => a.seq - b.seq), conflict };
}

export function RunTranscript({ packageId, run, showStop, bounded = false, initialScroll = 0, initialAnchor, onScroll }: {
  packageId: string;
  run: Run;
  showStop: boolean;
  bounded?: boolean;
  initialScroll?: number;
  initialAnchor?: number | undefined;
  onScroll?: (offset: number, anchorSeq?: number) => void;
}) {
  const qc = useQueryClient();
  const live = isLive(run);
  const key = ["run-events", packageId, run.id, run.status] as const;
  const windowKey = ["run-transcript", packageId, run.id] as const;
  const legacy = useQuery({
    queryKey: key,
    enabled: !bounded,
    queryFn: async () => {
      const held = qc.getQueryData<Awaited<ReturnType<typeof allRunEvents>>>(key);
      const last = held?.at(-1)?.seq;
      if (held === undefined || last === undefined) return allRunEvents(packageId, run.id);
      const fresh = await allRunEvents(packageId, run.id, last);
      return fresh.length === 0 ? held : [...held, ...fresh];
    },
    refetchInterval: () => (live && isVisible() ? 2000 : false),
  });
  const window = useQuery({
    queryKey: windowKey,
    enabled: bounded,
    queryFn: async ({ signal }) => {
      const held = qc.getQueryData<TranscriptPage>(windowKey);
      let cursor = held?.events.at(-1)?.seq;
      if (cursor === undefined) {
        const recent = await api.transcriptWindow(packageId, run.id, { recent: true }, PANEL_STEPS);
        return mergeTranscript(held, recent.events);
      }
      const incoming: TranscriptEvent[] = [];
      for (;;) {
        signal.throwIfAborted();
        const page = await api.transcriptWindow(packageId, run.id, { after: cursor }, PANEL_STEPS);
        incoming.push(...page.events);
        const next = page.events.at(-1)?.seq;
        if (page.events.length < PANEL_STEPS) break;
        if (next === undefined || next <= cursor) {
          return { ...mergeTranscript(held, incoming), conflict: true };
        }
        cursor = next;
      }
      return mergeTranscript(held, incoming);
    },
    refetchInterval: () => (live && isVisible() ? 2000 : false),
  });
  const priorStatus = useRef(run.status);
  useEffect(() => {
    if (priorStatus.current !== run.status && bounded) {
      void qc.invalidateQueries({ queryKey: ["run-transcript", packageId, run.id] });
    }
    priorStatus.current = run.status;
  }, [bounded, packageId, qc, run.id, run.status]);
  const [earlier, setEarlier] = useState<TranscriptPage>();
  const [earlierExhausted, setEarlierExhausted] = useState(false);
  const recorded = bounded ? mergeTranscript(window.data, earlier?.events ?? []) : undefined;
  const earliest = recorded?.events[0]?.seq;
  const gap = recorded?.conflict || earlier?.conflict || (earlierExhausted && (earliest ?? 0) > 1) ||
    recorded?.events.some((item, i, all) => i > 0 && item.seq !== all[i - 1]!.seq + 1);
  const loadEarlier = useMutation({
    mutationFn: async (before: number) => {
      const generation = sessionGeneration();
      const page = await api.transcriptWindow(packageId, run.id, { before }, PANEL_STEPS);
      if (!stillCurrent(generation)) return;
      setEarlier((held) => mergeTranscript(held, page.events));
      // The server guarantees before is exclusive. An empty or nonadvancing response cannot be paged again.
      if (!page.events.some((item) => item.seq < before)) setEarlierExhausted(true);
    },
  });
  const events = bounded ? window : legacy;
  const stop = useMutation({
    mutationFn: () => api.stopRun(packageId, run.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["package", packageId] });
      void qc.invalidateQueries({ queryKey: ["office-figures"] });
      if (bounded) {
        void qc.invalidateQueries({ queryKey: ["run", packageId, run.id] });
        void qc.invalidateQueries({ queryKey: ["active-runs"] });
      }
    },
  });
  const inputs = bounded ? recorded?.events : legacy.data;
  const steps = inputs ? story(inputs) : [];
  // Freezing holds a snapshot of what is shown, so a step that changes (a tool finishing) stays as
  // it was too; polling carries on and the count of new steps stays true.
  const [frozen, setFrozen] = useState<typeof steps | null>(null);
  const shownAll = frozen ?? steps;
  const shown = bounded ? shownAll : shownAll.slice(-PANEL_STEPS);
  const terminal = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const initialPosition = useRef({
    anchor: Number.isSafeInteger(initialAnchor) ? initialAnchor : undefined,
    offset: Number.isFinite(initialScroll) ? initialScroll : 0,
  });
  const anchor = initialPosition.current.anchor;
  const fetchBeforeAnchor = anchor !== undefined && earliest !== undefined && earliest > anchor &&
    !earlierExhausted && !loadEarlier.isError;
  const loadingEarlier = loadEarlier.isPending;
  const requestEarlier = loadEarlier.mutate;
  useEffect(() => {
    if (!restored.current && fetchBeforeAnchor && !loadingEarlier && earliest !== undefined) requestEarlier(earliest);
  }, [fetchBeforeAnchor, loadingEarlier, earliest, requestEarlier]);
  useLayoutEffect(() => {
    const el = terminal.current;
    if (!el || restored.current || fetchBeforeAnchor) return;
    const item = anchor === undefined ? null : el.querySelector(`[data-story-seq="${anchor}"]`);
    const offset = initialPosition.current.offset;
    el.scrollTop = item ? el.scrollTop + item.getBoundingClientRect().top - el.getBoundingClientRect().top + offset : offset;
    restored.current = true;
  }, [anchor, fetchBeforeAnchor, shown.length]);

  function rememberScroll(el: HTMLDivElement) {
    if (!onScroll || !restored.current) return;
    const top = el.getBoundingClientRect().top;
    const item = Array.from(el.querySelectorAll<HTMLElement>("[data-story-seq]")).find(
      (row) => row.getBoundingClientRect().bottom > top,
    );
    if (item) onScroll(top - item.getBoundingClientRect().top, Number(item.dataset["storySeq"]));
    else onScroll(el.scrollTop);
  }
  const waiting = frozen === null ? 0 : Math.max(0, steps.length - frozen.length);
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
        {/* Resume stays while paused, so a run that finishes while paused can still be read in full. */}
        {(live || frozen !== null) && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              if (frozen !== null) void events.refetch();
              setFrozen(frozen === null ? steps : null);
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
        {bounded && earliest !== undefined && earliest > 1 && !earlierExhausted && (
          <button
            type="button"
            className="btn ghost small"
            disabled={loadEarlier.isPending || frozen !== null}
            onClick={() => loadEarlier.mutate(earliest)}
          >
            {loadEarlier.isPending ? "Loading earlier events…" : "Load earlier events"}
          </button>
        )}
        {loadEarlier.isError && <span className="error small" role="status">Earlier events could not be loaded.</span>}
        {gap && <span className="error small" role="status">Transcript continuity could not be verified.</span>}
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
          <div ref={terminal} onScroll={(event) => rememberScroll(event.currentTarget)} className="agent-term" role="log" aria-live={live && frozen === null ? "polite" : "off"} aria-label={`${role} transcript`}>
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
        {!bounded && (
          <p className="muted small">
            This run took one prompt and cannot be steered. To change what the next run does, return the work with a direction; the next run
            receives it.
          </p>
        )}
      </footer>
    </section>
  );
}
