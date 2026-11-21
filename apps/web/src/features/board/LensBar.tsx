import { useState } from "react";
import { type ColorBy, DEFAULT_LENS, type Density, type GroupBy, type Lens, lensesEqual } from "../../lib/lenses.js";
import type { SavedView } from "./savedViews.js";
import type { BoardCard, Confidence } from "./useBoardData.js";

export type LensBarProps = {
  lens: Lens;
  cards: BoardCard[];
  countsStatus?: Confidence;
  views: SavedView[];
  onChange: (next: Lens) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (name: string) => void;
};

/**
 * Board lens bar (M2): kind filter with counts, Needs you & Mine toggles, Color by, Group by,
 * density switch, and per-user saved views. Uses real buttons and selects.
 */
export function LensBar({ lens, cards, countsStatus = "current", views, onChange, onSaveView, onDeleteView }: LensBarProps) {
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const [selectedName, setSelectedName] = useState("");

  const counts = {
    all: cards.length,
    code: cards.filter((c) => c.kinds.includes("code")).length,
    doc: cards.filter((c) => c.kinds.includes("doc")).length,
  };

  // Prefer the explicitly selected view while its lens still matches; otherwise match any view with the same lens.
  const matchedView =
    (selectedName && views.find((v) => v.name === selectedName && lensesEqual(v.lens, lens))?.name) ||
    views.find((v) => lensesEqual(v.lens, lens))?.name ||
    "";

  // Distinguish an unsaved non-default lens from "Default view" so "Default view" stays selectable to reset.
  const isDefault = lensesEqual(lens, DEFAULT_LENS);
  const selectValue = matchedView !== "" ? matchedView : isDefault ? "" : "__custom__";

  function update(patch: Partial<Lens>) {
    onChange({ ...lens, ...patch });
  }

  function submitSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = viewName.trim();
    if (!trimmed) return;
    onSaveView(trimmed);
    setSelectedName(trimmed);
    setViewName("");
    setSaving(false);
  }

  return (
    <div className="bd-lensbar" role="toolbar" aria-label="Board lenses">
      <div className="bd-lens-kinds" role="group" aria-label="Kind">
        {(
          [
            ["all", "All", counts.all],
            ["code", "Code", counts.code],
            ["doc", "Documents", counts.doc],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            className="bd-lens-btn"
            aria-pressed={lens.kind === k}
            onClick={() => update({ kind: k })}
          >
            <span>{label}</span>
            {countsStatus === "unknown" ? (
              <span className="bd-lens-count mono">
                <span aria-hidden="true">—</span>
                <span className="sr-only">count unknown</span>
              </span>
            ) : (
              <span className="bd-lens-count mono">
                {n}
                {countsStatus === "last-known" && <span className="sr-only"> (last known)</span>}
              </span>
            )}
          </button>
        ))}
      </div>
      {countsStatus === "last-known" && <span className="bd-lens-stale muted">Last known counts</span>}

      <button
        type="button"
        className="bd-filter-btn"
        aria-pressed={lens.needs}
        onClick={() => update({ needs: !lens.needs })}
      >
        Needs you
      </button>

      <button
        type="button"
        className="bd-filter-btn"
        aria-pressed={lens.mine}
        onClick={() => update({ mine: !lens.mine })}
      >
        Mine
      </button>

      <span className="bd-lens-spacer" />

      <label className="bd-lens-ctl">
        <span>Color by</span>
        <select
          className="bd-lens-select"
          value={lens.colorBy}
          onChange={(e) => update({ colorBy: e.target.value as ColorBy })}
        >
          <option value="kind">Kind</option>
          <option value="state">State</option>
          <option value="agent">Agent</option>
          <option value="person">Person</option>
          <option value="none">None</option>
        </select>
      </label>

      <label className="bd-lens-ctl">
        <span>Group by</span>
        <select
          className="bd-lens-select"
          value={lens.groupBy}
          onChange={(e) => update({ groupBy: e.target.value as GroupBy })}
        >
          <option value="none">None</option>
          <option value="kind">Kind</option>
          <option value="person">Person</option>
          <option value="project">Project</option>
        </select>
      </label>

      <div className="bd-lens-seg" role="group" aria-label="Density">
        {(
          [
            ["comfortable", "Comfortable"],
            ["compact", "Compact"],
          ] as const
        ).map(([d, label]) => (
          <button
            key={d}
            type="button"
            className="bd-lens-btn"
            aria-pressed={lens.density === d}
            onClick={() => update({ density: d as Density })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bd-lens-views">
        <label className="bd-lens-ctl">
          <span>Saved view</span>
          <select
            className="bd-lens-select"
            value={selectValue}
            onChange={(e) => {
              const name = e.target.value;
              if (name === "__custom__") return;
              setSelectedName(name);
              if (!name) {
                onChange({ ...DEFAULT_LENS });
                return;
              }
              const picked = views.find((v) => v.name === name);
              if (picked) onChange(picked.lens);
            }}
          >
            <option value="">Default view</option>
            {selectValue === "__custom__" && (
              <option value="__custom__" disabled>
                Custom view
              </option>
            )}
            {views.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        {matchedView !== "" && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              onDeleteView(matchedView);
              setSelectedName("");
            }}
          >
            Delete view
          </button>
        )}

        {saving ? (
          <form className="bd-lens-save-form" onSubmit={submitSave}>
            <input
              type="text"
              className="bd-lens-input"
              aria-label="View name"
              placeholder="View name"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSaving(false);
                  setViewName("");
                }
              }}
              autoFocus
            />
            <button type="submit" className="btn small primary" disabled={viewName.trim().length === 0}>
              Save
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setSaving(false);
                setViewName("");
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="btn small" onClick={() => setSaving(true)}>
            Save view
          </button>
        )}
      </div>
    </div>
  );
}
