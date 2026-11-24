import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { explain } from "../api/client.js";
import type { CheckIn } from "../api/types.js";
import { InstrumentFrame } from "../design/instruments/InstrumentFrame.js";
import { AgentList } from "../components/AgentList.js";
import { WorkflowDiagram } from "../components/WorkflowDiagram.js";
import { CHECK_IN_CHOICES, CHECK_IN_LATER, readBack } from "../lib/agents.js";
import { buildCouncilFlow } from "../lib/councilFlow.js";
import { SETUP_SKIPPED_KEY } from "../lib/firstRun.js";
import { writeSession } from "../lib/storage.js";
import { setupRequest, useAgents } from "../lib/useAgents.js";
import "./screens.css";

/**
 * First-run setup (docs/patterns/onboarding.md): state what was found, let the person confirm, bench
 * or add agents, ask one question, then read the result back. Nothing is saved until "Looks right".
 */
export function Setup() {
  const navigate = useNavigate();
  const agents = useAgents();
  // Only the switches the person flipped on this page. Saving sends just these, so a switch made
  // elsewhere since this page loaded is kept, not overwritten by a stale copy.
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const top = useRef<HTMLHeadingElement>(null);

  const chosenCheckIn: CheckIn = checkIn ?? agents.setup?.check_in ?? "start-and-merge";
  const rows = agents.rows.map((r) => (r.info.runnable ? { ...r, seated: changed[r.info.id] ?? r.seated } : r));
  const found = rows.filter((r) => r.info.runnable && r.state !== "not-found").length;
  const choice = CHECK_IN_CHOICES.find((c) => c.id === chosenCheckIn)!;

  const confirm = () =>
    agents.save.mutate(setupRequest(changed, checkIn), {
      onSuccess: () => void navigate({ to: "/" }),
    });

  return (
    <div className="place setup">
      <header className="place-head">
        <h1 ref={top} tabIndex={-1}>
          {agents.setup?.confirmed ? "Setup" : "Welcome. Let's set up Control Rod."}
        </h1>
        <p className="muted">Two quick checks: which agents sit at the table, and when we check with you. You can change both any time.</p>
      </header>

      <section className="seat-panel" aria-labelledby="setup-agents-title">
        <div className="panel-head">
          <h2 id="setup-agents-title">1. Agents on this computer</h2>
          <span className="found-count mono" role="status">
            {agents.loading ? "Looking" : `${found} found, ${rows.filter((r) => r.state === "ready").length} ready`}
          </span>
          <button type="button" className="btn small" onClick={agents.refetch}>
            Check again
          </button>
        </div>
        <p className="muted small">Here's what we found. Leave an agent at the table, bench it, or fix what's missing.</p>
        {agents.loading && <p className="muted">Looking for agents</p>}
        {agents.error && (
          <p role="alert" className="error">
            The agent checks could not be loaded. Is Control Rod still running?
          </p>
        )}
        {!agents.loading && (
          <InstrumentFrame label="Council table">
            <AgentList lightUp rows={rows} busy={agents.save.isPending} onToggle={(id, seated) => setChanged({ ...changed, [id]: seated })} />
          </InstrumentFrame>
        )}
      </section>

      <section className="panel" aria-labelledby="setup-checkin-title">
        <h2 id="setup-checkin-title">2. When should we check with you?</h2>
        <div className="checkin-choices" role="radiogroup" aria-labelledby="setup-checkin-title">
          {CHECK_IN_CHOICES.map((c) => (
            <label key={c.id} className={`checkin-choice${c.id === chosenCheckIn ? " chosen" : ""}`}>
              <input type="radio" name="check-in" value={c.id} checked={c.id === chosenCheckIn} disabled={agents.save.isPending} onChange={() => setCheckIn(c.id)} />
              <span>
                <strong>{c.label}</strong>
                {c.id === "start-and-merge" && <span className="tag">Recommended</span>}
                {!c.today && <span className="tag">Coming soon</span>}
                <span className="muted small block">{c.detail}</span>
              </span>
            </label>
          ))}
        </div>
        {!choice.today && <p className="muted small">{CHECK_IN_LATER}</p>}
      </section>

      <section className="panel readback" aria-labelledby="setup-readback-title" aria-live="polite">
        <h2 id="setup-readback-title">Here's what you're setting up</h2>
        <p>{readBack(rows)}</p>
        <p>
          Check-in preference: {choice.label.toLowerCase()}.
          {!choice.today && " Today every card still stops for your signed release at the start and your signed acceptance at the end."}
        </p>
        {!agents.loading && <WorkflowDiagram flow={buildCouncilFlow(rows, chosenCheckIn)} />}
        {agents.save.error && (
          <p role="alert" className="error">
            {explain(agents.save.error, "Could not save setup.")}
          </p>
        )}
        <div className="row setup-actions">
          <button type="button" className="btn primary" disabled={agents.loading || agents.error || agents.save.isPending} onClick={confirm}>
            Looks right
          </button>
          <button type="button" className="btn" onClick={() => top.current?.focus()}>
            Change
          </button>
          {!agents.setup?.confirmed && (
            <button
              type="button"
              className="btn link"
              onClick={() => {
                writeSession(SETUP_SKIPPED_KEY, "1");
                void navigate({ to: "/" });
              }}
            >
              Skip for now
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
