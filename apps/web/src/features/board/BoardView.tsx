import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { COLUMNS } from "../../lib/board.js";
import { useLook } from "../../lib/kind.js";
import { MODE_COPY, useMode } from "../../lib/mode.js";
import { BoardReviewDrawer } from "./BoardReviewDrawer.js";
import { Card, sinceText } from "./Card.js";
import { useBoardData } from "./useBoardData.js";
import "./board.css";

type BoardFilter = "all" | "needs" | "special" | "blocked";

/** The board: the home page (spec 6.2). Status is derived from the record, never dragged. */
export function BoardView() {
  const data = useBoardData();
  const look = useLook();
  const mode = useMode();
  const copy = MODE_COPY[mode];

  const [filter, setFilter] = useState<BoardFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const unknown = data.status === "unknown";
  // An empty board is only claimed from a successful, empty read.
  const empty = !data.loading && data.problems.length === 0 && data.cards.length === 0;
  // Counts are facts only after a successful read; after a failed refresh, a drop not yet recovered
  // from, or while the stream is unknown they are what was last read, and before any read they are
  // not shown. Each count also needs every read it is made from (Codex round 3).
  const countsKnown = data.counts !== "unknown";
  const count = (c: "current" | "last-known" | "unknown", n: number, words: string, label: string) =>
    c === "unknown" ? `${label}: unknown` : `${c === "last-known" ? "Last known: " : ""}${n} ${words}`;

  const filteredCards = useMemo(() => {
    return data.cards.filter((x) => {
      if (filter === "needs") return x.next.tone === "needs";
      if (filter === "special") return x.pkg.grade === "safety" || x.pkg.grade === "material";
      if (filter === "blocked") return x.next.tone === "block";
      return true;
    });
  }, [data.cards, filter]);

  const selectedCard = useMemo(
    () => (selectedId ? data.cards.find((x) => x.pkg.id === selectedId) : undefined),
    [data.cards, selectedId],
  );

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    const el = triggerRef.current;
    triggerRef.current = null;
    if (el) {
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  // J / K keyboard navigation across visible board card titles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      const titles = Array.from(document.querySelectorAll<HTMLButtonElement>(".bd-board .bd-title"));
      if (titles.length === 0) return;
      e.preventDefault();
      const idx = titles.indexOf(document.activeElement as HTMLButtonElement);
      const nextIdx =
        key === "j"
          ? idx < 0
            ? 0
            : Math.min(titles.length - 1, idx + 1)
          : idx <= 0
            ? 0
            : idx - 1;
      titles[nextIdx]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="bd" data-look={look} data-mode={mode}>
      <header className="bd-head">
        <div className="bd-head-top">
          <h1 id="board-title">Board</h1>
          {countsKnown ? (
            <p className="bd-counts">
              <span>{count(data.needsYouCounts, data.needsYou, "needs you", "Needs you")}</span>
              <span>
                {count(data.agentsRunningCounts, data.agentsRunning, `${data.agentsRunning === 1 ? "agent" : "agents"} running or queued`, "Agents running or queued")}
              </span>
            </p>
          ) : (
            <p className="bd-counts">Counts unknown until the work is read</p>
          )}
          <div className="bd-filters" role="group" aria-label="Filter board">
            {(
              [
                ["all", "All"],
                ["needs", "Needs you"],
                ["special", copy.specialGrade.label],
                ["blocked", "Blocked"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="bd-filter-btn"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
        <section className="bd-empty-card" aria-label="Getting started">
          <div className="bd-empty-copy">
            <h2>{mode === "capital-projects" ? "No engineering deliverables yet" : "No software changes in flight yet"}</h2>
            <p className="small muted">
              Add your first card with {copy.newCta} or on the Packages page. When its intake drafts a package, the package appears here in Ready.
            </p>
            <div className="bd-empty-steps">
              <span>1. Capture ({copy.newCta})</span>
              <span>2. {copy.boardColumns.drafting}</span>
              <span>3. {copy.boardColumns["agent-check"]}</span>
              <span>4. {copy.boardColumns["person-verifies"]}</span>
            </div>
          </div>
          <div className="bd-empty-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }))}
            >
              + {copy.newCta} <kbd>C</kbd>
            </button>
            <Link to="/packages" className="btn">
              Open Packages
            </Link>
          </div>
        </section>
      )}
      <div className={selectedId ? "bd-workspace has-drawer" : "bd-workspace"}>
        <div className="bd-board">
          {COLUMNS.map((c) => {
            const here = filteredCards.filter((x) => x.column === c.id);
            const headingId = `bd-col-${c.id}`;
            return (
              <section key={c.id} className="bd-col" aria-labelledby={headingId}>
                <div className="bd-col-head">
                  <h2 id={headingId}>{copy.boardColumns[c.id]}</h2>
                  {countsKnown ? (
                    <span className="mono muted">{here.length}</span>
                  ) : (
                    <span className="mono muted">
                      <span aria-hidden="true">?</span>
                      <span className="sr-only">count unknown</span>
                    </span>
                  )}
                </div>
                {here.map((x) => (
                  <Card
                    key={x.pkg.id}
                    pkg={x.pkg}
                    kinds={x.kinds}
                    next={x.next}
                    column={x.column}
                    stream={data.status}
                    lastKnown={x.lastKnown}
                    selected={selectedId === x.pkg.id}
                    {...(data.unknownSince ? { unknownSince: data.unknownSince } : {})}
                    {...(x.owner ? { owner: x.owner } : {})}
                    {...(x.retry ? { onRetry: x.retry } : {})}
                    onOpen={() => {
                      triggerRef.current = document.activeElement as HTMLElement | null;
                      setSelectedId(x.pkg.id);
                    }}
                  />
                ))}
              </section>
            );
          })}
        </div>
        {selectedId && (
          <BoardReviewDrawer
            packageId={selectedId}
            {...(selectedCard ? { initialPkg: selectedCard.pkg } : {})}
            mode={mode}
            onClose={closeDrawer}
          />
        )}
      </div>
    </div>
  );
}
