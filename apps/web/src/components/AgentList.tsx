import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { AgentRow } from "../lib/agents.js";
import { agentIdForProvider } from "../lib/agents.js";
import { useInstrumentMotion } from "../design/instruments/useInstrumentMotion.js";
import { AgentBadge } from "./AgentBadge.js";
import { StateMark } from "./StateMark.js";
import "./agents.css";

/** Runs this window for one runtime (GET /usage telemetry), joined to the seat by provider name. */
export type SeatUsage = Record<string, { runs: number; reported: number }>;

/**
 * The council as seats at a table. Each agent has a seat: its icon on a lamp (lit when it is ready),
 * its name, a one-line status in plain words, and one switch for whether it sits at the table. The
 * switch is the person's choice; the status is what this computer reports. With `usage`, a seat also
 * reads the runs this window for its runtime. Agents that are not found or not supported yet sit
 * under "Add an agent" so the main table stays short. In setup (`lightUp`), a seat lights up as it
 * is found, once, unless motion is off.
 */
export function AgentList({
  rows,
  onToggle,
  busy = false,
  usage,
  lightUp = false,
}: {
  rows: AgentRow[];
  onToggle: (id: AgentRow["info"]["id"], seated: boolean) => void;
  busy?: boolean;
  /** Per runtime runs this window; "unavailable" when the read failed; left out where usage is not shown. */
  usage?: SeatUsage | "unavailable" | undefined;
  lightUp?: boolean;
}) {
  const motion = useInstrumentMotion();
  const main = rows.filter((r) => r.state !== "not-yet" && r.state !== "not-found");
  const more = rows.filter((r) => r.state === "not-yet" || r.state === "not-found");
  const seatProps = { onToggle, busy, usage, lightUp: lightUp && motion === "full" };
  return (
    <>
      {main.length === 0 ? (
        <p className="muted">No agent was found on this computer yet. Add one below.</p>
      ) : (
        <ul className="agent-list seat-table">
          {main.map((r, i) => (
            <AgentItem key={r.info.id} row={r} index={i} {...seatProps} />
          ))}
        </ul>
      )}
      {more.length > 0 && (
        <details className="agent-more">
          <summary>Add an agent</summary>
          <ul className="agent-list seat-table">
            {more.map((r, i) => (
              <AgentItem key={r.info.id} row={r} index={i} {...seatProps} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function mark(state: AgentRow["state"]) {
  if (state === "ready") return "done" as const;
  if (state === "not-yet" || state === "not-checked" || state === "not-found") return "idle" as const;
  return "needs" as const;
}

const LAMP_WORD: Record<AgentRow["state"], string> = {
  ready: "Ready",
  "not-checked": "Not checked",
  "not-found": "Not found",
  "signed-out": "Signed out",
  held: "Held",
  "not-yet": "Coming later",
};

function usageWords(usage: SeatUsage | "unavailable" | undefined, id: string): { text: string; known: boolean } | null {
  if (usage === undefined) return null;
  if (usage === "unavailable") return { text: "Runs not available", known: false };
  const mine = Object.entries(usage).filter(([provider]) => agentIdForProvider(provider) === id);
  const runs = mine.reduce((n, [, u]) => n + u.runs, 0);
  return { text: runs === 0 ? "No runs this window" : `${runs} ${runs === 1 ? "run" : "runs"} this window`, known: true };
}

/** Seats that have already lit up this session: the animation plays once per seat, not on every return to Setup. */
const litSeats = new Set<string>();
/** For tests: forget which seats have lit, as a new session would. */
export function resetLitSeats() {
  litSeats.clear();
}

function AgentItem({
  row,
  index,
  onToggle,
  busy,
  usage,
  lightUp,
}: {
  row: AgentRow;
  index: number;
  onToggle: (id: AgentRow["info"]["id"], seated: boolean) => void;
  busy: boolean;
  usage: SeatUsage | "unavailable" | undefined;
  lightUp: boolean;
}) {
  const id = `agent-${row.info.id}`;
  const canSeat = row.info.runnable;
  const runs = usageWords(usage, row.info.id);
  // This mount plays the seat-on animation only if the seat has not lit before; once it started it keeps its attribute.
  const playing = useRef(false);
  if (lightUp && !playing.current && !litSeats.has(row.info.id)) playing.current = true;
  useEffect(() => {
    if (playing.current) litSeats.add(row.info.id);
  }, [row.info.id, lightUp]);
  const light = lightUp && playing.current;
  return (
    <li
      className="agent-row seat"
      data-state={row.state}
      data-seated={canSeat ? row.seated : undefined}
      data-light={light ? "" : undefined}
      style={{ "--seat-i": index } as CSSProperties}
    >
      <div className="seat-head">
        <span className="seat-lamp" aria-hidden="true">
          <AgentBadge runtime={row.info.id} size={32} />
        </span>
        <div className="agent-name seat-name">
          <strong id={`${id}-name`}>{row.info.name}</strong>
          <span className="muted small">{row.info.vendor}</span>
        </div>
        <span className="seat-state small" data-state={row.state}>
          <StateMark kind={mark(row.state)} />
          {LAMP_WORD[row.state]}
        </span>
      </div>
      <div className="agent-main">
        {row.version && <p className="small muted mono seat-version">{row.version}</p>}
        <p className="agent-status small" id={`${id}-status`}>
          {row.status}
        </p>
        {row.fix && <FixCommand command={row.fix} label={row.state === "signed-out" ? "To sign in, run" : "To install, run"} />}
      </div>
      <div className="seat-foot">
        {runs !== null && (
          <p className="seat-runs small mono" data-known={runs.known}>
            {runs.text}
          </p>
        )}
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
      </div>
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
