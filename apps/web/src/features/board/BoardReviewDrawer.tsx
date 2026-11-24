import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import { projectDisplayName, useProjects } from "../../lib/projects.js";
import type { WorkPackage } from "../../api/types.js";
import { AgentPanel, pickRun } from "../../components/AgentPanel.js";
import { DecisionBar } from "../../components/DecisionBar.js";
import { DrawerOutputs } from "./DrawerOutputs.js";
import { useDockTop } from "./dock.js";
import { AgentBadge } from "../../components/AgentBadge.js";
import { InstrumentFrame } from "../../design/instruments/InstrumentFrame.js";
import { RunCard, canRequeue, outcomeUnknown } from "../../components/RunLog.js";
import { projectContextDefault } from "../../lib/context-profile.js";
import { needsIndependentCheck } from "../../lib/board.js";
import { shortDigest, STATUS_LABEL } from "../../lib/format.js";
import { MODE_COPY, type EngineeringMode } from "../../lib/mode.js";
import { ContextSwitch } from "./ContextSwitch.js";
import { WorkflowSwitch } from "./WorkflowSwitch.js";
import { projectWorkflowDefault } from "../../lib/workflow.js";
import { FindingDetail, ScopeDriftNote } from "../../components/FindingDetail";

interface BoardReviewDrawerProps {
  packageId: string;
  initialPkg?: WorkPackage;
  mode: EngineeringMode;
  autoFocus?: boolean;
  onClose: () => void;
}

type Detail = "criteria" | "precheck" | "scope";

/**
 * The drawer as a cockpit (control room redesign, section 7): one layout, no tabs. A status strip
 * carries the facts a decision rests on (custody, criteria, pre-check, switches); the run log sits
 * left, the outputs preview right (a patch as a unified diff), and the decision bar is pinned under
 * both. Below 1024 px the same parts stack in the same order. The Board stays where it was.
 */
