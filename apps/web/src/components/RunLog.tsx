import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { PackageView, Run } from "../api/types.js";
import { useActionLock } from "../lib/scramLock.js";
import { isVisible } from "../lib/live.js";
import { type Passkeys, browserPasskeys, signOverride, signReconcile } from "../lib/decide.js";
import { time } from "../lib/format.js";
import { plainError } from "../lib/plainError.js";
import { modelRouting } from "../lib/modelRouting.js";
import { StateMark, type StateKind } from "./StateMark.js";
import { VendorBadge } from "./VendorBadge.js";
import { LogBody, LogViewer } from "./LogViewer.js";
import { rememberRun } from "../lib/runPreferences.js";
import { sessionIdentity } from "../lib/session.js";
import { usePanelScreen, type PanelScreen } from "./PanelScreen.js";

export function runState(run: Run): StateKind {
  switch (run.status) {
    case "running":
      return "working";
    case "queued":
      return "idle";
    case "failed":
    case "stopped":
    case "lost":
      return "stuck";
    case "succeeded":
      return "done";
  }
}

const ROLE_LABEL: Record<Run["role"], string> = { intake: "Intake", author: "Author", "pre-check": "Pre-check", "requirements-preparer": "Requirements preparation", "technical-preparer": "Technical preparation" };

/** True only when a queued pre-check is specifically held for want of an independent runtime. */
function isIndependenceHold(run: Run): boolean {
  if (run.role !== "pre-check" || run.status !== "queued") return false;
  if (run.waiting_cause !== undefined) return run.waiting_cause === "independent-runtime";
  return run.waiting_reason !== undefined && /independent runtime/i.test(run.waiting_reason);
}

/** What the run card says about where a run stands, in plain words. */
export function runStatusText(run: Pick<Run, "status" | "waiting_reason" | "waiting_cause" | "label" | "stop_requested_at">): string {
  switch (run.status) {
    case "lost":
      return "Lost: the daemon stopped answering";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "queued":
      return run.waiting_reason !== undefined
        ? `Held: ${run.waiting_reason}`
        : run.waiting_cause !== undefined
          ? `Held: ${run.waiting_cause}`
          : (run.label ?? run.status);
    case "running":
      return run.stop_requested_at !== undefined ? "Stopping: waiting for the daemon to confirm" : (run.label ?? run.status);
    default:
      return run.label ?? run.status;
  }
}

/** A lost run whose exit or completion was never seen holds requeue until it is reconciled. */
export function outcomeUnknown(run: Run): boolean {
  return run.outcome_unknown !== undefined && run.reconciliation === undefined;
}

/** Only supported legacy runs can be queued again by the owner, once, and never while their outcome is unknown. */
export function canRequeue(run: Run): boolean {
  return ["intake", "author", "pre-check"].includes(run.role) && (run.status === "lost" || run.status === "failed" || run.status === "stopped")
    && run.requeued_as === undefined && !outcomeUnknown(run);
}

/**
 * A lost run with an unknown outcome: its process may still be running somewhere. Restarting the
 * daemon usually settles it on its own; otherwise the owner signs why it will not report.
 */
/**
 * The SCRAM lock for a package's runs, keyed to the project that owns the package (read from the package view the
 * page already holds), not the project selected in the sidebar. Until that view is cached, the open project is used.
 */
function usePackageLock(packageId: string) {
  const view = useQuery<PackageView>({ queryKey: ["package", packageId], enabled: false });
  return useActionLock(view.data?.package.project);
}

/** The reason recorded when the owner confirms with a press that a run is no longer running. */
export const PRESSED_RECONCILE_REASON = "The owner checked that this run is no longer running.";

/**
 * Why the outcome is unknown, in plain words. A run that ended and reported, but without proof that
 * every process it started has stopped (always so on macOS, which has no process scopes), is not one
 * whose daemon stopped answering, and saying so sends the person after the wrong problem.
 */
