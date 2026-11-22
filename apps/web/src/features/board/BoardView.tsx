import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { COLUMNS } from "../../lib/board.js";
import { type Kind, useLook } from "../../lib/kind.js";
import {
  COLOR_BY_LABEL,
  DEFAULT_LENS,
  type Lens,
  applyLens,
  edgeColor,
  legendEntries,
  parseLens,
  revealHidden,
  writeLensToUrl,
} from "../../lib/lenses.js";
import { MODE_COPY, useMode } from "../../lib/mode.js";
import { BoardReviewDrawer } from "./BoardReviewDrawer.js";
import { Card, sinceText } from "./Card.js";
import { CaptureCard } from "./CaptureCard.js";
import { CardActions } from "./CardActions.js";
import { LensBar } from "./LensBar.js";
import { QuickAdd } from "./QuickAdd.js";
import { type SavedView, deleteView, loadViews, saveView } from "./savedViews.js";
import { DaemonNotice } from "../../components/DaemonNotice.js";
import { cardStatusReadiness, filterBoardCards, shouldYieldBoardFind, sortLaneCards } from "./boardPolish.js";
import { type BoardCard, useBoardData } from "./useBoardData.js";
import "./board.css";

function readInitialLens(): Lens {
  if (typeof window === "undefined") return DEFAULT_LENS;
  return parseLens(new URLSearchParams(window.location.search));
}

type Swimlane = { key: string; label: string; cards: BoardCard[] };

