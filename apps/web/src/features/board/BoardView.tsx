import { useNavigate } from "@tanstack/react-router";
import { COLUMNS } from "../../lib/board.js";
import { Card } from "./Card.js";
import { useBoardData } from "./useBoardData.js";
import "./board.css";

function sinceText(iso: string | undefined): string {
  if (!iso) return "an unknown time";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "an unknown time" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** The board: the home page (spec 6.2). Status is derived from the record, never dragged. */
export function BoardView() {
  const data = useBoardData();
  const navigate = useNavigate();
  const unknown = data.status === "unknown";
  const empty = !data.loading && data.cards.length === 0;
  return (
    <div className="bd">
      <header className="bd-head">
        <h1 id="board-title">Board</h1>
        <p className="bd-counts" aria-live="polite">
          <span>
            {data.needsYou} needs you
          </span>
          <span>
            {data.agentsRunning} {data.agentsRunning === 1 ? "agent" : "agents"} running
          </span>
        </p>
        {unknown && (
          <p className="bd-unknown" role="status">
            <span>Status unknown since {sinceText(data.unknownSince)}. What you see may be out of date.</span>
            <button type="button" className="btn small" onClick={data.reconnect}>
              Reconnect
            </button>
          </p>
        )}
      </header>
      {data.loading && <p className="muted">Loading</p>}
      {empty && (
        <p className="bd-empty">
          Add your first card. Capture a request on the Packages page and it appears here in Ready.
        </p>
      )}
      <div className="bd-board">
        {COLUMNS.map((c) => {
          const here = data.cards.filter((x) => x.column === c.id);
          return (
            <div key={c.id} className="bd-col" role="region" aria-label={c.title}>
              <div className="bd-col-head">
                <span>{c.title}</span>
                <span className="mono muted">{here.length}</span>
              </div>
              {here.map((x) => (
                <Card
                  key={x.pkg.id}
                  pkg={x.pkg}
                  kinds={x.kinds}
                  next={x.next}
                  column={x.column}
                  stream={data.status}
                  {...(x.owner ? { owner: x.owner } : {})}
                  onOpen={() => void navigate({ to: "/packages/$id", params: { id: x.pkg.id } })}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
