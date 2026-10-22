import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Run } from "../api/types.js";
import { isVisible } from "../lib/live.js";
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

const ROLE_LABEL: Record<Run["role"], string> = { intake: "Intake", author: "Author", "pre-check": "Pre-check" };

/** What the run card says about where a run stands, in plain words. */
export function runStatusText(run: Run): string {
  switch (run.status) {
    case "lost":
      return "Lost: the daemon stopped answering";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    default:
      return run.label ?? run.status;
  }
}

/** A lost, failed or stopped run can be queued again by the owner, once. */
export function canRequeue(run: Run): boolean {
  return (run.status === "lost" || run.status === "failed" || run.status === "stopped") && run.requeued_as === undefined;
}

function RunActions({ packageId, run }: { packageId: string; run: Run }) {
  const qc = useQueryClient();
  const requeue = useMutation({
    mutationFn: () => api.requeueRun(packageId, run.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["package", packageId] }),
  });
  if (!canRequeue(run)) return null;
  return (
    <div className="run-actions">
      <button type="button" className="btn small" disabled={requeue.isPending} onClick={() => requeue.mutate()}>
        Requeue this run
      </button>
      {requeue.isError && (
        <p className="error" role="alert">
          {requeue.error.message}
        </p>
      )}
    </div>
  );
}

export function RunCard({ packageId, run }: { packageId: string; run: Run }) {
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
        <RunActions packageId={packageId} run={run} />
        <pre className="log" aria-label={`${ROLE_LABEL[run.role]} log`}>
          {lines.length === 0 ? "No log lines yet." : lines.slice(-400).join("\n")}
        </pre>
      </div>
    </details>
  );
}
