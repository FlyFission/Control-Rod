import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { WorkPackage } from "../api/types.js";
import { STATUS_LABEL } from "../lib/format.js";

/**
 * Compare (Wave 3): side-by-side comparison of candidate revisions with temporary
 * browser-local revision notes before taking a signed decision.
 */
export function Compare() {
  const packagesQuery = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.packages(),
  });
  const packages = packagesQuery.data;
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [noteTarget, setNoteTarget] = useState<"left" | "right">("left");
  const [notes, setNotes] = useState<Array<{ id: string; revisionRef: string; text: string }>>([]);
  const [draftNote, setDraftNote] = useState("");

  const resolvedLeft = useMemo(
    () => (packages ? packages.find((p) => p.id === leftId) ?? packages[0] ?? null : null),
    [packages, leftId],
  );
  const resolvedRight = useMemo(
    () => (packages ? packages.find((p) => p.id === rightId) ?? packages[1] ?? packages[0] ?? null : null),
    [packages, rightId],
  );
  const targetPkg = noteTarget === "right" ? resolvedRight : resolvedLeft;

  const addLocalNote = () => {
    const trimmed = draftNote.trim();
    if (!trimmed || !targetPkg) return;
    setNotes((prev) => [
      {
        id: `note-${Date.now()}`,
        revisionRef: `${targetPkg.id}@r${targetPkg.revision}`,
        text: trimmed,
      },
      ...prev,
    ]);
    setDraftNote("");
  };

  const renderCard = (pkg: WorkPackage | null, side: string) => {
    if (!pkg) {
      return (
        <section className="panel">
          <h3>{side}</h3>
          <p className="muted">No package available to compare.</p>
        </section>
      );
    }
    return (
      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h3>{pkg.title || pkg.id}</h3>
          <span className="tag">{STATUS_LABEL[pkg.status] ?? pkg.status}</span>
        </div>
        <dl className="kv-list" style={{ marginTop: "0.75rem" }}>
          <div>
            <dt>Package ID</dt>
            <dd className="mono">{pkg.id}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd className="mono">r{pkg.revision}</dd>
          </div>
          <div>
            <dt>Mode / Grade</dt>
            <dd>
              {pkg.mode} / {pkg.grade ?? "general-service"}
            </dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>{pkg.project}</dd>
          </div>
        </dl>
      </section>
    );
  };

  return (
    <div className="place">
      <header className="place-head">
        <h1>Compare</h1>
        <p className="muted">
          Compare package headers, metadata, and status side-by-side with temporary local review notes before recording a signed decision.
        </p>
      </header>

      {packagesQuery.isLoading && <p className="muted">Loading</p>}
      {packagesQuery.isError && (
        <div role="alert" className="panel error" style={{ marginBottom: "1rem" }}>
          <p>
            {packages === undefined
              ? explain(packagesQuery.error, "The packages could not be loaded.")
              : "The packages could not be refreshed; this view may be out of date."}
          </p>
          <button type="button" className="btn small" onClick={() => void packagesQuery.refetch()}>
            Try again
          </button>
        </div>
      )}

      {packages !== undefined && (
        <>
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <label>
                Left candidate{" "}
                <select value={resolvedLeft?.id ?? ""} onChange={(e) => setLeftId(e.target.value)}>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.id} (r{p.revision})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Right candidate{" "}
                <select value={resolvedRight?.id ?? ""} onChange={(e) => setRightId(e.target.value)}>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.id} (r{p.revision})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "1rem" }}>
            {renderCard(resolvedLeft, "Candidate A")}
            {renderCard(resolvedRight, "Candidate B")}
          </div>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <h2>Temporary Local Revision Notes</h2>
            <p className="muted small">
              Notes added here are tagged with <code className="mono">id@rN</code> in this session only and are not persisted across reloads or cryptographically bound to a digest.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <select
                aria-label="Note target candidate"
                value={noteTarget}
                onChange={(e) => setNoteTarget(e.target.value as "left" | "right")}
              >
                <option value="left">Left candidate</option>
                <option value="right">Right candidate</option>
              </select>
              <input
                type="text"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder={`Add a temporary local note for the ${noteTarget} candidate revision (not persisted across reloads)...`}
                style={{ flex: 1, minWidth: "200px" }}
              />
              <button type="button" className="btn" onClick={addLocalNote} disabled={!draftNote.trim() || !targetPkg}>
                Add Local Note
              </button>
            </div>
            {notes.length > 0 && (
              <ul style={{ marginTop: "0.75rem", paddingLeft: "1.25rem" }}>
                {notes.map((n) => (
                  <li key={n.id}>
                    <code className="mono">{n.revisionRef}</code>: {n.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
