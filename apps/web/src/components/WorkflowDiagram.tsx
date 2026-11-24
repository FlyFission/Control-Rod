import "./workflow.css";
import { lazy, Suspense, useState } from "react";
import type { CouncilFlow, MatrixRow, Seat } from "../lib/councilFlow.js";
import { AgentMark } from "./AgentMark.js";
import { KeyGlyph, STOP_LABEL } from "./workflowParts.js";

/**
 * The person's workflow drawn as a block flow diagram (drawn with React Flow, MIT) or read as a
 * decision matrix. The matrix is the same content as a table, so it is also the screen-reader view.
 */

const FlowDiagram = lazy(() => import("./FlowCanvas.js"));

function Who({ who }: { who: MatrixRow["who"] }) {
  if (who === "you")
    return (
      <span className="wf-who wf-who-you">
        <KeyGlyph /> You
      </span>
    );
  if (who === "nobody") return <span className="wf-who muted">Nobody ready yet</span>;
  if (who === "control-rod") return <span className="wf-who wf-who-system">Control Rod</span>;
  return (
    <span className="wf-who">
      <AgentMark id={who.id} name={who.name} size={22} />
      {who.name}
    </span>
  );
}

export function DecisionMatrix({ flow }: { flow: CouncilFlow }) {
  return (
    <div className="wf-matrix-wrap" role="region" aria-label="Decision matrix, scrolls sideways on a narrow screen" tabIndex={0}>
      <table className="wf-matrix">
        <caption className="sr-only">Your workflow, step by step: who does each step, whether it stops for you, and what happens if it fails.</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Who</th>
            <th scope="col">What it does</th>
            <th scope="col">Stops for you</th>
            <th scope="col">If it fails</th>
          </tr>
        </thead>
        <tbody>
          {flow.matrix.map((r) => (
            <tr key={r.step}>
              <th scope="row">{r.step}</th>
              <td>
                <Who who={r.who} />
              </td>
              <td>{r.does}</td>
              <td>
                <span className={`wf-pill wf-pill-${r.stopsForYou}`}>{STOP_LABEL[r.stopsForYou]}</span>
              </td>
              <td>{r.ifItFails}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeatChip({ seat, role }: { seat: Seat; role: string }) {
  return (
    <li className={`wf-seat${seat.ready ? "" : " not-ready"}`}>
      <AgentMark id={seat.id} name={seat.name} size={28} />
      <span>
        <strong>{seat.name}</strong>
        <span className="wf-seat-role">{role}</span>
      </span>
    </li>
  );
}

/** Who sits where, in one line above the diagram. */
export function CouncilStrip({ flow }: { flow: CouncilFlow }) {
  const c = flow.council;
  const stand = c.fallbacks.filter((s) => s.id !== c.checker?.id);
  return (
    <ul className="wf-council" aria-label="At the table">
      {c.author && <SeatChip seat={c.author} role="Plans and writes" />}
      {c.checker && <SeatChip seat={c.checker} role="Checks blind" />}
      {stand.map((s) => (
        <SeatChip key={s.id} seat={s} role={s.ready ? "Stands in as author" : "Seated, not ready yet"} />
      ))}
      {c.benched.map((s) => (
        <SeatChip key={s.id} seat={{ ...s, ready: false }} role="Benched" />
      ))}
      {c.later.length > 0 && (
        <li className="wf-seat wf-later">
          <span className="wf-later-marks" aria-hidden="true">
            {c.later.map((s) => (
              <AgentMark key={s.id} id={s.id} name={s.name} size={20} />
            ))}
          </span>
          <span>
            <strong>{c.later.length} more</strong>
            <span className="wf-seat-role">Coming to the table</span>
          </span>
        </li>
      )}
    </ul>
  );
}

/** The flow as text, for everyone (keyboard, touch, screen readers): every step, who takes it, whether it stops, and where it can go next. */
function StepList({ flow }: { flow: CouncilFlow }) {
  const title = (id: string) => flow.steps.find((s) => s.id === id)?.title ?? id;
  return (
    <details className="wf-steps">
      <summary>Read the flow as steps</summary>
      <ol>
      {flow.steps.map((s) => {
        const next = flow.edges.filter((e) => e.from === s.id);
        return (
          <li key={s.id}>
            {s.title}
            {s.seat ? `, ${s.seat.name}` : s.kind === "agent" ? ", nobody ready yet" : ""}
            {s.stop ? `, ${STOP_LABEL[s.stop].toLowerCase()}` : ""}. {s.detail}.
            {next.length > 0 && ` Next: ${next.map((e) => (e.label ? `${e.label}, ${title(e.to)}` : title(e.to))).join("; or ")}.`}
          </li>
        );
      })}
      </ol>
    </details>
  );
}

export type WorkflowView = "flow" | "matrix";

/** The council, then the flow or the matrix, with a switch between them. */
export function WorkflowDiagram({ flow, initialView = "flow" }: { flow: CouncilFlow; initialView?: WorkflowView }) {
  const [view, setView] = useState<WorkflowView>(initialView);
  return (
    <div className="wf">
      <div className="wf-bar">
        <CouncilStrip flow={flow} />
        <div className="seg" role="group" aria-label="Show the workflow as">
          <button type="button" className={view === "flow" ? "active" : ""} aria-pressed={view === "flow"} onClick={() => setView("flow")}>
            Flow diagram
          </button>
          <button type="button" className={view === "matrix" ? "active" : ""} aria-pressed={view === "matrix"} onClick={() => setView("matrix")}>
            Decision matrix
          </button>
        </div>
      </div>
      <p className="sr-only">{flow.summary}</p>
      {view === "flow" ? (
        <>
          <Suspense fallback={<div className="wf-canvas wf-loading" style={{ height: 360 }} aria-hidden="true" />}>
            <FlowDiagram flow={flow} />
          </Suspense>
          <ul className="wf-legend" aria-label="Key">
            <li><span className="wf-key wf-key-flow" />Work moves on</li>
            <li><span className="wf-key wf-key-baton" />Baton pass to the checker</li>
            <li><span className="wf-key wf-key-fallback" />Stand-in if the author is out</li>
            <li><span className="wf-key wf-key-sendback" />Sent back with findings</li>
            <li><span className="wf-key wf-key-you" />Stops for you</li>
          </ul>
          <StepList flow={flow} />
        </>
      ) : (
        <DecisionMatrix flow={flow} />
      )}
    </div>
  );
}
