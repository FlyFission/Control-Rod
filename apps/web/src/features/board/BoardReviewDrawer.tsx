import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import type { WorkPackage } from "../../api/types.js";
import { AgentPanel } from "../../components/AgentPanel.js";
import { DecisionBar } from "../../components/DecisionBar.js";
import { needsIndependentCheck } from "../../lib/board.js";
import { shortDigest, STATUS_LABEL } from "../../lib/format.js";
import { MODE_COPY, type EngineeringMode } from "../../lib/mode.js";

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
  const copy = MODE_COPY[mode];
  const q = useQuery({
    queryKey: ["package", packageId],
    queryFn: () => api.packageView(packageId),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const view = q.data;
  const pkg = view?.package ?? initialPkg;

  return (
    <aside className="bd-drawer" aria-label={`Review ${packageId}`}>
      <div className="bd-drawer-head">
        <div className="bd-drawer-id-row">
          <span className="mono small">
            {packageId}
            {pkg ? ` · rev ${pkg.revision}` : ""}
          </span>
          {pkg && <span className="bd-chip">{STATUS_LABEL[pkg.status]}</span>}
        </div>
        <div className="bd-drawer-actions">
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
        {pkg ? (
          <>
            <h2 className="bd-drawer-title">{pkg.title}</h2>
            <div className="bd-drawer-tags">
              <span className="bd-chip">{pkg.project}</span>
              <span className="bd-chip">{pkg.grade ?? "general-service"}</span>
              <span className="bd-chip">Lane: {view?.effective_lane ?? pkg.data_lane}</span>
              {pkg.discipline && <span className="bd-chip">{pkg.discipline}</span>}
            </div>

            {view && view.runs.length > 0 && (
              <section className="bd-drawer-sec">
                <h3>Agent</h3>
                <AgentPanel packageId={packageId} />
              </section>
            )}

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
              <h3>Deliverables ({pkg.deliverables.length})</h3>
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

            {view && (
              <section className="bd-drawer-sec">
                <h3>Subject Digest</h3>
                <p className="mono small muted">{shortDigest(view.subject_digest)}</p>
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
          <DecisionBar key={packageId} view={view} />
        </div>
      )}
    </aside>
  );
}
