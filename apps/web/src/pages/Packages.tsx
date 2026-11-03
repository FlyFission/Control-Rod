import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { WorkPackage } from "../api/types.js";
import { CaptureBox } from "../components/CaptureBox.js";
import { RecentCaptures } from "../components/Captures.js";
import { STATUS_LABEL } from "../lib/format.js";
import { readSession, writeSession } from "../lib/storage.js";

const FILTER_KEY = "cr.packages.filter";
const STATUS_KEY = "cr.packages.status";

/** Packages (specification 12): capture new work, and find every package. Filters are remembered for the session. */
export function Packages() {
  return (
    <div className="place packages-place">
      <header className="place-head">
        <h1>Packages</h1>
        <p className="muted">Say what you want done; intake answers it or drafts a package. Every package is listed below.</p>
      </header>
      <div className="packages-grid">
        <div>
          <CaptureBox />
          <RecentCaptures />
        </div>
        <PackageList />
      </div>
    </div>
  );
}

function PackageList() {
  const q = useQuery({ queryKey: ["packages"], queryFn: api.packages });
  const [text, setText] = useState(() => readSession(FILTER_KEY));
  const [status, setStatus] = useState(() => readSession(STATUS_KEY, "open"));
  const all = q.data ?? [];
  const shown = useMemo(() => filterPackages(all, text, status), [all, text, status]);
  return (
    <section className="panel" aria-labelledby="pkg-list-title">
      <div className="panel-head">
        <h2 id="pkg-list-title">All packages</h2>
        <span className="muted small">
          {shown.length} of {all.length}
        </span>
      </div>
      <div className="filters">
        <label className="field">
          <span>Find</span>
          <input
            type="search"
            value={text}
            placeholder="Title, id, project or discipline"
            onChange={(e) => {
              setText(e.target.value);
              writeSession(FILTER_KEY, e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              writeSession(STATUS_KEY, e.target.value);
            }}
          >
            <option value="open">Open (not accepted or closed)</option>
            <option value="all">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {q.isLoading && <p className="muted">Loading</p>}
      {q.isError && (
          <div role="alert" className="error">
            <p>{q.data === undefined ? "The packages could not be loaded." : "The packages could not be refreshed; this list may be out of date."}</p>
            <button type="button" className="btn small" onClick={() => void q.refetch()}>
              Try again
            </button>
          </div>
        )}
        {q.isSuccess && all.length === 0 && <p className="muted">No packages yet. Capture something above and intake will draft one.</p>}
      {all.length > 0 && shown.length === 0 && <p className="muted">No package matches these filters.</p>}
      <ul className="package-list">
        {shown.map((p) => (
          <li key={p.id}>
            <Link to="/packages/$id" params={{ id: p.id }} className="package-row">
              <span className="package-row-title">{p.title}</span>
              <span className="mono small muted">
                {p.id} rev {p.revision}
              </span>
              <span className="small muted">
                {STATUS_LABEL[p.status]} · {p.project} · {p.rigor_mode}
                {p.discipline !== undefined ? ` · ${p.discipline}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Packages matching the text (every word, anywhere in title, id, project or discipline) and the status choice. */
export function filterPackages(all: WorkPackage[], text: string, status: string): WorkPackage[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return all.filter((p) => {
    if (status === "open" && (p.status === "accepted" || p.status === "closed")) return false;
    if (status !== "open" && status !== "all" && p.status !== status) return false;
    const hay = `${p.title} ${p.id} ${p.project} ${p.discipline ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
