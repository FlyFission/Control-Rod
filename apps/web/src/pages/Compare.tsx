import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { WorkPackage } from "../api/types.js";

/**
 * Compare (Wave 3): side-by-side comparison of frozen attempts, test verdicts,
 * breaker telemetry, and digest-anchored diff notes.
 */
export function Compare() {
  const packagesQuery = useQuery({
    queryKey: ["packages"],
    queryFn: () => api.packages(),
  });
  const packages = packagesQuery.data ?? [];
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [notes, setNotes] = useState<Array<{ id: string; digest: string; text: string }>>([]);
  const [draftNote, setDraftNote] = useState("");

  const resolvedLeft = useMemo(
    () => packages.find((p) => p.id === leftId) ?? packages[0] ?? null,
    [packages, leftId],
  );
  const resolvedRight = useMemo(
    () => packages.find((p) => p.id === rightId) ?? packages[1] ?? packages[0] ?? null,
    [packages, rightId],
  );

  const addDigestNote = () => {
    const trimmed = draftNote.trim();
    if (!trimmed || !resolvedLeft) return;
    setNotes((prev) => [
      {
        id: `note-${Date.now()}`,
        digest: `${resolvedLeft.id}@r${resolvedLeft.revision}`,
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
          <p className="muted">No frozen package available to compare.</p>
        </section>
      );
    }
    return (
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3>{pkg.title || pkg.id}</h3>
          <span className="pill">{pkg.status}</span>
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
          Inspect frozen candidate revisions side-by-side with digest-anchored review notes before signing Verdict &amp; Clearance.
        </p>
      </header>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row" style={{ gap: "1rem", flexWrap: "wrap" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
        {renderCard(resolvedLeft, "Candidate A")}
        {renderCard(resolvedRight, "Candidate B")}
      </div>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Digest-Anchored Review Notes</h2>
        <div className="row" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
          <input
            type="text"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Anchor a review note to the selected candidate revision..."
            style={{ flex: 1 }}
          />
          <button type="button" onClick={addDigestNote} disabled={!draftNote.trim() || !resolvedLeft}>
            Anchor Note
          </button>
        </div>
        {notes.length > 0 && (
          <ul style={{ marginTop: "0.75rem", paddingLeft: "1.25rem" }}>
            {notes.map((n) => (
              <li key={n.id}>
                <code className="mono">{n.digest}</code>: {n.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
