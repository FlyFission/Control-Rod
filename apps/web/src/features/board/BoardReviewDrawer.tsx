import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import type { WorkPackage } from "../../api/types.js";
import { AgentPanel, pickRun } from "../../components/AgentPanel.js";
import { DecisionBar } from "../../components/DecisionBar.js";
import { OutputItem } from "../../components/OutputPreview.js";
import { RunCard, canRequeue, outcomeUnknown } from "../../components/RunLog.js";
import { projectContextDefault } from "../../lib/context-profile.js";
import { needsIndependentCheck } from "../../lib/board.js";
import { shortDigest, STATUS_LABEL } from "../../lib/format.js";
import { MODE_COPY, type EngineeringMode } from "../../lib/mode.js";
import { ContextSwitch } from "./ContextSwitch.js";

interface BoardReviewDrawerProps {
  packageId: string;
  initialPkg?: WorkPackage;
  mode: EngineeringMode;
  onClose: () => void;
}

/**
 * Non-obscuring split review drawer for the Board. Preserves Board scroll, filters, and context
 * while offering full evidence summary, custody chain, direct Full case link, and kernel-gated DecisionBar.
 */
export function BoardReviewDrawer({ packageId, initialPkg, mode, onClose }: BoardReviewDrawerProps) {
  const qc = useQueryClient();
  const copy = MODE_COPY[mode];
  const asideRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"overview" | "runs" | "deliverables">("overview");
  const q = useQuery({
    queryKey: ["package", packageId],
    queryFn: () => api.packageView(packageId),
  });
  const admin = useQuery({ queryKey: ["admin"], queryFn: api.admin });
  const closePkg = useMutation({
    mutationFn: () => api.closePackage(packageId),
    onSuccess: () => {
      for (const key of ["packages", "office", "inbox"]) void qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });
  const resetClosePkg = closePkg.reset;

  useEffect(() => {
    setTab("overview");
    resetClosePkg();
    asideRef.current?.focus();
  }, [packageId, resetClosePkg]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open], .palette")) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const view = q.data;
  const pkg = view?.package ?? initialPkg;
  const sortedRuns = view
    ? [...view.runs].sort((a, b) => {
        const ta = Date.parse(a.finished_at ?? a.started_at ?? a.queued_at) || 0;
        const tb = Date.parse(b.finished_at ?? b.started_at ?? b.queued_at) || 0;
        return tb - ta;
      })
    : [];
  const latestRun = view ? pickRun(view.runs) : undefined;
  const latestRunNeedsAction =
    latestRun !== undefined &&
    (canRequeue(latestRun) ||
      outcomeUnknown(latestRun) ||
      (latestRun.status === "queued" && latestRun.waiting_reason !== undefined) ||
      latestRun.status === "failed" ||
      latestRun.status === "lost" ||
      latestRun.status === "stopped");
  const otherRuns = latestRun ? sortedRuns.filter((r) => r.id !== latestRun.id) : sortedRuns;

  return (
    <aside ref={asideRef} tabIndex={-1} className="bd-drawer" aria-label={`Review ${packageId}`}>
      <div className="bd-drawer-head">
        <div className="bd-drawer-id-row">
          <span className="mono small">
            {packageId}
            {pkg ? ` · rev ${pkg.revision}` : ""}
          </span>
          {pkg && <span className="bd-chip">{STATUS_LABEL[pkg.status]}</span>}
        </div>
        <div className="bd-drawer-actions">
          <button
            type="button"
            className="btn small danger"
            disabled={closePkg.isPending}
            onClick={() => closePkg.mutate()}
          >
            {closePkg.isPending ? "Closing…" : "Remove"}
          </button>
          <Link to="/packages/$id" params={{ id: packageId }} className="btn small">
            Full case ↗
          </Link>
          <button type="button" className="btn small" onClick={onClose} aria-label="Close review drawer">
            Close
          </button>
          <kbd className="muted small" aria-hidden="true">
            Esc
          </kbd>
        </div>
      </div>

      <div className="bd-drawer-body">
        {closePkg.isError && (
          <p role="alert" className="bd-alert small">
            {explain(closePkg.error, "Could not remove card.")}
          </p>
        )}
        {pkg ? (
          <>
            <h2 className="bd-drawer-title">{pkg.title}</h2>
            <div className="bd-drawer-tags">
              {pkg.project && <span className="bd-chip">{pkg.project}</span>}
              <span className="bd-chip">{pkg.grade ?? "general-service"}</span>
              <span className="bd-chip">Lane: {view?.effective_lane ?? pkg.data_lane}</span>
              {pkg.discipline && <span className="bd-chip">{pkg.discipline}</span>}
            </div>

            <div className="bd-drawer-tabs" role="tablist" aria-label="Package sections">
              {(
                [
                  ["overview", "Overview"],
                  ["runs", `Runs (${view?.runs.length ?? 0})`],
                  ["deliverables", `Deliverables (${view?.outputs.length ?? 0}/${pkg.deliverables.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={tab === id ? "bd-drawer-tab active" : "bd-drawer-tab"}
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {id === "runs" && latestRunNeedsAction && (
                    <span className="bd-drawer-tab-alert" title="Action required on latest run">
                      <span aria-hidden="true"> ▲</span>
                      <span className="sr-only"> (action required)</span>
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <>
                <ContextSwitch pkg={pkg} view={view} projectDefault={projectContextDefault(admin.data?.projects, pkg.project)} />

                <section className="bd-drawer-sec">
                  <h3>Custody Chain</h3>
                  <div className="bd-custody-grid">
                    <div className="bd-custody-cell">
                      <span className="bd-custody-role">{copy.custodyRoles[0]}</span>
                      <span className="small">{pkg.agent_assignment[0]?.agent_baseline ?? "Unassigned"}</span>
                    </div>
                    <div className="bd-custody-cell">
                      <span className="bd-custody-role">{copy.custodyRoles[1]}</span>
                      <span className="small">{needsIndependentCheck(pkg) ? "Independent required" : "Standard check"}</span>
                    </div>
                    <div className="bd-custody-cell">
                      <span className="bd-custody-role">{copy.custodyRoles[2]}</span>
                      <span className="small">Passkey sign-off</span>
                    </div>
                  </div>
                </section>

                <section className="bd-drawer-sec">
                  <h3>{mode === "capital-projects" ? "Design Basis & Assumptions" : "Scope & Assumptions"}</h3>
                  {pkg.objective && <p className="small">{pkg.objective}</p>}
                  {(pkg.assumptions ?? []).length > 0 ? (
                    <ul className="bd-drawer-list">
                      {(pkg.assumptions ?? []).map((a) => (
                        <li key={a.id} className="small">
                          <span className="mono">{a.id}</span> · {a.statement}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small muted">No assumptions recorded yet.</p>
                  )}
                </section>

                <section className="bd-drawer-sec">
                  <h3>Acceptance Criteria</h3>
                  {pkg.acceptance_criteria.length > 0 ? (
                    <ol className="bd-drawer-list">
                      {pkg.acceptance_criteria.map((c, idx) => (
                        <li key={idx} className="small">
                          {c}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="small muted">No acceptance criteria recorded yet.</p>
                  )}
                </section>

                {(pkg.depends_on ?? []).length > 0 && (
                  <section className="bd-drawer-sec">
                    <h3>Depends On</h3>
                    <ul className="bd-drawer-list">
                      {(pkg.depends_on ?? []).map((dep) => (
                        <li key={dep.package_id} className="small">
                          <span className="mono">{dep.package_id}</span>
                          {dep.reason ? ` · ${dep.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {view?.pre_check && (
                  <section className="bd-drawer-sec">
                    <h3>Pre-check</h3>
                    <p className="small" style={{ margin: "0 0 6px" }}>
                      <span className={`tag outcome-${view.pre_check.outcome}`}>{view.pre_check.outcome}</span>{" "}
                      <span className="muted">
                        by {view.pre_check.verifier} · {view.pre_check.method}
                      </span>
                    </p>
                    {view.pre_check.findings.length > 0 ? (
                      <ul className="bd-drawer-list">
                        {view.pre_check.findings.map((f) => (
                          <li key={f.id} className="small">
                            <span className={`tag sev-${f.severity}`}>{f.severity}</span>{" "}
                            <span className="mono">{f.id}</span> {f.text}
                            {f.resolution !== undefined && <span className="muted"> · Resolution: {f.resolution}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="small muted">No findings.</p>
                    )}
                  </section>
                )}
              </>
            )}

            {tab === "runs" && (
              <section className="bd-drawer-sec">
                <h3>Agent Runs ({sortedRuns.length})</h3>
                {q.isLoading && !view ? (
                  <p className="small muted">Loading runs…</p>
                ) : sortedRuns.length > 0 ? (
                  <>
                    {latestRun && latestRunNeedsAction && <RunCard key={latestRun.id} packageId={packageId} run={latestRun} />}
                    <AgentPanel packageId={packageId} showStop={!latestRun} />
                    {(latestRunNeedsAction ? otherRuns : sortedRuns).map((run) => (
                      <RunCard key={run.id} packageId={packageId} run={run} />
                    ))}
                  </>
                ) : (
                  <p className="small muted">No agent runs recorded yet.</p>
                )}
              </section>
            )}

            {tab === "deliverables" && (
              <section className="bd-drawer-sec">
                <h3>Produced Outputs ({view?.outputs.length ?? 0})</h3>
                {q.isLoading && !view ? (
                  <p className="small muted">Loading outputs…</p>
                ) : view && view.outputs.length > 0 ? (
                  <ul className="outputs">
                    {view.outputs.map((a) => (
                      <OutputItem key={a.path} packageId={packageId} artifact={a} />
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">No outputs produced yet.</p>
                )}
                <h3 style={{ marginTop: 12 }}>Requested Deliverables ({pkg.deliverables.length})</h3>
                {pkg.deliverables.length > 0 ? (
                  <ul className="bd-drawer-list">
                    {pkg.deliverables.map((d) => (
                      <li key={d.id} className="small">
                        <span className="mono">{d.id}</span> · {d.type}
                        {d.format && d.format.length > 0 ? ` (${d.format.join(", ")})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">No deliverables listed.</p>
                )}
              </section>
            )}
          </>
        ) : q.isLoading ? (
          <p className="muted">Loading package details…</p>
        ) : null}

        {q.isError && (
          <div role="alert" className="error">
            <p>{explain(q.error, "Could not load full package evidence.")}</p>
            <button type="button" className="btn small" onClick={() => void q.refetch()}>
              Retry
            </button>
          </div>
        )}
      </div>

      {view && (
        <div className="bd-drawer-foot">
          <div className="bd-drawer-sign-meta mono small muted">
            <span>Lane: {view.effective_lane ?? pkg?.data_lane ?? "internal"}</span>
            <span>Digest: {shortDigest(view.subject_digest)}</span>
          </div>
          <DecisionBar key={packageId} view={view} />
        </div>
      )}
    </aside>
  );
}
