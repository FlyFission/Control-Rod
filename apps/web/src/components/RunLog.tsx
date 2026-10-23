import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Run } from "../api/types.js";
import { isVisible } from "../lib/live.js";
import { type Passkeys, browserPasskeys, signOverride } from "../lib/decide.js";
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

/** Only supported legacy runs can be queued again by the owner, once. */
export function canRequeue(run: Run): boolean {
  return ["intake", "author", "pre-check"].includes(run.role) && (run.status === "lost" || run.status === "failed" || run.status === "stopped") && run.requeued_as === undefined;
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
  const lines = log.data?.lines ?? [];
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
        {run.independence_override !== undefined && (
          <p className="muted small">
            Owner override by {run.independence_override.by}: {run.independence_override.reason}
          </p>
        )}
        <IndependenceOverride packageId={packageId} run={run} passkeys={passkeys} />
        <RunActions packageId={packageId} run={run} />
        <pre className="log" aria-label={`${ROLE_LABEL[run.role]} log`}>
          {lines.length === 0 ? "No log lines yet." : lines.slice(-400).join("\n")}
        </pre>
      </div>
    </details>
  );
}