export function unknownOutcomeText(run: Run): string {
  const why = run.outcome_unknown?.reason ?? "";
  if (/lease|restarted|renewing/.test(why)) {
    return "Outcome unknown: the daemon stopped answering before this run finished, so its process may still be running. Restart the daemon and it reports what happened on its own.";
  }
  return "This run ended, but Control Rod cannot prove every process it started has stopped (on macOS it never can). Make sure nothing from it is still running, then run it again.";
}

function Reconcile({ packageId, run, passkeys }: { packageId: string; run: Run; passkeys: Passkeys }) {
  const qc = useQueryClient();
  const scramLock = usePackageLock(packageId);
  const [reason, setReason] = useState("");
  // Settling it is a press wherever the project's signing settings let a card be sent back with a press.
  const actions = useQuery({ queryKey: ["actions", packageId], queryFn: () => api.packageActions(packageId), enabled: outcomeUnknown(run) });
  const byPress = actions.data?.find((a) => a.command === "return")?.step_mode === "click";
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["package", packageId] });
    void qc.invalidateQueries({ queryKey: ["run", packageId, run.id] });
    void qc.invalidateQueries({ queryKey: ["active-runs"] });
  };
  const go = useMutation({
    mutationFn: () => signReconcile({ packageId, runId: run.id, reason }, passkeys),
    onSuccess: done,
  });
  // One press: confirm it stopped, then queue it again.
  const press = useMutation({
    mutationFn: async () => {
      await api.reconcileRun(packageId, run.id, { reason: PRESSED_RECONCILE_REASON });
      if (run.requeued_as === undefined && ["intake", "author", "pre-check"].includes(run.role)) await api.requeueRun(packageId, run.id);
    },
    onSettled: done,
  });
  if (!outcomeUnknown(run)) return null;
  if (byPress) {
    return (
      <div className="run-hold">
        <p className="small">{unknownOutcomeText(run)}</p>
        <button type="button" className="btn small" disabled={press.isPending || scramLock.locked} title={scramLock.why} onClick={() => press.mutate()}>
          It has stopped. Run it again
        </button>
        {press.isError && (
          <p className="error" role="alert">
            {explain(press.error, "The run was not settled.")}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="run-hold">
      <p className="small">
        {unknownOutcomeText(run)} If it will never report, say why and sign.
      </p>
      <label className="small" htmlFor={`reconcile-${run.id}`}>
        Why will this run never report?
      </label>
      <textarea id={`reconcile-${run.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <button type="button" className="btn small" disabled={reason.trim().length === 0 || go.isPending || scramLock.locked} title={scramLock.why} onClick={() => go.mutate()}>
        Sign with passkey and reconcile
      </button>
      {go.isError && (
        <p className="error" role="alert">
          {explain(go.error, "The run was not reconciled.")}
        </p>
      )}
    </div>
  );
}

/**
 * A held pre-check: the only runtime available is the author's. The owner can proceed with a
 * written reason, signed with the passkey; it is recorded and shows on the pre-check record as a
 * shared runtime.
 */
function IndependenceOverride({ packageId, run, passkeys }: { packageId: string; run: Run; passkeys: Passkeys }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const go = useMutation({
    mutationFn: () => signOverride({ packageId, runId: run.id, reason }, passkeys),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["package", packageId] }),
  });
  if (!isIndependenceHold(run) || run.waiting_reason === undefined) return null;
  return (
    <div className="run-hold">
      <p className="error">{run.waiting_reason}</p>
      <label className="small" htmlFor={`why-${run.id}`}>
        Why may this pre-check run on the author&apos;s runtime?
      </label>
      <textarea id={`why-${run.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <button type="button" className="btn small" disabled={reason.trim().length === 0 || go.isPending} onClick={() => go.mutate()}>
        Sign with passkey and proceed
      </button>
      {go.isError && (
        <p className="error" role="alert">
          {go.error.message}
        </p>
      )}
    </div>
  );
}

/** A queued run, or a running one nobody has asked to stop yet, can be stopped by the owner. */
export function canStop(run: Run): boolean {
  return run.status === "queued" || (run.status === "running" && run.stop_requested_at === undefined);
}

export function RunActions({ packageId, run, showStop = true }: { packageId: string; run: Run; showStop?: boolean }) {
  const offeredStop = showStop && canStop(run);
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["package", packageId] });
    void qc.invalidateQueries({ queryKey: ["run", packageId, run.id] });
    void qc.invalidateQueries({ queryKey: ["active-runs"] });
  };
  const requeue = useMutation({ mutationFn: () => api.requeueRun(packageId, run.id), onSuccess: done });
  const stop = useMutation({ mutationFn: () => api.stopRun(packageId, run.id), onSuccess: done });
  const scramLock = usePackageLock(packageId);
  if (!canRequeue(run) && !offeredStop) return null;
  const failed = requeue.error ?? stop.error;
  return (
    <div className="run-actions">
      {offeredStop && (
        <button type="button" className="btn small" disabled={stop.isPending} onClick={() => stop.mutate()}>
          Stop this run
        </button>
      )}
      {canRequeue(run) && (
        <button type="button" className="btn small" disabled={requeue.isPending || scramLock.locked} title={scramLock.why} onClick={() => requeue.mutate()}>
          Requeue this run
        </button>
      )}
      {failed !== null && (
        <p className="error" role="alert">
          {failed.message}
        </p>
      )}
    </div>
  );
}

/** A run's error: the plain sentence first, the runner's own text one click away. */
function RunError({ raw }: { raw: string }) {
  const plain = plainError(raw);
  if (!plain || plain.what === raw.trim()) return <p className="error">{raw}</p>;
  return (
    <div className="run-error">
      <p className="error">
        {plain.what}
        {plain.fix && <> {plain.fix}</>}
      </p>
      <details className="small">
        <summary>Technical details</summary>
        <pre className="log">{raw}</pre>
      </details>
    </div>
  );
}

export function RunCard({ packageId, run, passkeys = browserPasskeys, readOnly = false, focused = false }: { packageId: string; run: Run; passkeys?: Passkeys; readOnly?: boolean; focused?: boolean }) {
  const live = run.status === "running" || run.status === "queued";
  const needsAttention = canRequeue(run) || outcomeUnknown(run) || isIndependenceHold(run);
  const [detailsOpen, setDetailsOpen] = useState(needsAttention);
  const log = useQuery({
    queryKey: ["runlog", packageId, run.id],
    queryFn: () => api.runLog(packageId, run.id),
    enabled: !focused || detailsOpen,
    refetchInterval: () => (live && isVisible() ? 2000 : false),
  });
  const latest = log.data?.lines ?? [];
  // A reader can freeze the log to read it top to bottom without it moving. Polling carries on, so
  // the count of what arrived meanwhile stays true; only what is shown is held back.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const lines = frozen ?? latest;
  const waiting = frozen === null ? 0 : Math.max(0, latest.length - frozen.length);
  const routing = modelRouting(run.trace, run.finished_at !== undefined);
  const [full, setFull] = useState(false);
  const openScreen = usePanelScreen();
  const logTitle = runLogTitle(run);
  function openFull() {
    // In a card's side panel the log opens over the card at the panel's full size; on a page, as a modal.
    if (openScreen) openScreen(runLogScreen(packageId, run));
    else setFull(true);
  }
  return (
    // A run that needs the person (requeue it, or reconcile it first) is shown open, so its buttons are seen.
    <details
      className="run"
      open={focused ? detailsOpen : live || canRequeue(run) || outcomeUnknown(run)}
      onToggle={focused ? (event) => setDetailsOpen(event.currentTarget.open) : undefined}
    >
      <summary>
        {focused ? "Run details and raw log" : (
          <>
            <StateMark kind={runState(run)} />
            <span className="tag">{ROLE_LABEL[run.role]}</span>
            <span>round {run.round}</span>
            <span className="muted small">{runStatusText(run)}</span>
            <span className="muted small mono">{run.runtime.provider}</span>
            <VendorBadge provider={run.runtime.provider} />
          </>
        )}
      </summary>
      <div className="run-body">
        <p className="muted small">
          {run.agent_baseline} · queued {time(run.queued_at)}
          {run.finished_at !== undefined && ` · finished ${time(run.finished_at)}`}
        </p>
        {routing.kind === "rerouted" ? (
          <p className="run-rerouted small" role="note">
            <strong>Fallback:</strong> {routing.text}
          </p>
        ) : routing.kind !== "none" ? (
          <p className="muted small">{routing.text}</p>
        ) : null}
        {run.error !== undefined && <RunError raw={run.error} />}
        {run.requeued_as !== undefined && <p className="muted small">Requeued as {run.requeued_as}</p>}
        {run.reconciliation !== undefined && <p className="muted small">Reconciled ({run.reconciliation.disposition}): {run.reconciliation.evidence}</p>}
        {!readOnly && <Reconcile packageId={packageId} run={run} passkeys={passkeys} />}
        {run.independence_override !== undefined && (
          <p className="muted small">
            Owner override by {run.independence_override.by}: {run.independence_override.reason}
          </p>
        )}
        {!readOnly && <IndependenceOverride packageId={packageId} run={run} passkeys={passkeys} />}
        {run.status === "queued" && (run.waiting_reason !== undefined || run.waiting_cause !== undefined) && !isIndependenceHold(run) && (
          <div className="run-hold">
            <p className="error">{run.waiting_reason ?? `Held: ${run.waiting_cause}`}</p>
          </div>
        )}
        {!readOnly && <RunActions packageId={packageId} run={run} showStop={!focused} />}
        <div className="log-bar">
          <button type="button" className="btn small" onClick={openFull}>
            Open full log
          </button>
          {(live || frozen !== null) && (
            <>
            <button type="button" className="btn ghost small" onClick={() => {
              // Resuming fetches again, so lines that landed after the last poll (a run that just
              // ended stops polling) are not missed.
              if (frozen !== null) void log.refetch();
              setFrozen(frozen === null ? latest : null);
            }}>
              {frozen === null ? "Pause updates" : "Resume updates"}
            </button>
            {frozen !== null && (
              <span className="muted small">
                {waiting === 0 ? "Paused: nothing new since you paused." : `Paused: ${waiting} new ${waiting === 1 ? "line" : "lines"} since you paused.`}
              </span>
            )}
            </>
          )}
        </div>
        {full && (
          <LogViewer
            title={logTitle}
            summary={run.error !== undefined ? <RunError raw={run.error} /> : <p>{runStatusText(run)}</p>}
            lines={latest}
            live={live}
            onClose={() => setFull(false)}
          />
        )}
        <pre className="log" aria-label={`${ROLE_LABEL[run.role]} log`}>
          {lines.length === 0 ? "No log lines yet." : lines.slice(-400).join("\n")}
        </pre>
      </div>
    </details>
  );
}

export const runLogTitle = (run: Run) => `${ROLE_LABEL[run.role]} log, round ${run.round}`;

/** A run's full log at the side panel's full size, over its card. */
export function runLogScreen(packageId: string, run: Run): PanelScreen {
  const title = runLogTitle(run);
  return { key: `log:${run.id}`, title, body: <LiveLog packageId={packageId} run={run} title={title} /> };
}

/**
 * The full log in the side panel. It reads the same query as the run's card, so it keeps updating
 * while the run is live, and it stays live after the card's own section is folded.
 */
function LiveLog({ packageId, run: opened, title }: { packageId: string; run: Run; title: string }) {
  // The run as the card's own read has it now, so the status line follows it after it finishes.
  const view = useQuery({ queryKey: ["package", packageId], queryFn: () => api.packageView(packageId) });
  const run = view.data?.runs?.find((r) => r.id === opened.id) ?? opened;
  // Listed under Recent runs, as opening it on the case page does.
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  const viewer = sessionIdentity(session.data);
  useEffect(() => {
    rememberRun(viewer, packageId, opened.id);
  }, [viewer, packageId, opened.id]);
  const live = run.status === "running" || run.status === "queued";
  const log = useQuery({
    queryKey: ["runlog", packageId, run.id],
    queryFn: () => api.runLog(packageId, run.id),
    refetchInterval: () => (live && isVisible() ? 2000 : false),
  });
  return <LogBody title={title} summary={run.error !== undefined ? <RunError raw={run.error} /> : <p>{runStatusText(run)}</p>} lines={log.data?.lines ?? []} live={live} />;
}
