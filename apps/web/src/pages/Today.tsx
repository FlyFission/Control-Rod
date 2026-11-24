import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import { ActiveRunList } from "../components/ActiveRuns.js";
import { STATUS_LABEL } from "../lib/format.js";

/**
 * Today (Wave 3): unified attention view highlighting packages waiting for human
 * decisions (`draft` and `in-verification`) and recorded active runs.
 */
export function Today() {
  const packagesQuery = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.packages(),
  });
  const packages = packagesQuery.data;
  const awaitingHuman =
    packages?.filter((p) => p.status === "in-verification" || p.status === "draft") ?? [];

  return (
    <div className="place">
      <header className="place-head">
        <h1>Today</h1>
        <p className="muted">
          Review work awaiting a decision and see which agent runs are active.
        </p>
      </header>

      {packagesQuery.isLoading && <p className="muted">Loading</p>}
      {packagesQuery.isError && (
        <div role="alert" className="panel error" style={{ marginBottom: "1rem" }}>
          <p>
            {packages === undefined
              ? explain(packagesQuery.error, "The packages could not be loaded.")
              : "The packages could not be refreshed; this view may be out of date."}
          </p>
          <button type="button" className="btn small" onClick={() => void packagesQuery.refetch()}>
            Try again
          </button>
        </div>
      )}

      <div className="today-grid">
        {packages !== undefined && (
          <section className="panel">
            <h2>Needs Your Decision ({awaitingHuman.length})</h2>
            <p className="muted small">Drafts and in-verification packages.</p>
            {awaitingHuman.length === 0 ? (
              <p className="muted">Nothing awaiting a decision right now.</p>
            ) : (
              <ul className="today-list">
                {awaitingHuman.map((p) => (
                  <li key={p.id} className="today-row">
                    <Link to="/packages/$id" params={{ id: p.id }} className="today-link">
                      {p.title || p.id}
                    </Link>
                    <span className="pill">{STATUS_LABEL[p.status] ?? p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section className="panel" aria-label="Active runs">
          <ActiveRunList />
        </section>
      </div>
    </div>
  );
}
