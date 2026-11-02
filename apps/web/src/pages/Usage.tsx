import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Metrics } from "../api/types.js";

/** Usage (specification 12): whether the work is earning its place. Spend and providers arrive with budgets (plan 5.2). */
export function Usage() {
  return (
    <div className="place">
      <header className="place-head">
        <h1>Usage</h1>
        <p className="muted">Whether agents are earning their place: acceptance, findings caught before review, and time to done.</p>
      </header>
      <MetricsPanel />
      <p className="muted small">Spend, context efficiency and providers appear here once budgets are recorded.</p>
    </div>
  );
}

function MetricsPanel() {
  const q = useQuery({ queryKey: ["metrics"], queryFn: api.metrics });
  const m: Metrics | undefined = q.data;
  const rows: [string, string][] =
    m === undefined
      ? []
      : [
          ["Packages accepted", String(m.packages_accepted)],
          ["Accepted on first pass", String(m.first_pass_accepted)],
          ["Findings caught before review", String(m.findings_caught_before_review)],
          ["Median review minutes", m.median_review_minutes ?? "none yet"],
          ["Median minutes to done", m.median_minutes_to_done ?? "none yet"],
          ["Quick answers", String(m.quick_answers)],
        ];
  return (
    <section className="panel" aria-labelledby="metrics-title">
      <h2 id="metrics-title">Is it earning its place?</h2>
      {m === undefined ? (
        <p className="muted">{q.isError ? "Metrics unavailable." : "Loading"}</p>
      ) : (
        <dl className="metrics">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