/** The board: the home page (spec 6.2). Status is derived from the record, never dragged. */
export function BoardView() {
  const data = useBoardData();
  const look = useLook();
  const mode = useMode();
  const copy = MODE_COPY[mode];

  const [lens, setLens] = useState<Lens>(readInitialLens);
  const [views, setViews] = useState<SavedView[]>(() => loadViews(data.me));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setViews(loadViews(data.me));
  }, [data.me]);

  useEffect(() => {
    const onPop = () => setLens(readInitialLens());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const updateLens = useCallback((next: Lens) => {
    setLens(next);
    writeLensToUrl(next);
  }, []);

  const handleSaveView = useCallback(
    (name: string) => {
      saveView({ name, lens }, data.me);
      setViews(loadViews(data.me));
    },
    [lens, data.me],
  );

  const handleDeleteView = useCallback(
    (name: string) => {
      deleteView(name, data.me);
      setViews(loadViews(data.me));
    },
    [data.me],
  );

  const unknown = data.status === "unknown";
  // An empty board is only claimed from a successful, empty read.
  const empty = !data.loading && data.problems.length === 0 && data.cards.length === 0 && data.captures.length === 0;
  // Counts are facts only after a successful read; after a failed refresh, a drop not yet recovered
  // from, or while the stream is unknown they are what was last read, and before any read they are
  // not shown. Each count also needs every read it is made from (Codex round 3).
  const countsKnown = data.counts !== "unknown";
  const count = (c: "current" | "last-known" | "unknown", n: number, words: string, label: string) =>
    c === "unknown" ? `${label}: unknown` : `${c === "last-known" ? "Last known: " : ""}${n} ${words}`;

  const { shown: filteredCards, hiddenProtected } = useMemo(
    () => applyLens(data.cards, lens, data.me),
    [data.cards, lens, data.me],
  );

  const searchedCards = useMemo(
    () => filterBoardCards(filteredCards, deferredSearch, data.projects),
    [filteredCards, deferredSearch, data.projects],
  );

  const lanes: Swimlane[] = useMemo(() => {
    if (lens.groupBy === "none") return [];
    if (lens.groupBy === "kind") {
      const defs: { key: Kind; label: string }[] = [
        { key: "code", label: "Code" },
        { key: "doc", label: "Documents" },
      ];
      return defs
        .map((d) => ({
          key: d.key,
          label: d.label,
          cards: searchedCards.filter((c) => (lens.kind !== "all" ? lens.kind === d.key : c.kinds[0] === d.key)),
        }))
        .filter((l) => l.cards.length > 0);
    }
    if (lens.groupBy === "person") {
      const map = new Map<string, BoardCard[]>();
      for (const c of searchedCards) {
        const k = c.owner ?? "";
        map.set(k, [...(map.get(k) ?? []), c]);
      }
      return [...map.entries()]
        .sort(([a], [b]) => {
          if (a === "" && b !== "") return 1;
          if (b === "" && a !== "") return -1;
          return a.localeCompare(b);
        })
        .map(([k, cards]) => ({ key: k || "__unassigned", label: k || "Unassigned", cards }));
    }
    const map = new Map<string, BoardCard[]>();
    for (const c of searchedCards) {
      const k = c.pkg.project || "";
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === "" && b !== "") return 1;
        if (b === "" && a !== "") return -1;
        const la = (a && data.projects[a]) || a;
        const lb = (b && data.projects[b]) || b;
        return la.localeCompare(lb);
      })
      .map(([k, cards]) => ({ key: k || "__none", label: (k && data.projects[k]) || k || "No project", cards }));
  }, [searchedCards, lens.groupBy, lens.kind, data.projects]);

  const legendItems = useMemo(
    () => legendEntries(searchedCards, lens, copy.boardColumns),
    [searchedCards, lens, copy.boardColumns],
  );

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

  // Scoped Cmd/Ctrl+F focuses the board search input, yielding to inputs, select, editable regions, and dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "f") return;
      if (shouldYieldBoardFind(e.target)) return;
      const input = searchInputRef.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // J / K keyboard navigation across visible board card titles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldYieldBoardFind(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      const titles = Array.from(document.querySelectorAll<HTMLButtonElement>(".bd-board button.bd-title"));
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

  const renderColumns = (cards: BoardCard[], includeReadyExtras: boolean, Heading: "h2" | "h3", idPrefix: string) =>
    COLUMNS.map((c) => {
      const here = sortLaneCards(cards.filter((x) => x.column === c.id));
      const headingId = `${idPrefix}-${c.id}`;
      return (
        <section key={c.id} className="bd-col" aria-labelledby={headingId}>
          <div className="bd-col-head">
            <Heading id={headingId}>{copy.boardColumns[c.id]}</Heading>
            {countsKnown ? (
              <span className="mono muted">{here.length}</span>
            ) : (
              <span className="mono muted">
                <span aria-hidden="true">?</span>
                <span className="sr-only">count unknown</span>
              </span>
            )}
          </div>
          {includeReadyExtras && c.id === "ready" && <QuickAdd />}
          {includeReadyExtras && c.id === "ready" && data.captures.map((cap) => <CaptureCard key={cap.id} capture={cap} />)}
          {here.map((x) => (
            <Card
              key={x.pkg.id}
              pkg={x.pkg}
              kinds={x.kinds}
              next={x.next}
              column={x.column}
              stream={data.status}
              lastKnown={x.lastKnown}
              nuclear={x.nuclear}
              runActive={x.runActive}
              readiness={cardStatusReadiness(x, data.status)}
              selected={selectedId === x.pkg.id}
              edgeColor={edgeColor(x, lens)}
              compact={lens.density === "compact"}
              actions={<CardActions card={x} />}
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
    });

  return (
    <div className="bd" data-look={look} data-mode={mode} data-density={lens.density}>
      <header className="bd-head">
        <div className="bd-head-top">
          <h1 id="board-title">Board</h1>
          {countsKnown ? (
            <p className="bd-counts">
              {data.needsYouCounts === "unknown" ? (
                <span>Needs you: unknown</span>
              ) : (
                <button
                  type="button"
                  className="bd-count-btn"
                  aria-pressed={lens.needs}
                  onClick={() => updateLens({ ...lens, needs: !lens.needs })}
                >
                  {count(data.needsYouCounts, data.needsYou, "needs you", "Needs you")}
                </button>
              )}
              <span>
                {count(data.agentsRunningCounts, data.agentsRunning, `${data.agentsRunning === 1 ? "agent" : "agents"} running or queued`, "Agents running or queued")}
              </span>
            </p>
          ) : (
            <p className="bd-counts">Counts unknown until the work is read</p>
          )}
          <div className="bd-search">
            <label className="sr-only" htmlFor="bd-search-input">
              Filter board cards
            </label>
            <input
              ref={searchInputRef}
              id="bd-search-input"
              type="search"
              className="bd-search-input"
              placeholder="Filter cards…"
              aria-keyshortcuts="Control+F Meta+F"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && searchQuery.length > 0) {
                  e.preventDefault();
                  setSearchQuery("");
                }
              }}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                className="btn small ghost bd-search-clear"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <LensBar
          lens={lens}
          cards={data.cards}
          countsStatus={data.counts}
          views={views}
          onChange={updateLens}
          onSaveView={handleSaveView}
          onDeleteView={handleDeleteView}
        />
        <DaemonNotice running={data.agentsRunning} />
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
      {hiddenProtected > 0 && (
        <div className="bd-guard" role="status">
          <span>
            {hiddenProtected} waiting on a signature {hiddenProtected === 1 ? "is" : "are"} hidden by this view
          </span>
          <button type="button" className="btn small" onClick={() => updateLens(revealHidden(lens))}>
            Show
          </button>
        </div>
      )}
      {data.loading && <p className="muted">Loading</p>}
      {empty && (
        <section className="bd-empty-card" aria-label="Getting started">
          <div className="bd-empty-copy">
            <h2>{mode === "capital-projects" ? "No engineering deliverables yet" : "No software changes in flight yet"}</h2>
            <p className="small muted">
              Add your first card with {copy.newCta}, the "+ Add a card" field in Ready, or on the Packages page. Classify its data lane, and an intake agent drafts a package into Ready.
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
              onClick={() => document.querySelector<HTMLButtonElement>(".places-cta")?.click()}
            >
              + {copy.newCta} <kbd>C</kbd>
            </button>
            <Link to="/packages" className="btn">
              Open Packages
            </Link>
          </div>
        </section>
      )}
      {!empty && deferredSearch.trim().length > 0 && searchedCards.length === 0 && (
        <div className="bd-search-empty" role="status">
          <span className="small muted">No cards match "{deferredSearch.trim()}".</span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setSearchQuery("");
              searchInputRef.current?.focus();
            }}
          >
            Clear filter
          </button>
        </div>
      )}
      <div className={selectedId ? "bd-workspace has-drawer" : "bd-workspace"}>
        {lens.groupBy !== "none" && lanes.length > 0 ? (
          <div className="bd-lanes">
            {lanes.map((lane, idx) => (
              <section key={lane.key} className="bd-lane" aria-labelledby={`bd-lane-${lane.key}`}>
                <div className="bd-lane-head">
                  <h2 id={`bd-lane-${lane.key}`}>{lane.label}</h2>
                  <span className="mono muted">
                    {data.counts === "last-known" ? `Last known: ${lane.cards.length}` : lane.cards.length}
                  </span>
                </div>
                <div className="bd-board">{renderColumns(lane.cards, idx === 0, "h3", `bd-col-${lane.key}`)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="bd-board">{renderColumns(searchedCards, true, "h2", "bd-col")}</div>
        )}
        {selectedId && (
          <BoardReviewDrawer
            packageId={selectedId}
            {...(selectedCard ? { initialPkg: selectedCard.pkg } : {})}
            mode={mode}
            onClose={closeDrawer}
          />
        )}
      </div>
      <div className="bd-legend" aria-label="Color legend">
        <span className="bd-legend-title">Color: {COLOR_BY_LABEL[lens.colorBy]}</span>
        {legendItems.map((item) => (
          <span key={item.label} className="bd-legend-item">
            <i className="bd-legend-swatch" aria-hidden="true" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </span>
        ))}
        <span className="bd-legend-count mono">
          {data.counts === "unknown"
            ? "Counts unknown"
            : data.counts === "last-known"
              ? `Last known: ${searchedCards.length} of ${data.cards.length}`
              : `${searchedCards.length} of ${data.cards.length}`}
        </span>
      </div>
    </div>
  );
}
