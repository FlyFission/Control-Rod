import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import { STATUS_LABEL } from "../lib/format.js";
import { readSession, writeSession } from "../lib/storage.js";

const FILTER_KEY = "cr.registers.filter";

/**
 * Registers (specification 12). The deliverables register is built from every package's own
 * deliverables; the mode workspaces (repositories and merges for Software, design basis,
 * transmittals and the interface matrix for Capital Projects) join it as those records arrive.
 */
export function Registers() {
  const q = useQuery({ queryKey: ["packages"], queryFn: api.packages });
  const [text, setText] = useState(() => readSession(FILTER_KEY));
  const rows = useMemo(
    () =>
      (q.data ?? []).flatMap((p) =>
        p.deliverables.map((d) => ({ pkg: p, d, key: `${p.id}:${d.id}` })),
      ),
    [q.data],
  );
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(({ pkg, d }) => {
    const hay = `${d.id} ${d.type} ${(d.format ?? []).join(" ")} ${pkg.id} ${pkg.title} ${pkg.discipline ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return (
    <div className="place">
      <header className="place-head">
        <h1>Registers</h1>
        <p className="muted">Every deliverable every package has promised, with the package's current state.</p>
      </header>
      <section className="panel" aria-labelledby="deliverables-title">
        <div className="panel-head">
          <h2 id="deliverables-title">Deliverables register</h2>
          <span className="muted small">
            {shown.length} of {rows.length}
          </span>
        </div>
        <label className="field narrow">
          <span>Find</span>
          <input
            type="search"
            value={text}
            placeholder="Deliverable, type, format or package"
            onChange={(e) => {
              setText(e.target.value);
              writeSession(FILTER_KEY, e.target.value);
            }}
          />
        </label>
        {q.isLoading && <p className="muted">Loading</p>}
        {!q.isLoading && rows.length === 0 && <p className="muted">No deliverables yet. They appear as packages are drafted.</p>}
        {shown.length > 0 && (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th scope="col">Deliverable</th>
                  <th scope="col">Type</th>
                  <th scope="col">Format</th>
                  <th scope="col">Package</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ pkg, d, key }) => (
                  <tr key={key}>
                    <td className="mono">{d.id}</td>
                    <td>{d.type}</td>
                    <td className="muted">{(d.format ?? []).join(", ") || "any"}</td>
                    <td>
                      <Link to="/packages/$id" params={{ id: pkg.id }}>
                        {pkg.title}
                      </Link>{" "}
                      <span className="mono small muted">
                        {pkg.id} rev {pkg.revision}
                      </span>
                    </td>
                    <td>{STATUS_LABEL[pkg.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
