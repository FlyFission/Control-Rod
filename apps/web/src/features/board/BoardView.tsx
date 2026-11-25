import { type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../../api/client.js";
import type { WorkspaceProjectArchivePayload, WorkspaceProjectUpdatePayload } from "../../api/types.js";
import { useActionLock } from "../../lib/scramLock.js";
import { COLUMNS } from "../../lib/board.js";
import { browserPasskeys } from "../../lib/decide.js";
import { type Kind, useLook } from "../../lib/kind.js";
import {
  COLOR_BY_LABEL,
  DEFAULT_LENS,
  type Lens,
  applyLens,
  edgeColor,
  isProtected,
  legendEntries,
  parseLens,
  revealHidden,
  writeLensToUrl,
} from "../../lib/lenses.js";
import { type EngineeringMode, MODE_COPY, PRO_LANE_SKILLS, useMode } from "../../lib/mode.js";
import {
  captureMatchesScope,
  deleteProject,
  loadProjects,
  packageMatchesScope,
  replaceProject,
  selectProject,
  switchModeAndSyncProject,
  useActiveProject,
  useProjects,
  WorkspaceProjectUser,
} from "../../lib/projects.js";
import { useAgents } from "../../lib/useAgents.js";
import { FirstRunGuide, type GuideState, guideOpen, useGuideHidden } from "./FirstRunGuide.js";
import { sessionGeneration, stillCurrent } from "../../lib/session.js";
import { BoardListView } from "./BoardListView.js";
import { BoardReviewDrawer } from "./BoardReviewDrawer.js";
import { Card, sinceText } from "./Card.js";
import { CaptureCard } from "./CaptureCard.js";
import { CaptureDrawer } from "./CaptureDrawer.js";
import { CardActions } from "./CardActions.js";
import { LensBar } from "./LensBar.js";
import { QuickAdd } from "./QuickAdd.js";
import { type SavedView, deleteView, loadViews, saveView } from "./savedViews.js";
import { DaemonNotice } from "../../components/DaemonNotice.js";
import { attentionFirst } from "./boardOrder.js";
import { OPEN_MODAL, singleKeysOn } from "../../lib/singleKeys.js";
import { type BoardCard, useBoardData } from "./useBoardData.js";
import { readString, writeString } from "../../lib/storage.js";
import { WorkLanesSetting } from "./WorkLanesSetting.js";
import "./board.css";

const VIEW_MODE_KEY = "cr.board-view";
type BoardViewMode = "board" | "list";
type ProjectChange =
  | { command: "project.workspace-update"; payload: WorkspaceProjectUpdatePayload }
  | { command: "project.workspace-archive"; payload: WorkspaceProjectArchivePayload };
function loadViewMode(): BoardViewMode {
  return readString(VIEW_MODE_KEY) === "list" ? "list" : "board";
}

function readInitialLens(): Lens {
  if (typeof window === "undefined") return DEFAULT_LENS;
  return parseLens(new URLSearchParams(window.location.search));
}

type Swimlane = { key: string; label: string; cards: BoardCard[] };

function BoardColumns({
  children,
  label,
  columnLabels,
}: {
  children: ReactNode;
  label: string;
  columnLabels: (typeof MODE_COPY)[EngineeringMode]["boardColumns"];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div className="bd-stages">
      <label className="bd-stage-jump">
        <span>Jump to stage</span>
        <select
          className="bd-lens-select"
          value=""
          onChange={(event) => {
            const board = scroller.current;
            const column = board?.querySelector<HTMLElement>(`.bd-col[data-column="${event.target.value}"]`);
            if (!board || !column) return;
            column.focus({ preventScroll: true });
            board.scrollTo({ left: column.offsetLeft - 2 });
          }}
        >
          <option value="" disabled>Choose a stage</option>
          {COLUMNS.map(({ id }) => <option key={id} value={id}>{columnLabels[id]}</option>)}
        </select>
      </label>
      <div className="bd-board" ref={scroller} role="region" aria-label={label}>{children}</div>
    </div>
  );
}

/** The board: the home page (spec 6.2). Status is derived from the record, never dragged. */
export function BoardView() {
  const qc = useQueryClient();
  const data = useBoardData();
  const look = useLook();
  const mode = useMode();
  const projectUser = useContext(WorkspaceProjectUser);
  const activeProject = useActiveProject();
  const scramLock = useActionLock();
  const copy = MODE_COPY[mode];
  const otherModes: EngineeringMode[] = (["software", "capital-projects", "nuclear-grade"] as const).filter(
    (m) => m !== mode,
  );
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectPending, setProjectPending] = useState(false);

  async function applyProjectChange(change: ProjectChange, fallback: string) {
    if (!projectUser || projectPending) return;
    const startedUnder = sessionGeneration();
    const queryKey = ["workspace-projects", projectUser];
    setProjectError(null);
    setProjectPending(true);
    try {
      const { options } = await api.adminCommandOptions(change.command, change.payload);
      if (!stillCurrent(startedUnder)) return;
      const assertion = await browserPasskeys.get(options);
      if (!stillCurrent(startedUnder)) return;
      const saved = change.command === "project.workspace-update"
        ? await api.updateWorkspaceProject(change.payload, assertion)
        : await api.archiveWorkspaceProject(change.payload, assertion);
      if (!stillCurrent(startedUnder)) return;
      await qc.cancelQueries({ queryKey });
      if (!stillCurrent(startedUnder)) return;
      if ("name" in saved) {
        replaceProject(projectUser, saved);
      } else {
        deleteProject(projectUser, saved.id);
      }
      qc.setQueryData(queryKey, loadProjects(projectUser));
      void qc.invalidateQueries({ queryKey });
      void qc.invalidateQueries({ queryKey: ["admin"] });
      // The Plant names its bays by the project's lanes.
      void qc.invalidateQueries({ queryKey: ["office-figures"] });
    } catch (err) {
      if (stillCurrent(startedUnder)) setProjectError(explain(err, fallback));
    } finally {
      if (stillCurrent(startedUnder)) setProjectPending(false);
    }
  }

  const projectReposQuery = useQuery({
    queryKey: ["repos", activeProject?.workspaceRoot ?? ""],
    queryFn: () => api.repos(activeProject?.workspaceRoot || undefined),
    enabled: activeProject !== null,
  });

  const scopedCards = useMemo(
    () => data.cards.filter((c) => packageMatchesScope(c.pkg, mode, activeProject)),
    [data.cards, mode, activeProject],
  );
  const scopedCaptures = useMemo(
    () => data.captures.filter((cap) => captureMatchesScope(cap, mode, activeProject)),
    [data.captures, mode, activeProject],
  );

  const [lens, setLens] = useState<Lens>(readInitialLens);
  const [views, setViews] = useState<SavedView[]>(() => loadViews(data.me));
  const [viewMode, setViewMode] = useState<BoardViewMode>(loadViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({});
  const [draggingCard, setDraggingCard] = useState<string | null>(null);
  const [trashOver, setTrashOver] = useState(false);
  // What N said when no card on the view carries a Needs you or Blocked mark (pattern AW3).
  const [jumpNote, setJumpNote] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const handleDismissCapture = useCallback(
    async (id: string) => {
      setProjectError(null);
      try {
        await api.dismissCapture(id);
        if (selectedCaptureId === id) setSelectedCaptureId(null);
        void qc.invalidateQueries({ queryKey: ["captures"] });
      } catch (err) {
        setProjectError(explain(err, "Could not dismiss capture."));
      }
    },
    [qc, selectedCaptureId],
  );

  function changeViewMode(next: BoardViewMode) {
    setViewMode(next);
    writeString(VIEW_MODE_KEY, next);
  }

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
  const empty = !data.loading && data.problems.length === 0 && scopedCards.length === 0 && scopedCaptures.length === 0;

  // The guided first run: each step is ticked from what the server and the person's settings say.
  const agents = useAgents();
  const projects = useProjects();
  const [guideHidden, hideGuide] = useGuideHidden(data.me);
  const guide: GuideState = {
    agentReady: agents.rows.some((r) => r.seated && r.state === "ready"),
    hasRepoProject: projects.some((p) => (p.repo ?? "").trim().length > 0),
    // The change steps read this board's scope, so the button can always reach the card they name.
    hasCard: scopedCards.length > 0 || scopedCaptures.length > 0,
    released: scopedCards.some((c) => c.pkg.status !== "draft"),
    // Any accepted change anywhere means the person has done the whole loop once.
    accepted: data.cards.some((c) => c.pkg.status === "accepted"),
  };
  const showGuide = !data.loading && data.problems.length === 0 && !agents.loading && data.me !== "" && guideOpen(guide, guideHidden);
  const guideCard = guide.released
    ? scopedCards.find((c) => c.column === "needs-signature" || c.column === "person-verifies")
    : scopedCards.find((c) => c.pkg.status === "draft");
  const openNewChange = () => {
    const cta = document.querySelector<HTMLButtonElement>(".places-cta");
    if (cta && !cta.disabled) cta.click();
  };
  // Counts are facts only after a successful read; after a failed refresh, a drop not yet recovered
  // from, or while the stream is unknown they are what was last read, and before any read they are
  // not shown. Each count also needs every read it is made from (Codex round 3).
  const countsKnown = data.counts !== "unknown";
  const count = (c: "current" | "last-known" | "unknown", n: number, words: string, label: string) =>
    c === "unknown" ? `${label}: unknown` : `${c === "last-known" ? "Last known: " : ""}${n} ${words}`;

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const { shown: lensCards } = useMemo(
    () => applyLens(scopedCards, lens, data.me),
    [scopedCards, lens, data.me],
  );
  const filteredCards = useMemo(() => {
    if (!trimmedSearch) return lensCards;
    return lensCards.filter(
      (c) =>
        c.pkg.title.toLowerCase().includes(trimmedSearch) ||
        c.pkg.id.toLowerCase().includes(trimmedSearch) ||
        (c.pkg.project ?? "").toLowerCase().includes(trimmedSearch) ||
        (c.owner ?? "").toLowerCase().includes(trimmedSearch),
    );
  }, [lensCards, trimmedSearch]);
  const visibleCaptures = useMemo(() => {
    if (!trimmedSearch) return scopedCaptures;
    return scopedCaptures.filter(
      (cap) => cap.text.toLowerCase().includes(trimmedSearch) || cap.id.toLowerCase().includes(trimmedSearch),
    );
  }, [scopedCaptures, trimmedSearch]);

  // Reset transient view state when switching engineering mode or active project.
  useEffect(() => {
    setSelectedId(null);
    setSelectedCaptureId(null);
    setSearchQuery("");
    setExpandedCols({});
    setProjectError(null);
  }, [mode, activeProject?.id]);

  // Verification and signature work remains accounted for across search, lenses, and scope changes.
  const protectedCards = useMemo(() => data.cards.filter(isProtected), [data.cards]);
  const visibleProtected = filteredCards.filter(isProtected).length;
  const hiddenInMode =
    protectedCards.filter((c) => packageMatchesScope(c.pkg, mode, null)).length - visibleProtected;
  const noMatches = !data.loading && data.problems.length === 0 && !unknown &&
    !empty && filteredCards.length === 0 && visibleCaptures.length === 0;
  const hiddenProtected = protectedCards.length - visibleProtected;
  const otherModeGroups = useMemo(
    () =>
      otherModes
        .map((m) => ({
          mode: m,
          label: MODE_COPY[m].label,
          count: data.cards.filter(
            (c) => !packageMatchesScope(c.pkg, mode, null) && packageMatchesScope(c.pkg, m, null),
          ).length,
          protectedCount: protectedCards.filter(
            (c) =>
              !packageMatchesScope(c.pkg, mode, null) &&
              packageMatchesScope(c.pkg, m, null),
          ).length,
        }))
        .filter((g) => g.count > 0),
    [data.cards, mode, otherModes, protectedCards],
  );
  const nextReviewMode = otherModeGroups.find((g) => g.protectedCount > 0)?.mode;
  const scopedNeedsYou = useMemo(
    () => scopedCards.filter((c) => c.next.tone === "needs" || c.next.tone === "block").length,
    [scopedCards],
  );
  const scopedAgentsRunning = useMemo(
    () => scopedCards.filter((c) => c.runActive).length,
    [scopedCards],
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
          cards: filteredCards.filter((c) => (lens.kind !== "all" ? lens.kind === d.key : c.kinds[0] === d.key)),
        }))
        .filter((l) => l.cards.length > 0);
    }
    if (lens.groupBy === "person") {
      const map = new Map<string, BoardCard[]>();
      for (const c of filteredCards) {
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
    for (const c of filteredCards) {
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
  }, [filteredCards, lens.groupBy, lens.kind, data.projects]);

  const legendItems = useMemo(
    () => legendEntries(filteredCards, lens, copy.boardColumns),
    [filteredCards, lens, copy.boardColumns],
  );

  const selectedCard = useMemo(
    () => (selectedId ? data.cards.find((x) => x.pkg.id === selectedId) : undefined),
    [data.cards, selectedId],
  );
  const selectedCapture = useMemo(
    () => (selectedCaptureId ? data.captures.find((x) => x.id === selectedCaptureId) : undefined),
    [data.captures, selectedCaptureId],
  );
  const hasDrawer = Boolean(selectedId || selectedCapture);

  const closeDrawer = useCallback(() => {
    setSelectedId(null);
    setSelectedCaptureId(null);
    const el = triggerRef.current;
    triggerRef.current = null;
    if (el) {
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  // J / K move across visible board card titles; N jumps to the next one marked Needs you or Blocked.
  // N reads the stream through a ref, so a card's tone is trusted only while the board is live.
  const streamRef = useRef(data.status);
  streamRef.current = data.status;
  const capturesFreshRef = useRef(data.capturesFresh);
  capturesFreshRef.current = data.capturesFresh;
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
      if (document.querySelector(OPEN_MODAL)) return;
      if (!singleKeysOn()) return;
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "n") return;
      const titles = Array.from(document.querySelectorAll<HTMLButtonElement>(".bd-board button.bd-title, .bd-list button.bd-title"));
      // The current position is the card holding focus, whichever of its controls has it (the title,
      // Move to, or another button), so N and J/K continue from that card.
      const holder = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("article.bd-card, .bd-list-row");
      const idx = titles.findIndex((t) => t === document.activeElement || (holder != null && t.closest("article.bd-card, .bd-list-row") === holder));
      if (key === "n") {
        e.preventDefault();
        // A capture row keeps its tone from its last read; while the stream is not live, nothing on
        // screen is current, so N does not send anyone to it.
        if (streamRef.current !== "live") {
          setJumpNote("N works while the board is live; it is showing last-known state now.");
          return;
        }
        // The tone is shown only while the stream is live and the card's reads are current, so a card
        // whose state is unknown is never offered as needing you.
        const marked = titles.filter((t) => {
          const holder = t.closest<HTMLElement>("article.bd-card, .bd-list-row");
          // A capture whose last read failed or predates the latest drop keeps its old tone on
          // screen; it may already be resolved, so N never sends anyone to it.
          if (holder?.dataset["kind"] === "capture" && !capturesFreshRef.current) return false;
          const tone = holder?.dataset["tone"];
          return tone === "needs" || tone === "block";
        });
        const next = marked.find((t) => titles.indexOf(t) > idx) ?? marked[0];
        if (next === undefined) {
          setJumpNote("No card on this view is currently marked Needs you or Blocked.");
          return;
        }
        setJumpNote(null);
        next.focus();
        return;
      }
      if (titles.length === 0) return;
      e.preventDefault();
      setJumpNote(null);
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

  function handleLaneAgentChange(colId: "drafting" | "agent-check", eco: "claude" | "codex") {
    if (!activeProject) return;
    const laneAgents = { ...activeProject.laneAgents, [colId]: eco };
    const effectiveAuthor = laneAgents.drafting ?? activeProject.author.ecosystem;
    const effectiveChecker = laneAgents["agent-check"] ?? activeProject.checker.ecosystem;
    if (effectiveAuthor === effectiveChecker) {
      laneAgents[colId === "drafting" ? "agent-check" : "drafting"] = eco === "claude" ? "codex" : "claude";
    }
    void applyProjectChange({
      command: "project.workspace-update",
      payload: { project_id: activeProject.id, patch: { laneAgents } },
    }, "Could not update lane agent oversight.");
  }

  // Compact cards are one line each, so a column holds three times as many before it folds.
  const COLUMN_FOLD_LIMIT = lens.density === "compact" ? 24 : 8;

  const renderColumns = (cards: BoardCard[], includeReadyExtras: boolean, Heading: "h2" | "h3", idPrefix: string) =>
    COLUMNS.map((c) => {
      const here = attentionFirst(cards.filter((x) => x.column === c.id), data.status);
      const headingId = `${idPrefix}-${c.id}`;
      const colKey = `${idPrefix}:${c.id}`;
      const isExpanded = Boolean(expandedCols[colKey]);
      const visible = isExpanded || here.length <= COLUMN_FOLD_LIMIT ? here : here.slice(0, COLUMN_FOLD_LIMIT);
      const hiddenCount = here.length - visible.length;
      const laneAgentCol = c.id === "drafting" || c.id === "agent-check" ? c.id : null;
      const laneAgentValue =
        laneAgentCol && activeProject
          ? (activeProject.laneAgents?.[laneAgentCol] ??
              (laneAgentCol === "drafting" ? activeProject.author.ecosystem : activeProject.checker.ecosystem))
          : null;
      const laneSkills = mode === "nuclear-grade" ? PRO_LANE_SKILLS[c.id] : [];
      return (
        <section key={c.id} className="bd-col" data-column={c.id} aria-labelledby={headingId} tabIndex={-1}>
          <div className="bd-col-head">
            <Heading id={headingId}>{copy.boardColumns[c.id]}</Heading>
            <div className="bd-col-head-right">
              {laneAgentCol && activeProject && laneAgentValue && (
                <select
                  className="bd-col-agent-select"
                  aria-label={`Agent oversight for ${copy.boardColumns[c.id]}`}
                  title={`Agent runtime for ${copy.boardColumns[c.id]}`}
                  value={laneAgentValue}
                  disabled={projectPending}
                  onChange={(e) => handleLaneAgentChange(laneAgentCol, e.target.value as "claude" | "codex")}
                >
                  <option value="claude">Claude</option>
                  <option value="codex">Codex</option>
                </select>
              )}
              {countsKnown ? (
                <span className="mono muted">{here.length}</span>
              ) : (
                <span className="mono muted">
                  <span aria-hidden="true">?</span>
                  <span className="sr-only">count unknown</span>
                </span>
              )}
            </div>
          </div>
          {laneSkills.length > 0 && (
            <details className="bd-col-skills-wrap" aria-label={`Wired PRO skills for ${copy.boardColumns[c.id]}`}>
              <summary className="bd-col-skills-toggle">PRO skills ({laneSkills.length})</summary>
              <ul className="bd-col-skills-list">
                {laneSkills.map((sk) => (
                  <li key={sk.name} className="bd-col-skill-item">
                    <span className="mono">{sk.name}</span>
                    <span className="small muted">{sk.summary}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {includeReadyExtras && c.id === "ready" && <QuickAdd />}
          {includeReadyExtras &&
            c.id === "ready" &&
            visibleCaptures.map((cap) => (
              <CaptureCard
                key={cap.id}
                capture={cap}
                selected={selectedCaptureId === cap.id}
                onDismiss={() => void handleDismissCapture(cap.id)}
                onDragStartCard={() => setDraggingCard(cap.id)}
                onDragEndCard={() => {
                  setDraggingCard(null);
                  setTrashOver(false);
                }}
                onOpen={() => {
                  triggerRef.current = document.activeElement as HTMLElement | null;
                  setSelectedId(null);
                  setSelectedCaptureId(cap.id);
                }}
              />
            ))}
          {visible.map((x) => (
            <Card
              key={x.pkg.id}
              pkg={x.pkg}
              kinds={x.kinds}
              next={x.next}
              column={x.column}
              stream={data.status}
              runRunning={x.runRunning === true}
              {...(x.author ? { author: x.author } : {})}
              {...(x.checker ? { checker: x.checker } : {})}
              lastKnown={x.lastKnown}
              nuclear={x.nuclear}
              selected={selectedId === x.pkg.id}
              edgeColor={edgeColor(x, lens)}
              compact={lens.density === "compact"}
              {...(data.splits.get(x.pkg.id) ? { split: data.splits.get(x.pkg.id)! } : {})}
              actions={<CardActions card={x} />}
              {...(data.unknownSince ? { unknownSince: data.unknownSince } : {})}
              {...(x.owner ? { owner: x.owner } : {})}
              {...(x.retry ? { onRetry: x.retry } : {})}
              onOpen={() => {
                triggerRef.current = document.activeElement as HTMLElement | null;
                setSelectedCaptureId(null);
                setSelectedId(x.pkg.id);
              }}
            />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="btn small bd-col-more"
              onClick={() => setExpandedCols((prev) => ({ ...prev, [colKey]: true }))}
            >
              Show {hiddenCount} more
            </button>
          )}
          {isExpanded && here.length > COLUMN_FOLD_LIMIT && (
            <button
              type="button"
              className="btn small bd-col-more"
              onClick={() => setExpandedCols((prev) => ({ ...prev, [colKey]: false }))}
            >
              Show fewer
            </button>
          )}
        </section>
      );
    });

  return (
    <div className="bd" data-look={look} data-mode={mode} data-density={lens.density}>
      <header className="bd-head">
        <div className="bd-head-top">
          <h1 id="board-title">{activeProject ? activeProject.name : "Board"}</h1>
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
                  {count(data.needsYouCounts, scopedNeedsYou, "needs you", "Needs you")}
                </button>
              )}
              <span>
                {count(data.agentsRunningCounts, scopedAgentsRunning, `${scopedAgentsRunning === 1 ? "agent" : "agents"} running or queued`, "Agents running or queued")}
              </span>
            </p>
          ) : (
            <p className="bd-counts">Counts unknown until the work is read</p>
          )}
          <div className="bd-head-controls">
            <input
              ref={searchRef}
              type="search"
              className="bd-search-input"
              aria-label="Search board"
              placeholder="Search cards…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="bd-lens-seg" role="group" aria-label="View layout">
              <button
                type="button"
                className="bd-lens-btn"
                aria-pressed={viewMode === "board"}
                onClick={() => changeViewMode("board")}
              >
                Board
              </button>
              <button
                type="button"
                className="bd-lens-btn"
                aria-pressed={viewMode === "list"}
                onClick={() => changeViewMode("list")}
              >
                List
              </button>
            </div>
          </div>
        </div>
        {activeProject && (
          <div className="bd-project-bar" role="region" aria-label="Active project settings">
            <div className="bd-project-bar-left">
              <span className="tag">{copy.label}</span>
              <label className="bd-project-repo-ctl">
                <span className="small muted">Default repo:</span>
                <select
                  aria-label="Project default repository"
                  className="bd-lens-select"
                  value={activeProject.repo}
                  disabled={projectPending}
                  onChange={(e) => {
                    void applyProjectChange({
                      command: "project.workspace-update",
                      payload: { project_id: activeProject.id, patch: { repo: e.target.value } },
                    }, "Could not update default repository.");
                  }}
                >
                  <option value="">No default repo</option>
                  {(projectReposQuery.data?.local ?? []).length > 0 && (
                    <optgroup label="Local clones">
                      {projectReposQuery.data!.local.map((r) => (
                        <option key={`pl-${r.name}`} value={r.name}>
                          {r.name} ({r.branch})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(projectReposQuery.data?.github ?? []).length > 0 && (
                    <optgroup label="GitHub">
                      {projectReposQuery.data!.github.map((g) => (
                        <option key={`pg-${g.name_with_owner}`} value={g.name_with_owner}>
                          {g.name_with_owner}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {activeProject.repo &&
                    !(projectReposQuery.data?.local ?? []).some((r) => r.name === activeProject.repo) &&
                    !(projectReposQuery.data?.github ?? []).some((g) => g.name_with_owner === activeProject.repo) && (
                      <option value={activeProject.repo}>{activeProject.repo}</option>
                    )}
                </select>
              </label>
              <WorkLanesSetting
                key={`${activeProject.id}:${JSON.stringify(activeProject.work_lanes ?? null)}`}
                current={activeProject.work_lanes}
                pending={projectPending}
                onSave={(work_lanes) =>
                  void applyProjectChange({
                    command: "project.workspace-update",
                    payload: { project_id: activeProject.id, patch: { work_lanes } },
                  }, "Could not update the Plant bays.")
                }
              />
              <span className="mono small muted">
                {activeProject.laneAgents?.drafting ?? activeProject.author.ecosystem} →{" "}
                {activeProject.laneAgents?.["agent-check"] ?? activeProject.checker.ecosystem}
              </span>
            </div>
            <div className="bd-project-bar-actions">
              <button type="button" className="btn small" onClick={() => selectProject(projectUser, null)}>
                All {copy.label}
              </button>
              <button
                type="button"
                className="btn small"
                disabled={projectPending}
                onClick={() => void applyProjectChange({
                  command: "project.workspace-archive",
                  payload: { project_id: activeProject.id },
                }, "Could not archive project.")}
              >
                Archive project
              </button>
            </div>
          </div>
        )}
        <LensBar
          lens={lens}
          cards={scopedCards}
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
        {projectError && (
          <p className="bd-unknown" role="alert">
            <span>{projectError}</span>
          </p>
        )}
      </header>
      <p className="sr-only" role="status">
        {jumpNote ?? ""}
      </p>
      {jumpNote !== null && (
        <p className="bd-jump-note muted small" aria-hidden="true">
          {jumpNote}
        </p>
      )}
      {hiddenProtected > 0 && (
        <div className="bd-guard" role="status">
          <span>
            {hiddenProtected} {hiddenProtected === 1 ? "card waiting" : "cards waiting"} on verification or signature hidden by this view
          </span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setSearchQuery("");
              selectProject(projectUser, null);
              updateLens(revealHidden(lens));
              if (hiddenInMode <= 0 && nextReviewMode) {
                switchModeAndSyncProject(projectUser, nextReviewMode);
              }
            }}
          >
            Show
          </button>
        </div>
      )}
      {otherModeGroups.length > 0 && hiddenProtected === 0 && (
        <div className="bd-guard" role="status">
          <span>
            {otherModeGroups
              .map((g) => `${g.count} ${g.count === 1 ? "package" : "packages"} in ${g.label}`)
              .join(" · ")}
          </span>
          <div className="bd-project-bar-actions">
            {otherModeGroups.map((g) => (
              <button
                key={g.mode}
                type="button"
                className="btn small"
                onClick={() => switchModeAndSyncProject(projectUser, g.mode)}
              >
                Switch to {g.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {data.loading && <p className="bd-board-feedback muted" role="status">Loading</p>}
      {noMatches && (
        <div className="bd-board-feedback" role="status">
          <span>No cards match this view.</span>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setSearchQuery("");
              updateLens(revealHidden(lens));
              searchRef.current?.focus();
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {showGuide && (
        <FirstRunGuide
          state={guide}
          mode={mode}
          onNewChange={openNewChange}
          onHide={hideGuide}
          newChangeLocked={scramLock.locked ? (scramLock.why ?? "Held by a SCRAM") : undefined}
          onOpenCard={guideCard ? () => setSelectedId(guideCard.pkg.id) : undefined}
        />
      )}
      {empty && !showGuide && (
        <section className="bd-empty-card" aria-label="Getting started">
          <div className="bd-empty-copy">
            <h2>
              {mode === "capital-projects"
                ? "No engineering deliverables yet"
                : mode === "nuclear-grade"
                  ? "No Nuclear-Grade change packets yet"
                  : "No software changes in flight yet"}
            </h2>
            <p className="small muted">
              Describe what you want done. An agent drafts a plan, and nothing runs until you approve it.
            </p>
          </div>
          <div className="bd-empty-actions">
            <button
              type="button"
              className="btn primary"
              disabled={scramLock.locked}
              title={scramLock.why}
              onClick={openNewChange}
            >
              + {copy.newCta} <kbd>C</kbd>
            </button>
          </div>
        </section>
      )}
      <div className={hasDrawer ? "bd-workspace has-drawer" : "bd-workspace"}>
        {viewMode === "list" ? (
          <BoardListView
            cards={filteredCards}
            captures={visibleCaptures}
            mode={mode}
            stream={data.status}
            {...(data.unknownSince ? { unknownSince: data.unknownSince } : {})}
            selectedId={selectedId}
            selectedCaptureId={selectedCaptureId}
            onSelectCard={(id) => {
              triggerRef.current = document.activeElement as HTMLElement | null;
              setSelectedCaptureId(null);
              setSelectedId(id);
            }}
            onSelectCapture={(id) => {
              triggerRef.current = document.activeElement as HTMLElement | null;
              setSelectedId(null);
              setSelectedCaptureId(id);
            }}
          />
        ) : lens.groupBy !== "none" && lanes.length > 0 ? (
          <div className="bd-lanes">
            {lanes.map((lane, idx) => (
              <section key={lane.key} className="bd-lane" aria-labelledby={`bd-lane-${lane.key}`}>
                <div className="bd-lane-head">
                  <h2 id={`bd-lane-${lane.key}`}>{lane.label}</h2>
                  <span className="mono muted">
                    {data.counts === "last-known" ? `Last known: ${lane.cards.length}` : lane.cards.length}
                  </span>
                </div>
                <BoardColumns label={`${lane.label} stages`} columnLabels={copy.boardColumns}>
                  {renderColumns(lane.cards, idx === 0, "h3", `bd-col-${lane.key}`)}
                </BoardColumns>
              </section>
            ))}
          </div>
        ) : (
          <BoardColumns label="Work stages" columnLabels={copy.boardColumns}>
            {renderColumns(filteredCards, true, "h2", "bd-col")}
          </BoardColumns>
        )}
        {selectedId && (
          <BoardReviewDrawer
            packageId={selectedId}
            {...(selectedCard ? { initialPkg: selectedCard.pkg } : {})}
            mode={mode}
            onClose={closeDrawer}
          />
        )}
        {selectedCapture && <CaptureDrawer key={selectedCapture.id} capture={selectedCapture} onClose={closeDrawer} />}
      </div>
      {draggingCard && (
        <div
          className={trashOver ? "bd-trash-zone active" : "bd-trash-zone"}
          role="region"
          aria-label="Drop capture here to dismiss"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (!trashOver) setTrashOver(true);
          }}
          onDragLeave={() => setTrashOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setTrashOver(false);
            setDraggingCard(null);
            void handleDismissCapture(draggingCard);
          }}
        >
          <span aria-hidden="true">🗑</span>
          <span>
            {trashOver
              ? `Release to dismiss ${draggingCard}`
              : `Drop here to dismiss ${draggingCard}`}
          </span>
        </div>
      )}
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
              ? `Last known: ${filteredCards.length} of ${scopedCards.length}`
              : `${filteredCards.length} of ${scopedCards.length}`}
        </span>
      </div>
    </div>
  );
}
