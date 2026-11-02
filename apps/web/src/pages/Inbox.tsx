import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { StateMark } from "../components/StateMark.js";
import { SinceLastLooked } from "../components/SinceLastLooked.js";
import { KIND_LABEL, age, sortOffice } from "../lib/office.js";

/** Inbox (specification 12): decisions waiting on you, and what changed since you last looked. */
export function Inbox() {
  const q = useQuery({ queryKey: ["office"], queryFn: api.office });
  const items = sortOffice(q.data ?? []);
  const rt = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const notReady = (rt.data?.runtimes ?? []).filter((r) => !r.ready);
  return (
    <div className="place inbox">
    <section className="panel office" aria-labelledby="office-title">
      <div className="panel-head">
        <h1 id="office-title">Inbox</h1>
        <span className="muted small">Holds on agents first, then disputes, work to accept and releases; oldest first.</span>
      </div>
      {notReady.length > 0 && (
        <ul className="runtime-alerts" aria-label="Runtimes not ready">
          {notReady.map((r) => (
            <li key={r.runtime} className="error">
              <strong>{r.runtime} is not ready and is not offered for work.</strong> {r.reason ?? "The daemon gave no reason."}
            </li>
          ))}
        </ul>
      )}
      {q.isLoading && <p className="muted">Loading</p>}
      {!q.isLoading && items.length === 0 && (
        <p className="muted">Nobody is waiting on you. Work that needs a decision comes in here.</p>
      )}
      <ol className="office-list">
        {items.map((o) => (
          <li key={`${o.kind}-${o.package_id}-${o.package_revision}`} className="office-item">
            <div className="office-meta">
              <StateMark kind="needs" />
              <span className="tag">{KIND_LABEL[o.kind]}</span>
              <span className="mono small muted">
                {o.package_id} rev {o.package_revision}
              </span>
              <span className="muted small">waiting {age(o.since)}</span>
            </div>
            <p className="office-title">{o.title}</p>
            <p className="muted">{o.detail}</p>
            <Link to="/packages/$id" params={{ id: o.package_id }} hash="decide" className="btn primary small">
              Open and decide
            </Link>
          </li>
        ))}
      </ol>
    </section>
    <SinceLastLooked />
    </div>
  );
}
