import { useState } from "react";
import type { CaptureView } from "../../api/types.js";
import { COLUMNS, needsIndependentCheck } from "../../lib/board.js";
import type { EngineeringMode } from "../../lib/mode.js";
import { MODE_COPY } from "../../lib/mode.js";
import type { NextLine } from "../../lib/next.js";
import { splitAttachments } from "../../lib/attachments.js";
import { captureLine, captureSummaryText } from "./CaptureCard.js";
import { sinceText } from "./Card.js";
import type { BoardCard } from "./useBoardData.js";

const TONE_GLYPH: Record<NextLine["tone"] | "unknown", { sym: string; label: string }> = {
  needs: { sym: "▲", label: "Needs you" },
  block: { sym: "✕", label: "Blocked" },
  ok: { sym: "✓", label: "Done" },
  wait: { sym: "○", label: "Waiting" },
  unknown: { sym: "?", label: "Unknown" },
};

export interface BoardListViewProps {
  cards: BoardCard[];
  captures: CaptureView[];
  mode: EngineeringMode;
  stream: "connecting" | "live" | "unknown";
  unknownSince?: string;
  selectedId: string | null;
  selectedCaptureId: string | null;
  onSelectCard: (id: string) => void;
  onSelectCapture: (id: string) => void;
}

/**
 * Dense single-line List view for 50+ card triage (adapted from vibe-kanban IssueListView / IssueListRow).
 * Groups by workflow column with collapsible sections, reserved non-evictable safety badges, and J/K nav.
 */
export function BoardListView({
  cards,
  captures,
  mode,
  stream,
  unknownSince,
  selectedId,
  selectedCaptureId,
  onSelectCard,
  onSelectCapture,
}: BoardListViewProps) {
  const copy = MODE_COPY[mode];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="bd-list" role="region" aria-label="Work list">
      {COLUMNS.map((col) => {
        const colCards = cards.filter((c) => c.column === col.id);
        const colCaptures = col.id === "ready" ? captures : [];
        const total = colCards.length + colCaptures.length;
        if (total === 0) return null;
        const isCollapsed = Boolean(collapsed[col.id]);
        return (
          <section key={col.id} className="bd-list-group" aria-labelledby={`bd-list-${col.id}`}>
            <button
              type="button"
              id={`bd-list-${col.id}`}
              className="bd-list-head"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((prev) => ({ ...prev, [col.id]: !prev[col.id] }))}
            >
              <span aria-hidden="true" className="bd-list-chev">
                {isCollapsed ? "▸" : "▾"}
              </span>
              <span className="bd-list-col-name">{copy.boardColumns[col.id]}</span>
              <span className="mono muted small">{total}</span>
            </button>
            {!isCollapsed && (
              <div className="bd-list-rows">
                {colCaptures.map((cap) => {
                  const shown = splitAttachments(cap.text);
                  const title = captureSummaryText(shown.text) || shown.files.join(", ");
                  const line = captureLine(cap);
                  const g = TONE_GLYPH[line.tone];
                  return (
                    <div
                      key={cap.id}
                      className={selectedCaptureId === cap.id ? "bd-list-row selected" : "bd-list-row"}
                      data-tone={line.tone}
                    >
                      <span className="bd-list-dot" title={g.label} aria-hidden="true">
                        {g.sym}
                      </span>
                      <span className="bd-list-id mono muted">{cap.id}</span>
                      <button
                        type="button"
                        className="bd-title bd-list-title"
                        onClick={() => onSelectCapture(cap.id)}
                      >
                        {title}
                      </button>
                      <div className="bd-list-badges">
                        <span className="bd-chip">Capture</span>
                        {!cap.lane && <span className="bd-safety-badge" data-tone="needs">Classify lane</span>}
                        {line.tone === "block" && <span className="bd-safety-badge" data-tone="block">Blocked</span>}
                      </div>
                      <span className="bd-list-status small muted" title={line.text}>
                        {line.tone === "block" ? `Intake ${cap.intake?.status ?? "failed"}` : line.text}
                      </span>
                    </div>
                  );
                })}
                {colCards.map((c) => {
                  const liveKnown = stream === "live" && !c.lastKnown;
                  const toneKey = liveKnown ? c.next.tone : "unknown";
                  const g = TONE_GLYPH[toneKey];
                  const check = needsIndependentCheck(c.pkg);
                  const statusText =
                    stream === "unknown"
                      ? `Unknown since ${sinceText(unknownSince)}`
                      : c.lastKnown
                        ? `Last known: ${c.next.text}`
                        : c.next.text;
                  return (
                    <div
                      key={c.pkg.id}
                      className={selectedId === c.pkg.id ? "bd-list-row selected" : "bd-list-row"}
                      data-tone={toneKey}
                    >
                      <span className="bd-list-dot" title={g.label} aria-hidden="true">
                        {g.sym}
                      </span>
                      <span className="bd-list-id mono muted">{c.pkg.id}</span>
                      <button
                        type="button"
                        className="bd-title bd-list-title"
                        onClick={() => onSelectCard(c.pkg.id)}
                      >
                        {c.pkg.title}
                      </button>
                      <div className="bd-list-badges">
                        {c.column === "needs-signature" && (
                          <span className="bd-safety-badge" data-tone="needs">
                            Needs signature
                          </span>
                        )}
                        {check && <span className="bd-check">◆ Check</span>}
                        {c.nuclear && <span className="bd-nuclear">Nuclear</span>}
                      </div>
                      <span className="bd-list-status small muted" title={statusText}>
                        {statusText}
                      </span>
                      {c.owner && <span className="bd-list-owner small muted">{c.owner}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
