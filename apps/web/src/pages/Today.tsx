import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";

/**
 * Today (Wave 3): unified attention view highlighting packages waiting for human
 * Verdict / Clearance, active runs, and governed outfall readiness.
 */
export function Today() {
  const packagesQuery = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.packages(),
  });
  const packages = packagesQuery.data ?? [];
  const awaitingHuman = packages.filter(
    (p) => p.status === "in-verification" || p.status === "accepted" || p.status === "draft",
  );
  const activeWork = packages.filter(
    (p) => p.status === "released" || p.status === "in-work",
  );

  return (
    <div className="place">
      <header className="place-head">
        <h1>Today</h1>
        <p className="muted">
          Items requiring your attention across Software and Capital Projects workstreams.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <section className="panel">
          <h2>Needs Your Decision ({awaitingHuman.length})</h2>
          {awaitingHuman.length === 0 ? (
            <p className="muted">Nothing awaiting Verdict or Clearance right now.</p>
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
    </div>
  );
}