export function BoardReviewDrawer({ packageId, initialPkg, mode, autoFocus = true, onClose }: BoardReviewDrawerProps) {
  const projects = useProjects();
  const copy = MODE_COPY[mode];
  const asideRef = useRef<HTMLElement>(null);
  useDockTop(asideRef);
  // Closing hands focus back to whatever opened the drawer (the card or button), if it is still on the page.
  const opener = useRef<Element | null>(null);
  if (opener.current === null && typeof document !== "undefined") opener.current = document.activeElement;
  useEffect(() => {
    return () => {
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected && el !== document.body) el.focus();
    };
  }, []);
  const [detail, setDetail] = useState<Detail | null>(null);
  const q = useQuery({
    queryKey: ["package", packageId],
    queryFn: () => api.packageView(packageId),
  });
  const admin = useQuery({ queryKey: ["admin"], queryFn: api.admin });
  useEffect(() => {
    setDetail(null);
    if (autoFocus) asideRef.current?.focus();
  }, [packageId, autoFocus]);

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
  const pre = view?.pre_check;
  const toggle = (d: Detail) => setDetail((cur) => (cur === d ? null : d));
  const author = view ? [...view.runs].filter((r) => r.role === "author").sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))[0]?.runtime?.provider : undefined;
  const checker = view ? [...view.runs].filter((r) => r.role === "pre-check").sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))[0]?.runtime?.provider : undefined;
  const tone = latestRunNeedsAction || pre?.outcome === "fail" ? "needs" : "normal";

  return (
    <aside ref={asideRef} tabIndex={-1} className="bd-drawer bd-cockpit" aria-label={`Review ${packageId}`}>
      <div className="bd-drawer-head">
        <div className="bd-drawer-id-row">
          <span className="mono small">
            {packageId}
            {pkg ? ` \u00b7 rev ${pkg.revision}` : ""}
          </span>
          {pkg && <span className="bd-chip">{STATUS_LABEL[pkg.status]}</span>}
        </div>
        {pkg && <h2 className="bd-drawer-title">{pkg.title}</h2>}
        <div className="bd-drawer-actions">
          <Link to="/packages/$id" params={{ id: packageId }} className="btn small">
            Full case {"\u2197"}
          </Link>
          <button type="button" className="btn small" onClick={onClose} aria-label="Close review drawer">
            Close
          </button>
          <kbd className="muted small" aria-hidden="true">
            Esc
          </kbd>
        </div>
      </div>

      {pkg ? (
        <div className="bd-cockpit-main">
          <div className="bd-strip-wrap">
            <InstrumentFrame label="Status" tone={tone}>
              <div className="bd-strip">
                <div className="bd-strip-cell" role="group" aria-label="Custody chain">
                  <span className="bd-strip-key">Custody</span>
                  <dl className="bd-custody">
                    <div>
                      <dt>{copy.custodyRoles[0]}</dt>
                      <dd>
                        {author && <AgentBadge runtime={author} />}
                        {pkg.agent_assignment[0]?.agent_baseline ?? "Unassigned"}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.custodyRoles[1]}</dt>
                      <dd>
                        {checker && <AgentBadge runtime={checker} />}
                        {needsIndependentCheck(pkg) ? "Independent required" : "Standard check"}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.custodyRoles[2]}</dt>
                      <dd>Passkey sign-off</dd>
                    </div>
                  </dl>
                </div>
                <div className="bd-strip-cell">
                  <span className="bd-strip-key">Criteria</span>
                  <button type="button" className="bd-strip-btn" aria-expanded={detail === "criteria"} aria-controls="bd-detail" onClick={() => toggle("criteria")}>
                    <span className="mono">{pkg.acceptance_criteria.length}</span> {pkg.acceptance_criteria.length === 1 ? "criterion" : "criteria"}
                  </button>
                  <button type="button" className="bd-strip-btn" aria-expanded={detail === "scope"} aria-controls="bd-detail" onClick={() => toggle("scope")}>
                    {mode === "capital-projects" ? "Design basis" : "Scope"}
                    <span className="mono"> {(pkg.assumptions ?? []).length}</span>
                  </button>
                </div>
                <div className="bd-strip-cell">
                  <span className="bd-strip-key">Pre-check</span>
                  {pre ? (
                    <button type="button" className="bd-strip-btn" aria-expanded={detail === "precheck"} aria-controls="bd-detail" onClick={() => toggle("precheck")}>
                      <span className={`tag outcome-${pre.outcome}`}>{pre.outcome}</span> <span className="mono">{pre.findings.length}</span>{" "}
                      {pre.findings.length === 1 ? "finding" : "findings"}
                    </button>
                  ) : (
                    <span className="small muted">Not run</span>
                  )}
                </div>
                <div className="bd-strip-cell bd-strip-switches">
                  <span className="bd-strip-key">Switches</span>
                  <ContextSwitch pkg={pkg} view={view} projectDefault={projectContextDefault(admin.data?.projects, pkg.project)} />
                  <WorkflowSwitch pkg={pkg} view={view} projectDefault={projectWorkflowDefault(admin.data?.projects, pkg.project)} />
                </div>
                <div className="bd-strip-cell bd-strip-tags">
                  {pkg.project && <span className="bd-chip">{projectDisplayName(pkg.project, projects)}</span>}
                  <span className="bd-chip">{pkg.grade ?? "general-service"}</span>
                  <span className="bd-chip">Lane: {view?.effective_lane ?? pkg.data_lane}</span>
                  {pkg.discipline && <span className="bd-chip">{pkg.discipline}</span>}
                </div>
              </div>
            </InstrumentFrame>
            {detail && (
              <section id="bd-detail" className="bd-detail" aria-label="Details">
                {detail === "criteria" &&
                  (pkg.acceptance_criteria.length > 0 ? (
                    <ol className="bd-drawer-list">
                      {pkg.acceptance_criteria.map((c, idx) => (
                        <li key={idx} className="small">
                          {c}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="small muted">No acceptance criteria recorded yet.</p>
                  ))}
                {detail === "scope" && (
                  <>
                    {pkg.objective && <p className="small">{pkg.objective}</p>}
                    {(pkg.assumptions ?? []).length > 0 ? (
                      <ul className="bd-drawer-list">
                        {(pkg.assumptions ?? []).map((a) => (
                          <li key={a.id} className="small">
                            <span className="mono">{a.id}</span> {"\u00b7"} {a.statement}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="small muted">No assumptions recorded yet.</p>
                    )}
                    {(pkg.depends_on ?? []).length > 0 && (
                      <>
                        <h3>Depends on</h3>
                        <ul className="bd-drawer-list">
                          {(pkg.depends_on ?? []).map((dep) => (
                            <li key={dep.package_id} className="small">
                              <span className="mono">{dep.package_id}</span>
                              {dep.reason ? ` \u00b7 ${dep.reason}` : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
                {detail === "precheck" && pre && (
                  <>
                    <p className="small" style={{ margin: "0 0 6px" }}>
                      <span className={`tag outcome-${pre.outcome}`}>{pre.outcome}</span>{" "}
                      <span className="muted">
                        by {pre.verifier} {"\u00b7"} {pre.method}
                      </span>
                    </p>
                    <ScopeDriftNote drift={view?.scope_drift} />
                    {pre.findings.length > 0 ? (
                      <ul className="bd-drawer-list">
                        {pre.findings.map((f) => (
                          <li key={f.id} className="small">
                            <span className={`tag sev-${f.severity}`}>{f.severity}</span> <span className="mono">{f.id}</span> {f.text}
                            <FindingDetail finding={f} />
                            {f.resolution !== undefined && <span className="muted"> {"\u00b7"} Resolution: {f.resolution}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="small muted">No findings.</p>
                    )}
                  </>
                )}
              </section>
            )}
          </div>

          <div className="bd-panes">
            <section className="bd-pane bd-pane-log" aria-labelledby="bd-log-title">
              <h3 id="bd-log-title" className="bd-pane-title">
                Run log <span className="mono">({sortedRuns.length})</span>
                {latestRunNeedsAction && (
                  <span className="bd-drawer-tab-alert" title="Action required on latest run">
                    <span aria-hidden="true"> {"\u25b2"}</span>
                    <span className="sr-only"> (action required)</span>
                  </span>
                )}
              </h3>
              <div className="bd-pane-body">
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
              </div>
            </section>

            <section className="bd-pane bd-pane-out" aria-labelledby="bd-out-title">
              <h3 id="bd-out-title" className="bd-pane-title">
                Outputs <span className="mono">({view?.outputs.length ?? 0}/{pkg.deliverables.length})</span>
              </h3>
              <div className="bd-pane-body">
                <DrawerOutputs packageId={packageId} outputs={view?.outputs ?? []} loading={q.isLoading} />
                {pkg.deliverables.length > 0 && (
                  <p className="small muted bd-requested">
                    Requested:{" "}
                    {pkg.deliverables.map((d, i) => (
                      <span key={d.id}>
                        {i > 0 ? ", " : ""}
                        <span className="mono">{d.id}</span> {d.type}
                        {d.format && d.format.length > 0 ? ` (${d.format.join(", ")})` : ""}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="bd-cockpit-main">{q.isLoading ? <p className="muted bd-pad">Loading package details…</p> : null}</div>
      )}

      {q.isError && (
        <div role="alert" className="error bd-pad">
          <p>{explain(q.error, "Could not load full package evidence.")}</p>
          <button type="button" className="btn small" onClick={() => void q.refetch()}>
            Retry
          </button>
        </div>
      )}

      {view && (
        <div className="bd-drawer-foot">
          <DecisionBar key={packageId} view={view} />
        </div>
      )}
    </aside>
  );
}
