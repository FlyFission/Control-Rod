import { useNavigate } from "@tanstack/react-router";
import { COLUMNS } from "../../lib/board.js";
import { useLook } from "../../lib/kind.js";
import { Card, sinceText } from "./Card.js";
import { useBoardData } from "./useBoardData.js";
import "./board.css";

/** The board: the home page (spec 6.2). Status is derived from the record, never dragged. */
export function BoardView() {
  const data = useBoardData();
  const navigate = useNavigate();
  const look = useLook();
  const unknown = data.status === "unknown";
  // An empty board is only claimed from a successful, empty read.
  const empty = !data.loading && data.problems.length === 0 && data.cards.length === 0;
  // While the stream is unknown the counts are what was last read, not what is true now.
  const lastKnown = unknown ? "Last known: " : "";
  return (
    <div className="bd" data-look={look}>
      <header className="bd-head">
        <h1 id="board-title">Board</h1>
        <p className="bd-counts">
          <span>
            {lastKnown}
            {data.needsYou} needs you
          </span>
          <span>
            {lastKnown}
            {data.agentsRunning} {data.agentsRunning === 1 ? "agent" : "agents"} running or queued
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
        {data.problems.length > 0 && (
          <div className="bd-unknown" role="alert">
            <span>{data.problems.join(" ")}</span>
            <button type="button" className="btn small" onClick={data.retry}>
              Retry
            </button>
          </div>
        )}
      </header>
      {data.loading && <p className="muted">Loading</p>}
      {empty && (
        <p className="bd-empty">
          Add your first card. Capture a request on the Packages page. When its intake drafts a package, the package appears here in Ready.
        </p>
      )}
      <div className="bd-board">
        {COLUMNS.map((c) => {
          const here = data.cards.filter((x) => x.column === c.id);
          const headingId = `bd-col-${c.id}`;
          return (
            <section key={c.id} className="bd-col" aria-labelledby={headingId}>
              <div className="bd-col-head">
                <h2 id={headingId}>{c.title}</h2>
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
                  {...(data.unknownSince ? { unknownSince: data.unknownSince } : {})}
                  {...(x.owner ? { owner: x.owner } : {})}
                  {...(x.retry ? { onRetry: x.retry } : {})}
                  onOpen={() => void navigate({ to: "/packages/$id", params: { id: x.pkg.id } })}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
