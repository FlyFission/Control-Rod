import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { BudgetStatus, UsageView } from "../api/types.js";
import { AgentList, type SeatUsage } from "../components/AgentList.js";
import { InstrumentFrame } from "../design/instruments/InstrumentFrame.js";
import { CHECK_IN_CHOICES, readBack } from "../lib/agents.js";
import type { Passkeys } from "../lib/decide.js";
import { useAgents } from "../lib/useAgents.js";
import { RosterDetails } from "./Roster.js";
import { ProviderDetails } from "./Subscriptions.js";
import "./screens.css";

/**
 * Agents roster: who sits at the table, one switch each, saved as soon as it changes. The status beside
 * each agent comes from the same probes as Provider CLIs, so the two never disagree. Versions, pins,
 * sandbox and per-CLI probe details sit under Advanced.
 */
export function AgentsRoster({ passkeys }: { passkeys?: Passkeys } = {}) {
  const agents = useAgents();
  // Runs this window per runtime. Budgets are keyed to an agent baseline, not a runtime, so a seat shows
  // runs only; the organization's remaining budget shows once, above the seats.
  const usage = useQuery({ queryKey: ["usage"], queryFn: api.usage });
  const seatUsage = seatUsageOf(usage.data, usage.isError);
  const hash = useRouterState({ select: (st) => st.location.hash });
  const advancedRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const clean = hash.replace(/^#/, "");
    if (clean === "advanced" || clean === "roster") {
      if (advancedRef.current) {
        advancedRef.current.open = true;
        advancedRef.current.scrollIntoView?.({ block: "nearest" });
      }
    }
  }, [hash]);
  const checkIn = CHECK_IN_CHOICES.find((c) => c.id === (agents.setup?.check_in ?? "start-and-merge"))!;
  return (
    <div className="place">
      <header className="place-head">
        <h1>Agents roster</h1>
        <p className="muted">Who sits at the table. Bench an agent and no new work goes to it; work it already started finishes.</p>
      </header>
      {agents.setup && !agents.setup.confirmed && (
        <p className="panel notice small">
          You haven't finished setup yet. <Link to="/setup">Finish setup</Link>
        </p>
      )}
      <section className="seat-panel" aria-labelledby="roster-agents-title">
        <div className="panel-head">
          <h2 id="roster-agents-title">At the table</h2>
          <button type="button" className="btn small" onClick={agents.refetch}>
            Check again
          </button>
        </div>
        {agents.loading && <p className="muted">Loading</p>}
        {agents.error && (
          <div role="alert" className="error">
            <p>The agent checks could not be loaded.</p>
            <button type="button" className="btn small" onClick={agents.refetch}>
              Try again
            </button>
          </div>
        )}
        {!agents.loading && <OrgBudget view={usage.data} failed={usage.isError} />}
        {!agents.loading && (
          <InstrumentFrame label="Council table">
            <AgentList
              rows={agents.rows}
              usage={seatUsage}
              // A switch changes that one seat only, and only once the saved seats are known.
              busy={agents.seat.isPending || agents.setup === undefined}
              onToggle={(id, seated) => agents.seat.mutate({ runtime: id, seated })}
            />
          </InstrumentFrame>
        )}
        {agents.seat.error && (
          <p role="alert" className="error">
            {agents.seat.error.message}
          </p>
        )}
        {!agents.loading && (
          <p className="readback-line" aria-live="polite">
            {readBack(agents.rows)} Check-in preference: {checkIn.label.toLowerCase()}
            {checkIn.today ? "." : " (saved; today every card still stops for your signed release and your signed acceptance)."} <Link to="/setup">Change</Link>
          </p>
        )}
      </section>
      <details ref={advancedRef} id="advanced" className="advanced">
        <summary>Advanced: versions, pins, sandbox and probe details</summary>
        <RosterDetails {...(passkeys ? { passkeys } : {})} />
        <ProviderDetails />
      </details>
    </div>
  );
}

/** Telemetry joined by runtime name; "unavailable" when /usage failed and nothing older is held. */
export function seatUsageOf(view: UsageView | undefined, failed: boolean): SeatUsage | "unavailable" | undefined {
  if (view === undefined) return failed ? "unavailable" : undefined;
  const out: SeatUsage = {};
  for (const t of view.telemetry) {
    const prior = out[t.runtime];
    out[t.runtime] = { runs: (prior?.runs ?? 0) + t.runs, reported: (prior?.reported ?? 0) + t.reported };
  }
  return out;
}

const PERIOD_WORDS: Record<string, string> = { P1D: "day", P1W: "week", P1M: "month", P1Y: "year" };
const UNIT_SHORT: Record<string, string> = { minute: "min of run time", token: "tokens", USD: "USD" };

/**
 * The organization's remaining budget, once. The tightest organization budget (most used) is read:
 * remaining is its limit less what is used this window, and a budget whose unit no runtime reports
 * says so instead of showing a number.
 */
export function OrgBudget({ view, failed }: { view: UsageView | undefined; failed: boolean }) {
  if (view === undefined) return failed ? <p className="small muted org-budget">Budget not available.</p> : null;
  const org = view.budgets.filter((b) => b.budget.scope === "organization");
  if (org.length === 0) return <p className="small muted org-budget">No organization budget is set.</p>;
  const share = (b: BudgetStatus) => (b.used === null ? -1 : b.used / Math.max(Number(b.budget.limit.value), Number.MIN_VALUE));
  const b = [...org].sort((x, y) => share(y) - share(x))[0]!;
  const limit = Number(b.budget.limit.value);
  const unit = UNIT_SHORT[b.budget.limit.unit] ?? b.budget.limit.unit;
  const period = PERIOD_WORDS[b.budget.period] ?? b.budget.period;
  const left = b.used === null ? null : Math.max(0, limit - b.used);
  const tone = b.state === "over" ? "trip" : b.state === "near" ? "needs" : undefined;
  return (
    <InstrumentFrame label="Organization budget" tone={tone === "trip" ? "trip" : tone === "needs" ? "needs" : "normal"}>
      <div className="org-budget-readout">
        <p className="org-budget-value mono" data-tone={tone}>
          {left === null ? "Not reported" : `${Number.isInteger(left) ? left : left.toFixed(2)} ${unit} left`}
        </p>
        <p className="small muted">
          {left === null ? `No runtime here reports ${unit}.` : `${b.unreported_runs > 0 ? "At least " : ""}${(b.used ?? 0).toFixed(2)} of ${limit} used this ${period}.`}
          {b.state === "over" && " Over its limit."}
          {b.state === "near" && " Near its limit."}
        </p>
      </div>
    </InstrumentFrame>
  );
}
