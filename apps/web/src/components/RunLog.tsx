import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { Run } from "../api/types.js";
import { isVisible } from "../lib/live.js";
import { type Passkeys, browserPasskeys, signOverride, signReconcile } from "../lib/decide.js";
import { time } from "../lib/format.js";
import { StateMark, type StateKind } from "./StateMark.js";

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

/** What the run card says about where a run stands, in plain words. */
export function runStatusText(run: Run): string {
  switch (run.status) {
    case "lost":
      return "Lost: the daemon stopped answering";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "queued":
      return run.waiting_reason !== undefined ? "Held: waiting for an independent runtime" : (run.label ?? run.status);
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
function Reconcile({ packageId, run, passkeys }: { packageId: string; run: Run; passkeys: Passkeys }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const go = useMutation({
    mutationFn: () => signReconcile({ packageId, runId: run.id, reason }, passkeys),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["package", packageId] }),
  });
  if (!outcomeUnknown(run)) return null;
  return (
    <div className="run-hold">
      <p className="small">
        Outcome unknown: the daemon stopped answering before this run finished, so its process may still be running. Restart the daemon and it
        reports what happened on its own. If the daemon will never come back, say why and sign.
      </p>
      <label className="small" htmlFor={`reconcile-${run.id}`}>
        Why will this run never report?
      </label>
      <textarea id={`reconcile-${run.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      <button type="button" className="btn small" disabled={reason.trim().length === 0 || go.isPending} onClick={() => go.mutate()}>
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
  if (run.role !== "pre-check" || run.status !== "queued" || run.waiting_reason === undefined) return null;
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

function RunActions({ packageId, run }: { packageId: string; run: Run }) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["package", packageId] });
  const requeue = useMutation({ mutationFn: () => api.requeueRun(packageId, run.id), onSuccess: done });
  const stop = useMutation({ mutationFn: () => api.stopRun(packageId, run.id), onSuccess: done });
  if (!canRequeue(run) && !canStop(run)) return null;
  const failed = requeue.error ?? stop.error;
  return (
    <div className="run-actions">
      {canStop(run) && (
        <button type="button" className="btn small" disabled={stop.isPending} onClick={() => stop.mutate()}>
          Stop this run
        </button>
      )}
      {canRequeue(run) && (
        <button type="button" className="btn small" disabled={requeue.isPending} onClick={() => requeue.mutate()}>
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

export function RunCard({ packageId, run, passkeys = browserPasskeys }: { packageId: string; run: Run; passkeys?: Passkeys }) {
  const live = run.status === "running" || run.status === "queued";
  const log = useQuery({
    queryKey: ["runlog", packageId, run.id],
    queryFn: () => api.runLog(packageId, run.id),
    refetchInterval: () => (live && isVisible() ? 2000 : false),
  });
  const latest = log.data?.lines ?? [];
  // A reader can freeze the log to read it top to bottom without it moving. Polling carries on, so
  // the count of what arrived meanwhile stays true; only what is shown is held back.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const lines = frozen ?? latest;
  const waiting = frozen === null ? 0 : Math.max(0, latest.length - frozen.length);
  return (
    <details className="run" open={live}>
      <summary>
        <StateMark kind={runState(run)} />
        <span className="tag">{ROLE_LABEL[run.role]}</span>
        <span>round {run.round}</span>
        <span className="muted small">{runStatusText(run)}</span>
        <span className="muted small mono">{run.runtime.provider}</span>
      </summary>
      <div className="run-body">
        <p className="muted small">
          {run.agent_baseline} · queued {time(run.queued_at)}
          {run.finished_at !== undefined && ` · finished ${time(run.finished_at)}`}
        </p>
        {run.error !== undefined && (
          <p className="error" role="alert">
            {run.error}
          </p>
        )}
        {run.requeued_as !== undefined && <p className="muted small">Requeued as {run.requeued_as}</p>}
        {run.reconciliation !== undefined && <p className="muted small">Reconciled ({run.reconciliation.disposition}): {run.reconciliation.evidence}</p>}
        <Reconcile packageId={packageId} run={run} passkeys={passkeys} />
        {run.independence_override !== undefined && (
          <p className="muted small">
            Owner override by {run.independence_override.by}: {run.independence_override.reason}
          </p>
        )}
        <IndependenceOverride packageId={packageId} run={run} passkeys={passkeys} />
        <RunActions packageId={packageId} run={run} />
        {(live || frozen !== null) && (
          <div className="log-bar">
            <button type="button" className="btn ghost small" onClick={() => setFrozen(frozen === null ? latest : null)}>
              {frozen === null ? "Pause updates" : "Resume updates"}
            </button>
            {frozen !== null && (
              <span className="muted small">
                {waiting === 0 ? "Paused: nothing new since you paused." : `Paused: ${waiting} new ${waiting === 1 ? "line" : "lines"} since you paused.`}
              </span>
            )}
          </div>
        )}
        <pre className="log" aria-label={`${ROLE_LABEL[run.role]} log`}>
          {lines.length === 0 ? "No log lines yet." : lines.slice(-400).join("\n")}
        </pre>
      </div>
    </details>
  );
}
