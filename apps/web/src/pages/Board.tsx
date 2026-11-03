import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { COLUMNS, groupBoard } from "../lib/board.js";

export function Board() {
  const packages = useQuery({ queryKey: ["packages"], queryFn: api.packages });
  const office = useQuery({ queryKey: ["office"], queryFn: api.office });
  const groups = groupBoard(packages.data ?? [], office.data ?? []);
  return (
    <section aria-labelledby="board-title">
      <div className="panel-head">
        <h1 id="board-title">Board</h1>
        <span className="muted small">Columns are the work steps toward each package's next rung.</span>
      </div>
      {packages.isLoading && <p className="muted">Loading</p>}
      <div className="board">
        {COLUMNS.map((c) => (
          <div key={c.id} className="column" role="region" aria-label={c.title}>
            <div className="column-head">
              <span>{c.title}</span>
              <span className="mono muted">{groups[c.id].length}</span>
            </div>
            {groups[c.id].map((p) => (
              <Link key={p.id} to="/packages/$id" params={{ id: p.id }} className="card">
                <span className="mono small muted">
                  {p.id} rev {p.revision}
                </span>
                <span className="card-title">{p.title}</span>
                <span className="small muted">
                  {p.mode} · {p.rigor_mode}
                </span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
