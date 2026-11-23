import { Link } from "@tanstack/react-router";
import { AgentList } from "../components/AgentList.js";
import { CHECK_IN_CHOICES, readBack } from "../lib/agents.js";
import type { Passkeys } from "../lib/decide.js";
import { useAgents } from "../lib/useAgents.js";
import { RosterDetails } from "./Roster.js";
import { ProviderDetails } from "./Subscriptions.js";

/**
 * Agents roster: who sits at the table, one switch each, saved as soon as it changes. The status beside
 * each agent comes from the same probes as Provider CLIs, so the two never disagree. Versions, pins,
 * sandbox and per-CLI probe details sit under Advanced.
 */
export function AgentsRoster({ passkeys }: { passkeys?: Passkeys } = {}) {
  const agents = useAgents();
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
      <section className="panel" aria-labelledby="roster-agents-title">
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
        {!agents.loading && (
          <AgentList
            rows={agents.rows}
            // A switch changes that one seat only, and only once the saved seats are known.
            busy={agents.seat.isPending || agents.setup === undefined}
            onToggle={(id, seated) => agents.seat.mutate({ runtime: id, seated })}
          />
        )}
        {agents.seat.error && (
          <p role="alert" className="error">
            {agents.seat.error.message}
          </p>
        )}
        {!agents.loading && (
          <p className="readback-line" aria-live="polite">
            {readBack(agents.rows)} Check-in preference: {checkIn.label.toLowerCase()}
            {checkIn.today ? "." : " (saved; today every card still stops at the start and before merge)."} <Link to="/setup">Change</Link>
          </p>
        )}
      </section>
      <details className="advanced">
        <summary>Advanced: versions, pins, sandbox and probe details</summary>
        <RosterDetails {...(passkeys ? { passkeys } : {})} />
        <ProviderDetails />
      </details>
    </div>
  );
}
