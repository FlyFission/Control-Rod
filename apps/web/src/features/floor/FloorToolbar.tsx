import type { FloorPreferencesV1, FloorPage } from "./types.js";
export function FloorToolbar({
  title,
  preferences,
  onUpdate,
  onThemes,
  page,
  onPageChange,
  total,
  refresh,
}: {
  title: string;
  preferences: FloorPreferencesV1;
  onUpdate: (p: Partial<FloorPreferencesV1>) => void;
  onThemes: () => void;
  page: FloorPage;
  onPageChange: (p: FloorPage) => void;
  total: number;
  refresh: () => void;
}) {
  const last = Math.max(0, Math.ceil(total / 30) - 1),
    index = Math.min(page.index, last);
  return (
    <div className="floor-toolbar">
      <div className="floor-controls">
        <button
          type="button"
          className="floor-btn floor-theme-trigger"
          onClick={onThemes}
        >
          <span aria-hidden="true">✦</span> Theme <strong>{title}</strong>{" "}
          <span aria-hidden="true">⌄</span>
        </button>
        <label>
          Motion
          <select
            value={preferences.motion}
            onChange={(e) =>
              onUpdate({
                motion: e.target.value as FloorPreferencesV1["motion"],
              })
            }
          >
            <option value="full">Full</option>
            <option value="quiet">Quiet</option>
            <option value="still">Still</option>
          </select>
        </label>
        <label>
          View
          <select
            value={preferences.view}
            onChange={(e) =>
              onUpdate({ view: e.target.value as FloorPreferencesV1["view"] })
            }
          >
            <option value="scene">Scene</option>
            <option value="list">List</option>
          </select>
        </label>
        <label>
          Packages
          <select
            value={page.filter}
            onChange={(e) =>
              onPageChange({
                ...page,
                index: 0,
                filter: e.target.value as FloorPage["filter"],
              })
            }
          >
            <option value="active">Active</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      <div className="floor-paging">
        <span>
          {total
            ? `Packages ${index * 30 + 1}–${Math.min((index + 1) * 30, total)} of ${total}`
            : "No matching work packages"}
        </span>
        <button
          className="floor-btn floor-icon-btn"
          type="button"
          aria-label="Previous packages"
          disabled={index === 0}
          onClick={() => onPageChange({ ...page, index: index - 1 })}
        >
          ←
        </button>
        <button
          className="floor-btn floor-icon-btn"
          type="button"
          aria-label="Next packages"
          disabled={index >= last}
          onClick={() => onPageChange({ ...page, index: index + 1 })}
        >
          →
        </button>
        <button
          className="floor-btn floor-btn-subtle"
          type="button"
          onClick={refresh}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
