import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Metrics, UsageView } from "../api/types.js";
import { time } from "../lib/format.js";

/**
 * Usage (specification 12 and 26; plan task 5.2): whether the work is earning its place; every budget
 * and what it has used this window; and the usage ledger, with telemetry a runtime does not report
 * stated as missing, never as zero.
 */
export function Usage() {
  return (
    <div className="place">
      <header className="place-head">
        <h1>Usage</h1>
        <p className="muted">Whether agents are earning their place: acceptance, findings caught before review, and time to done.</p>
      </header>
      <MetricsPanel />
      <Budgets />
      <Ledger />
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

const UNIT_WORDS: Record<string, string> = { minute: "minutes of run time", token: "tokens", USD: "USD" };
const MODE_WORDS: Record<string, string> = { track: "Track", alert: "Alert", "hard-cap": "Hard cap" };
const SCOPE_WORDS = (scope: string, id: string) => (scope === "organization" ? "The organization" : scope === "project" ? `Project ${id}` : `Agent ${id}`);

function Budgets() {
  const q = useQuery({ queryKey: ["usage"], queryFn: api.usage });
  const v: UsageView | undefined = q.data;
  return (
    <section className="panel" aria-labelledby="budgets-title">
      <h2 id="budgets-title">Budgets</h2>
      <p className="muted small">
        A hard cap can only be set on minutes of run time: each run reserves its time ceiling before it starts, and settles at what it measured when it finishes. A
        run that is lost, or whose outcome is unknown, stays charged in full until it is reconciled. Tokens and money can be tracked or alerted on.
      </p>
      {q.isError && (
        <p className="error" role="alert">
          Budgets could not be loaded.
        </p>
      )}
      {v && v.near_share === null && v.budgets.length > 0 && (
        <p className="muted small">No budget is called near its limit: the approved policy does not set the line (budget_near_percent).</p>
      )}
      {v && v.budgets.length === 0 && <p className="muted">No budget is set. Set one under Policies with policy authority.</p>}
      {v && v.budgets.length > 0 && (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Budget</th>
                <th scope="col">Applies to</th>
                <th scope="col">Mode</th>
                <th scope="col">Used this window</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {v.budgets.map((b) => {
                const unit = UNIT_WORDS[b.budget.limit.unit] ?? b.budget.limit.unit;
                return (
                  <tr key={b.budget.id}>
                    <td className="mono small">{b.budget.id}</td>
                    <td className="small">{SCOPE_WORDS(b.budget.scope, b.budget.scope_id)}</td>
                    <td className="small">{MODE_WORDS[b.budget.mode] ?? b.budget.mode}</td>
                    <td className="small">
                      {b.used === null ? (
                        <>Not reported: no runtime here reports {unit}</>
                      ) : (
                        <>
                          {b.state === "partial" ? "At least " : ""}
                          {b.used.toFixed(2)} of {b.budget.limit.value} {unit} in {b.budget.period}
                          {b.unreported_runs > 0 && <p className="muted">{b.unreported_runs} finished runs reported none, so the total is not known</p>}
                          {b.in_flight > 0 && <p className="muted">including {b.in_flight.toFixed(2)} held for runs not yet settled</p>}
                        </>
                      )}
                      <p className="muted">since {time(b.since)}</p>
                    </td>
                    <td className={b.state === "over" ? "small error" : "small"}>
                      {b.state === "over"
                        ? "Over its limit"
                        : b.state === "near"
                          ? `Near its limit (${Math.round((v.near_share ?? 0) * 100)}% or more used)`
                          : b.state === "within"
                            ? "Within its limit"
                            : b.state === "partial"
                              ? "Not fully reported"
                              : "Use not known"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Ledger() {
  const q = useQuery({ queryKey: ["usage"], queryFn: api.usage });
  const v: UsageView | undefined = q.data;
  if (!v) return null;
  return (
    <section className="panel" aria-labelledby="ledger-title">
      <h2 id="ledger-title">Usage ledger</h2>
      {v.telemetry.length > 0 && (
        <ul className="small">
          {v.telemetry.map((t) => (
            <li key={t.runtime}>
              <span className="mono">{t.runtime}</span>:{" "}
              {t.reported === 0
                ? `none of its ${t.runs} finished runs reported tokens, so its token use is not known`
                : `${t.reported} of its ${t.runs} finished runs reported tokens`}
            </li>
          ))}
        </ul>
      )}
      {v.records.length === 0 ? (
        <p className="muted">No run has settled yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">Package</th>
                <th scope="col">Runtime</th>
                <th scope="col">Recorded</th>
                <th scope="col">Use</th>
              </tr>
            </thead>
            <tbody>
              {v.records.map((r) => (
                <tr key={r.id}>
                  <td className="mono small">{r.run_id}</td>
                  <td className="small">
                    {r.package_id} <span className="muted">({r.role})</span>
                  </td>
                  <td className="small">{r.runtime ?? "unknown"}</td>
                  <td className="small">{time(r.recorded_at)}</td>
                  <td className="small">
                    {r.source === "measured"
                      ? `${r.wall_time?.value ?? "?"} minutes of run time, measured`
                      : `${r.input_tokens?.value ?? "?"} tokens in, ${r.output_tokens?.value ?? "?"} out, as the runtime reported`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
