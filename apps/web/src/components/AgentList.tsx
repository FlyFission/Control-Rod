import { useState } from "react";
import type { AgentRow } from "../lib/agents.js";
import { StateMark } from "./StateMark.js";
import "./agents.css";

/**
 * One row per agent: its name, a one-line status in plain words, and one switch for whether it sits at
 * the table. The switch is the person's choice; the status is what this computer reports. Agents that
 * are not found or not supported yet sit under "Add an agent" so the main list stays short.
 */
export function AgentList({
  rows,
  onToggle,
  busy = false,
}: {
  rows: AgentRow[];
  onToggle: (id: AgentRow["info"]["id"], seated: boolean) => void;
  busy?: boolean;
}) {
  const main = rows.filter((r) => r.state !== "not-yet" && r.state !== "not-found");
  const more = rows.filter((r) => r.state === "not-yet" || r.state === "not-found");
  return (
    <>
      {main.length === 0 ? (
        <p className="muted">No agent was found on this computer yet. Add one below.</p>
      ) : (
        <ul className="agent-list">
          {main.map((r) => (
            <AgentItem key={r.info.id} row={r} onToggle={onToggle} busy={busy} />
          ))}
        </ul>
      )}
      {more.length > 0 && (
        <details className="agent-more">
          <summary>Add an agent</summary>
          <ul className="agent-list">
            {more.map((r) => (
              <AgentItem key={r.info.id} row={r} onToggle={onToggle} busy={busy} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function mark(state: AgentRow["state"]) {
  if (state === "ready") return "done" as const;
  if (state === "not-yet" || state === "not-checked") return "idle" as const;
  if (state === "not-found") return "idle" as const;
  return "needs" as const;
}

function AgentItem({ row, onToggle, busy }: { row: AgentRow; onToggle: (id: AgentRow["info"]["id"], seated: boolean) => void; busy: boolean }) {
  const id = `agent-${row.info.id}`;
  const canSeat = row.info.runnable;
  return (
    <li className="agent-row" data-state={row.state}>
      <div className="agent-main">
        <div className="agent-name">
          <StateMark kind={mark(row.state)} />
          <strong id={`${id}-name`}>{row.info.name}</strong>
          <span className="muted small">{row.info.vendor}</span>
          {row.version && <span className="muted small mono">{row.version}</span>}
        </div>
        <p className="agent-status small" id={`${id}-status`}>
          {row.status}
        </p>
        {row.fix && <FixCommand command={row.fix} label={row.state === "signed-out" ? "To sign in, run" : "To install, run"} />}
      </div>
      {canSeat ? (
        <button
          type="button"
          role="switch"
          className="seat-switch"
          aria-checked={row.seated}
          aria-labelledby={`${id}-name`}
          aria-describedby={`${id}-status`}
          disabled={busy}
          onClick={() => onToggle(row.info.id, !row.seated)}
        >
          <span className="seat-track" aria-hidden="true">
            <span className="seat-knob" />
          </span>
          <span className="seat-word">{row.seated ? "At the table" : "Benched"}</span>
        </button>
      ) : (
        <span className="tag">Coming later</span>
      )}
    </li>
  );
}

function FixCommand({ command, label }: { command: string; label: string }) {
  const [result, setResult] = useState<"" | "copied" | "failed">("");
  const copy = () => {
    const done = navigator.clipboard?.writeText(command);
    if (!done) return setResult("failed");
    done.then(
      () => setResult("copied"),
      () => setResult("failed"),
    );
  };
  return (
    <p className="agent-fix small">
      <span className="muted">{label} </span>
      <code className="mono">{command}</code>{" "}
      <button type="button" className="btn small" aria-label={`Copy ${command}`} onClick={copy}>
        Copy
      </button>
      <span className="muted"> in a terminal. Control Rod checks again within a few minutes.</span>{" "}
      <span role="status" className={result === "failed" ? "error" : "muted"}>
        {result === "copied" ? "Copied." : result === "failed" ? "Couldn't copy here. Select the command and copy it by hand." : ""}
      </span>
    </p>
  );
}
