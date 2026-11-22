import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../api/client.js";
import { useLiveStatus } from "../lib/live.js";
import { recentRuns } from "../lib/runPreferences.js";
import { sessionIdentity } from "../lib/session.js";
import { CLI_ECOSYSTEMS } from "../lib/runtimes.js";
import { runStatusText } from "./RunLog.js";

/** Switch between recorded runs from any signed-in page. Read the queue while the control is open. */
export function ActiveRuns() {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  function close() {
    if (disclosure.current) disclosure.current.open = false;
  }

  return (
    <details
      className="active-runs"
      ref={disclosure}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.preventDefault();
        close();
        summary.current?.focus();
      }}
    >
      <summary className="btn small" ref={summary}>Runs</summary>
      <section className="active-runs-panel" aria-label="Active runs">
        <ActiveRunList enabled={open} onSelect={close} showRecent />
      </section>
    </details>
  );
}

export function ActiveRunList({ enabled = true, onSelect, showRecent = false }: { enabled?: boolean; onSelect?: () => void; showRecent?: boolean }) {
  const live = useLiveStatus();
  const session = useQuery({ queryKey: ["session"], queryFn: api.session, enabled: false });
  const runs = useQuery({
    queryKey: ["active-runs"],
    queryFn: api.activeRuns,
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
  const lastKnown = live.status === "unknown" || runs.isError ||
    (live.droppedAt !== undefined && runs.dataUpdatedAt <= live.droppedAt);

  const recent = showRecent ? recentRuns(sessionIdentity(session.data)).filter(
    (visited) => !runs.data?.some((run) => run.id === visited.runId && run.package_id === visited.packageId),
  ) : [];

  return (
    <>
      <div className="active-runs-head">
        <h2>Active runs</h2>
        {runs.data && lastKnown && <span className="small muted">Last known</span>}
      </div>
      {enabled && runs.isPending && <p className="small muted" role="status">Loading runs…</p>}
      {runs.isError && (
        <div role="alert" className="active-runs-head">
          <span className="small">Could not refresh runs.</span>
          <button type="button" className="btn small" onClick={() => void runs.refetch()}>Retry</button>
        </div>
      )}
      {runs.data?.length === 0 && !lastKnown && <p className="small muted">No queued or running work.</p>}
      {runs.data?.length === 0 && lastKnown && <p className="small muted">No runs in the last read.</p>}
      {runs.data && runs.data.length > 0 && (
        <ul className="active-runs-list">
          {runs.data.map((run) => (
            <li key={run.id}>
              {run.role === "intake" ? (
                <Link to="/packages" className="active-run-link" onClick={onSelect}>
                  <strong>Intake · {run.package_id}</strong>
                  <span className="small muted">Open captures</span>
                </Link>
              ) : (
                <Link
                  to="/packages/$id"
                  params={{ id: run.package_id }}
                  hash={`run-${run.id}`}
                  className="active-run-link"
                  onClick={onSelect}
                >
                  <strong>{run.title || run.package_id}</strong>
                  <span className="small muted"><span className="mono">{run.package_id} · {run.id}</span> · {run.role}</span>
                </Link>
              )}
              <div className="active-run-status small">
                <span className="tag">{CLI_ECOSYSTEMS.find((cli) => cli.id === run.runtime.provider)?.label ?? run.runtime.provider}</span>
                <span>{runStatusText(run)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <>
          <div className="active-runs-head"><h2>Recent runs</h2></div>
          <ul className="active-runs-list">
            {recent.map((visited) => (
              <li key={`${visited.packageId}/${visited.runId}`}>
                <Link
                  to="/packages/$id"
                  params={{ id: visited.packageId }}
                  hash={`run-${visited.runId}`}
                  className="active-run-link mono small"
                  onClick={onSelect}
                >
                  {visited.packageId} · {visited.runId}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
