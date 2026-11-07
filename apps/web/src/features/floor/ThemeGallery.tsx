import { useEffect, useRef, useState } from "react";
import {
  THEME_CATALOG,
  getThemeEntry,
  RELEASE_RECORDS,
} from "./themes/registry.js";

const MOODS = [
  "All",
  ...Array.from(new Set(THEME_CATALOG.flatMap((e) => e.moodTags))).sort(),
] as const;

export function ThemeGallery({
  activeId,
  onActivate,
  onClose,
  allowDrafts,
  error = "",
}: {
  activeId: string;
  onActivate: (id: string) => void;
  onClose: () => void;
  allowDrafts: boolean;
  error?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string>();
  const [mood, setMood] = useState<(typeof MOODS)[number]>("All");

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prior;
      restore?.focus();
    };
  }, []);

  const allEntries = [getThemeEntry("plain")!, ...THEME_CATALOG];
  const entries = mood === "All"
    ? allEntries
    : allEntries.filter((e) => e.id === "plain" || e.moodTags.includes(mood));

  return (
    <div
      className="floor-gallery-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="floor-gallery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-gallery-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),a[href]",
              ),
            ];
            const first = buttons[0],
              last = buttons.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="floor-gallery-head">
          <div>
            <p className="floor-eyebrow">A different perspective</p>
            <h2 id="theme-gallery-title">Choose your working world</h2>
            <p>Same agents. Same work. A little more imagination.</p>
          </div>
          <button
            type="button"
            className="floor-close"
            onClick={onClose}
            aria-label="Close themes"
          >
            ×
          </button>
        </div>

        <div className="floor-gallery-filters" role="group" aria-label="Filter by mood">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mood === m}
              aria-controls="theme-gallery-grid"
              className={`floor-mood-tab ${mood === m ? "is-selected" : ""}`}
              onClick={() => setMood(m)}
            >
              {m}
              {m !== "All" && (
                <span className="floor-mood-count">
                  {THEME_CATALOG.filter((e) => e.moodTags.includes(m)).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {allowDrafts && (
          <p className="floor-draft-notice">
            Original artwork · local draft evaluation. Public release review is
            pending.
          </p>
        )}
        {error && (
          <p role="alert" className="floor-notice">
            {error}
          </p>
        )}
        <div id="theme-gallery-grid" className="floor-gallery-grid">
          {entries.map((e, i) => (
            <article
              key={e.id}
              className={`floor-theme-card ${activeId === e.id ? "is-active" : ""}`}
            >
              <div
                className="floor-theme-art"
                style={{ background: e.palette[0] ?? "#24394c" }}
              >
                {e.id === "plain" ? (
                  <div className="floor-plain-thumb" aria-hidden="true">
                    ◉ ─ ◉<br />
                    │　　│
                    <br />◉ ─ ◉
                  </div>
                ) : e.thumbnail ? (
                  <img
                    src={e.thumbnail}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                  />
                ) : null}
                <span className="floor-theme-number">
                  {String(i).padStart(2, "0")}
                </span>
                {e.palette.length > 0 && (
                  <div className="floor-theme-swatches" aria-label="Palette colors">
                    {e.palette.map((c) => (
                      <span key={c} style={{ background: c }} title={c} />
                    ))}
                  </div>
                )}
              </div>
              <div className="floor-theme-copy">
                <div className="floor-theme-title">
                  <h3>{e.title}</h3>
                  {activeId === e.id && (
                    <span className="floor-active-tag">Current</span>
                  )}
                </div>
                <p>{e.description}</p>
                <div className="floor-theme-tags">
                  {e.moodTags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                  <span>
                    {e.id === "plain"
                      ? "Always available"
                      : allowDrafts
                        ? "Draft artwork"
                        : "In development"}
                  </span>
                </div>
                <div className="floor-theme-actions">
                  <button
                    type="button"
                    className="floor-btn floor-btn-subtle"
                    aria-label={`Preview ${e.title}`}
                    onClick={() => setPreview(e.id)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className="floor-btn"
                    disabled={
                      !allowDrafts &&
                      e.id !== "plain" &&
                      !RELEASE_RECORDS.some((r) => r.packId === e.id)
                    }
                    aria-label={`Use ${e.title} theme`}
                    onClick={() => onActivate(e.id)}
                  >
                    Use <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </div>
              {preview === e.id && (
                <div className="floor-preview" role="status">
                  <strong>Preview: sample activity</strong>
                  <p>{e.description}</p>
                  {e.stationLabels && (
                    <div className="floor-preview-stations">
                      <span className="floor-preview-heading">Stations:</span>
                      <p>{Object.values(e.stationLabels).join(" · ")}</p>
                    </div>
                  )}
                  {e.signature && e.signature !== "none" && (
                    <div className="floor-preview-sig">
                      <span className="floor-preview-heading">Submission signature:</span>{" "}
                      <code>{e.signature}</code>
                    </div>
                  )}
                  <button
                    type="button"
                    className="floor-btn"
                    onClick={() => setPreview(undefined)}
                  >
                    Close preview
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
