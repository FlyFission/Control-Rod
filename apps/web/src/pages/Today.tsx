import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";

/**
 * Today (Wave 3): unified attention view highlighting packages waiting for human
 * decisions (`draft` and `in-verification`) and packages in active execution.
 */
export function Today() {
  const packagesQuery = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.packages(),
  });
  const packages = packagesQuery.data;
  const awaitingHuman =
    packages?.filter((p) => p.status === "in-verification" || p.status === "draft") ?? [];
  const activeWork =
    packages?.filter((p) => p.status === "released" || p.status === "in-work") ?? [];

  return (
    <div className="place">
      <header className="place-head">
        <h1>Today</h1>
        <p className="muted">
          Items requiring your attention across Software and Capital Projects workstreams.
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

      {packages !== undefined && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <section className="panel">
            <h2>Needs Your Decision ({awaitingHuman.length})</h2>
            {awaitingHuman.length === 0 ? (
              <p className="muted">Nothing awaiting a decision right now.</p>
            ) : (
              <ul style={{ paddingLeft: "1.2rem" }}>
                {awaitingHuman.map((p) => (
                  <li key={p.id}>
                    <Link to="/packages/$id" params={{ id: p.id }}>
                      {p.title || p.id}
                    </Link>{" "}
                    <span className="pill">{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Active Execution ({activeWork.length})</h2>
            {activeWork.length === 0 ? (
              <p className="muted">No active author or intake runs.</p>
            ) : (
              <ul style={{ paddingLeft: "1.2rem" }}>
                {activeWork.map((p) => (
                  <li key={p.id}>
                    <Link to="/packages/$id" params={{ id: p.id }}>
                      {p.title || p.id}
                    </Link>{" "}
                    <span className="pill">{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
