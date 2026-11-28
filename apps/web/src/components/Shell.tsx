import { type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CloseX } from "./CloseX.js";
import { AgentUpdates } from "./AgentUpdates.js";
import { UpdateNotice } from "./UpdateNotice.js";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { BrandMark } from "../pages/SignIn.js";
import { ScramBanner, useScrams } from "../features/office/Scram.js";
import { rodState } from "../features/office/plant-instruments.js";
import { lockFrom, lockedFor, ScramLockContext } from "../lib/scramLock.js";
import { usePresenting } from "../lib/presenting.js";
import { useLiveStatus } from "../lib/live.js";
import { useLook } from "../lib/kind.js";
import { MODE_COPY, saveMode, useMode, type EngineeringMode } from "../lib/mode.js";
import {
  hydrateServerProjects,
  selectProject,
  switchModeAndSyncProject,
  useActiveProject,
  useProjects,
  WorkspaceProjectUser,
} from "../lib/projects.js";
import { PLACES, type PlaceGroup } from "../places/places.js";
import { ActiveRuns } from "./ActiveRuns.js";
import { ScramSwitch } from "./ScramSwitch.js";
import { CommandPalette } from "./CommandPalette.js";
import { NewWorkModal } from "./NewWorkModal.js";
import { ProjectModal } from "./ProjectModal.js";
import { ShortcutHelp } from "./ShortcutHelp.js";
import { OPEN_MODAL, singleKeysOn, useSingleKeysOn } from "../lib/singleKeys.js";
import { useAttentionSignals } from "../lib/useAttentionSignals.js";
import { adoptSession, sessionGeneration, stillCurrent } from "../lib/session.js";
import { useFirstRunSetup } from "../lib/firstRun.js";
import { readString, writeString } from "../lib/storage.js";
import { PHONE_QUERY, useMedia } from "../lib/useMedia.js";
import { SidePanelProvider, SidePanelSlot, useSidePanelHost } from "./SidePanel.js";
import { CardPanelContext, type CardOpen } from "./CardPanel.js";
import { BoardReviewDrawer } from "../features/board/BoardReviewDrawer.js";
import { SIDE_MAX_PX, SIDE_MIN_PX, loadSideWidth, saveSideWidth } from "../lib/sidePanelLayout.js";
import { Group, Panel, Separator, usePanelRef, type PanelSize } from "react-resizable-panels";
import {
  RAIL_DEFAULT_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
  loadRailLayout,
  saveRailLayout,
} from "../lib/railLayout.js";
import "./shell.css";

const COLLAPSED_GROUPS_KEY = "cr.nav-collapsed";
const COLLAPSIBLE_GROUPS = new Set<PlaceGroup>(["Audit", "Control / Setup"]);

function loadCollapsedGroups(): Record<string, boolean> {
  const raw = readString(COLLAPSED_GROUPS_KEY);
  if (!raw) return { Audit: true };
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : { Audit: true };
  } catch {
    return { Audit: true };
  }
}

const MODES: { id: EngineeringMode; label: string }[] = [
  { id: "software", label: "Software" },
  { id: "capital-projects", label: "Capital Projects" },
  { id: "nuclear-grade", label: "Nuclear-Grade" },
];

/**
 * Whether the SCRAM the lamp describes is still stopping (its stop not yet recorded): an organization
 * SCRAM if one holds, else the project SCRAMs, else drills. Matches what rodState captions.
 */
function scramStopping(scrams: readonly { scram: { scope: string; drill?: boolean }; stopped?: unknown }[] | undefined): boolean {
  const list = scrams ?? [];
  const real = list.filter((x) => !x.scram.drill);
  const org = real.find((x) => x.scram.scope === "organization");
  const described = org ? [org] : real.length > 0 ? real : list;
  return described.some((x) => !x.stopped);
}

const PLACE_GROUPS: readonly PlaceGroup[] = ["Work", "Audit", "Control / Setup"];

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The places the phone's bottom bar names; every other place sits under More. */
const BAR_PLACES = ["/", "/plant", "/inbox", "/today"];

/** The Inbox count beside its place: nothing when empty, and a mark when the Inbox could not be read. */
function InboxBadge({ needs, failed }: { needs: number; failed: boolean }) {
  if (failed) {
    return (
      <span className="badge" data-error="" aria-label="Inbox could not be read" title="Inbox could not be read">
        !
      </span>
    );
  }
  if (needs <= 0) return null;
  return (
    <span className="badge" aria-label={`${needs} waiting on you`}>
      {needs}
    </span>
  );
}

/**
 * The phone's navigation: Board, Plant, Inbox, Today and More along the bottom, each at least 44 px
 * tall. More opens a sheet with every other place, the engineering mode, search, runs and sign out.
 */
function PhoneBar({
  needs,
  inboxFailed,
  moreOpen,
  setMoreOpen,
  mode,
  projectUser,
  user,
  pendingSignOut,
  onSignOut,
  onSearch,
  onNewProject,
}: {
  needs: number;
  inboxFailed: boolean;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  mode: EngineeringMode;
  projectUser: string | undefined;
  user: string | undefined;
  pendingSignOut: boolean;
  onSignOut: () => void;
  onSearch: () => void;
  /** Opens the workspace project form; on a phone the rail's "+" is gone, so More carries it. */
  onNewProject: () => void;
}) {
  const moreBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    sheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" && sheet.current) {
        // A modal sheet keeps Tab inside itself: wrap from the last control to the first and back.
        const items = [...sheet.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const at = document.activeElement;
        if (!sheet.current.contains(at)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && at === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && at === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setMoreOpen(false);
      moreBtn.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen, setMoreOpen]);
  const byTo = (to: string) => PLACES.find((p) => p.to === to);
  const rest = PLACES.filter((p) => !BAR_PLACES.includes(p.to));
  return (
    <>
      {moreOpen && (
        <div className="more-scrim" onClick={() => { setMoreOpen(false); moreBtn.current?.focus(); }}>
          <div
            ref={sheet}
            className="more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="more-head">
              <span className="more-title">More</span>
              <CloseX onClose={() => { setMoreOpen(false); moreBtn.current?.focus(); }} label="Close menu" />
            </div>
            <ul className="more-list">
              {PLACE_GROUPS.map((group) => {
                const items = rest.filter((p) => p.group === group);
                if (items.length === 0) return null;
                return (
                  <li key={group}>
                    <span className="more-group">{group}</span>
                    <ul>
                      {items.map((p) => (
                        <li key={p.to}>
                          <Link to={p.to} className="more-link" activeProps={{ "aria-current": "page" }}>
                            {p.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            <div className="more-tools">
              <button type="button" className="btn small" onClick={onSearch}>
                Search
              </button>
              <button type="button" className="btn small" onClick={onNewProject}>
                New project
              </button>
              <ActiveRuns />
            </div>
            <div className="more-mode seg" role="group" aria-label="Engineering mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={mode === m.id ? "active" : ""}
                  aria-pressed={mode === m.id}
                  onClick={() => switchModeAndSyncProject(projectUser, m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="more-foot">
              <span className="user-chip">
                <span className="rail-avatar" aria-hidden="true">
                  {userInitial(user)}
                </span>
                <span>{user ?? "Signed in"}</span>
              </span>
              <button type="button" className="btn small" disabled={pendingSignOut} onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
      <nav aria-label="Primary" className="bottom-bar">
        {BAR_PLACES.map((to) => {
          const p = byTo(to);
          if (!p) return null;
          return (
            <Link
              key={to}
              to={p.to}
              className="bar-link"
              activeOptions={{ exact: to === "/" }}
              activeProps={{ className: "bar-link active", "aria-current": "page" }}
            >
              <BarGlyph to={to} />
              <span>{p.label}</span>
              {to === "/inbox" && <InboxBadge needs={needs} failed={inboxFailed} />}
            </Link>
          );
        })}
        <button
          ref={moreBtn}
          type="button"
          className={moreOpen ? "bar-link active" : "bar-link"}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <BarGlyph to="more" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

/** One plain stroke glyph per bar place: geometry drawn for this app, never a vendor mark. */
function BarGlyph({ to }: { to: string }) {
  const d: Record<string, string> = {
    "/": "M3 4h4v12H3ZM8.5 4h3v8h-3ZM13 4h4v5h-4Z",
    "/plant": "M10 3.5v3M10 13.5v3M3.5 10h3M13.5 10h3M10 7.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z",
    "/inbox": "M3 11h4l1 2h4l1-2h4M3 11l2-6h10l2 6v4H3Z",
    "/today": "M3.5 5h13v11h-13ZM3.5 8.5h13M7 3v3M13 3v3",
    more: "M4.5 10h.01M10 10h.01M15.5 10h.01",
  };
  return (
    <svg className="bar-glyph" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d={d[to] ?? d["more"]!} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function userInitial(name: string | undefined): string {
  const s = (name ?? "U").trim();
  return (s[0] ?? "U").toUpperCase();
}

/**
 * The shell (specification 12; plan task 3.1): a resizable, collapsible navigation rail + operational topbar +
 * scrollable workspace, Inbox count, mode/look switchers, and command palette (Ctrl+K / Cmd+K).
 */
export function Shell({ session, children }: { session: Session; children: ReactNode }) {
  return (
    <WorkspaceProjectUser value={session.signed_in ? session.user : undefined}>
      <WorkspaceShell session={session}>{children}</WorkspaceShell>
    </WorkspaceProjectUser>
  );
}

/** Room for the page and the side panel side by side; narrower, the panel slides over the page. */
const SIDE_DOCK_QUERY = "(min-width: 1180px)";
/** The page keeps at least this much beside the side panel. */
const PAGE_MIN_PX = 420;

function WorkspaceShell({ session, children }: { session: Session; children: ReactNode }) {
  const qc = useQueryClient();
  const projectUser = useContext(WorkspaceProjectUser);
  // Only what waits on this person counts (OV-01); work waiting on someone else never does.
  const inbox = useQuery({ queryKey: ["inbox", session.user ?? "", "badge"], queryFn: () => api.inbox() });
  const serverProjects = useQuery({
    queryKey: ["workspace-projects", projectUser],
    queryFn: () => api.workspaceProjects(),
    enabled: Boolean(projectUser),
    retry: false,
  });
  // The trip pulses stop while the tab is hidden, as the plant's own motion does (OfficeStage useVisible).
  const [tabHidden, setTabHidden] = useState(() => document.visibilityState === "hidden");
  useEffect(() => {
    const on = () => setTabHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    if (serverProjects.data) {
      hydrateServerProjects(projectUser, serverProjects.data);
    }
  }, [projectUser, serverProjects.data]);
  const needs = inbox.data?.items.length ?? 0;
  // A failed read is not an empty Inbox: the badge says it could not count, rather than showing nothing.
  const inboxFailed = inbox.isError && !inbox.data;
  // SCRAM is app-wide (control room redesign, section 6.6): one read feeds the banner, the SCRAM lamp,
  // the frame and the locks, on every screen.
  const presenting = usePresenting();
  const scramRead = useScrams(presenting);
  const scrams = scramRead.data?.scrams;
  const lock = useMemo(() => lockFrom(scrams), [scrams]);
  const rods = rodState({ data: scramRead.data, failed: scramRead.isError, at: scramRead.dataUpdatedAt });
  const scramKind = scrams === undefined ? "unknown" : scrams.some((x) => !x.scram.drill) ? "trip" : scrams.length > 0 ? "drill" : "clear";
  const live = useLiveStatus();
  const [palette, setPalette] = useState(false);
  const [newWorkOpen, setNewWorkOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(loadCollapsedGroups);
  function toggleGroup(group: PlaceGroup) {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      writeString(COLLAPSED_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  }
  const [helpOpen, setHelpOpen] = useState(false);
  const phone = useMedia(PHONE_QUERY);
  // Details open in one side panel (components/SidePanel.tsx): a resizable pane beside the page when
  // there is room for both, sliding over the page from the right when there is not.
  const sideDocked = useMedia(SIDE_DOCK_QUERY) && !phone;
  const side = useSidePanelHost(sideDocked);
  const sideUser = session.signed_in ? session.user : undefined;
  const sidePanel = usePanelRef();
  // A file open in the panel widens it as far as the page allows; closing the file returns the
  // person's own width. Neither is saved: only their drags are.
  useEffect(() => {
    if (!side.open || !sideDocked || side.full) return;
    const frame = window.requestAnimationFrame(() => {
      const p = sidePanel.current;
      const group = document.querySelector<HTMLElement>(".work-panes");
      if (!p || !group) return;
      const own = loadSideWidth(sideUser);
      const room = group.getBoundingClientRect().width - PAGE_MIN_PX;
      const target = side.wide ? Math.max(own, Math.min(SIDE_MAX_PX, room)) : own;
      try {
        p.resize(`${Math.round(target)}px`);
      } catch {
        // The panel registers with its group a frame after it mounts; the next change retries.
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side.wide, side.full]);
  function persistSideSoon(chosen: boolean) {
    if (!chosen) return;
    // As with the rail, the panel's own size reads the new value on the next task.
    window.setTimeout(() => {
      const p = sidePanel.current;
      if (p) saveSideWidth(sideUser, p.getSize().inPixels);
    }, 0);
  }
  // The desktop rail: drag its edge to widen or narrow it, or tuck it away with the top bar's button
  // or `[`. Width and tucked state are this person's own, kept in this browser (lib/railLayout.ts).
  const railUser = session.signed_in ? session.user : undefined;
  const [railStart] = useState(() => loadRailLayout(railUser));
  const railPanel = usePanelRef();
  const keysOn = useSingleKeysOn();
  // The width the person chose. Only their own drags, key presses, double-clicks and the toggle change
  // it: a narrow window that squeezes the rail for the workspace's minimum never does.
  const railWidth = useRef(railStart.width);
  const [railCollapsed, setRailCollapsed] = useState(railStart.collapsed);
  function onRailResize(size: PanelSize) {
    setRailCollapsed(size.inPixels < 1);
  }
  // The library reports a finished layout before the panel's own size reads the new value: read it on
  // the next task, once it does.
  // Hiding or showing with the toggle, `[` or Enter on the handle saves visibility only: a rail
  // reopened in a narrow window may be squeezed, and that squeeze is not the person's choice. A drag
  // (including one that drags a hidden rail open) saves the width it ends at.
  function persistRailSoon(chosen: boolean) {
    if (!chosen) return;
    window.setTimeout(() => {
      const panel = railPanel.current;
      if (!panel) return;
      const collapsed = panel.isCollapsed();
      // Drags and arrow keys are the only user-driven layout changes left here (the toggle, `[` and
      // Enter on the handle go through toggleRail): the width they leave open is the chosen one.
      if (!collapsed) railWidth.current = panel.getSize().inPixels;
      saveRailLayout(railUser, { width: railWidth.current, collapsed });
    }, 0);
  }
  function toggleRail() {
    const panel = railPanel.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.resize(`${Math.max(railWidth.current, RAIL_MIN_PX)}px`);
    } else {
      // Focus inside a rail about to go inert would be stranded: hand it to the toggle first.
      const railEl = document.getElementById("cr-rail");
      if (railEl && document.activeElement && railEl.contains(document.activeElement)) {
        document.querySelector<HTMLElement>(".rail-toggle")?.focus();
      }
      panel.collapse();
    }
    // Showing or hiding never changes the chosen width: a rail reopened in a narrow window may be
    // squeezed, and that squeeze is not the person's choice.
    window.setTimeout(() => {
      const p = railPanel.current;
      if (!p) return;
      saveRailLayout(railUser, { width: railWidth.current, collapsed: p.isCollapsed() });
    }, 0);
  }
  // The panel's default stays the app's default, so double-clicking the edge resets to it (the library's
  // behaviour); the person's saved layout is applied before the first paint.
  useLayoutEffect(() => {
    if (phone) return;
    const saved = loadRailLayout(railUser);
    railWidth.current = saved.width;
    let frame = 0;
    let tries = 0;
    const apply = () => {
      const panel = railPanel.current;
      if (!panel) return;
      try {
        // Open at the saved width first even when it is hidden, so every way of showing it again
        // (the toggle, `[`, Enter on the handle) comes back at that width.
        if (saved.width !== RAIL_DEFAULT_PX) panel.resize(`${saved.width}px`);
        if (saved.collapsed) panel.collapse();
      } catch {
        // A rail that comes back after a phone-width window is registered with its group a frame
        // later than on first load: try again on the next frames.
        if (++tries < 10) frame = window.requestAnimationFrame(apply);
      }
    };
    apply();
    return () => window.cancelAnimationFrame(frame);
    // On mount, and again when a phone-width window widens and the rail comes back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);
  // Crossing the phone breakpoint removes the rail, its handle and toggle (or the phone's own bars).
  // If focus sat on one of them it would fall to the page: note it during the render that flips the
  // layout and hand focus to the workspace once the new layout is in place.
  const lastPhone = useRef(phone);
  const focusedAtFlip = useRef<Element | null>(null);
  if (lastPhone.current !== phone) {
    lastPhone.current = phone;
    focusedAtFlip.current = typeof document === "undefined" ? null : document.activeElement;
  }
  useLayoutEffect(() => {
    const was = focusedAtFlip.current;
    focusedAtFlip.current = null;
    // Whatever control the new layout removed (rail, handle, toggle, Search, runs, the phone's bars),
    // focus goes to the workspace; a control that stayed keeps it.
    if (was && was !== document.body && !was.isConnected) document.getElementById("main")?.focus();
  }, [phone]);
  const toggleRailRef = useRef(toggleRail);
  toggleRailRef.current = toggleRail;
  // Enter on the handle hides or shows the rail like the toggle does, at the saved width, instead of
  // the library's own memory of the last width that fit. Caught on the group in the capture phase so
  // it runs before the handle's own listener; focus stays on the handle.
  const groupCleanup = useRef<(() => void) | null>(null);
  const groupElRef = useCallback((el: HTMLDivElement | null) => {
    groupCleanup.current?.();
    groupCleanup.current = null;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.target instanceof Element) || !e.target.classList.contains("rail-sep")) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) toggleRailRef.current();
    };
    el.addEventListener("keydown", onKey, true);
    groupCleanup.current = () => el.removeEventListener("keydown", onKey, true);
  }, []);
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  // The tab title count and opt-in notifications read the same Inbox as the rail badge (pattern AW1, AW2).
  useAttentionSignals(session.user, inbox, () => void navigate({ to: "/inbox" }));
  const shortcut = isMac() ? "⌘K" : "Ctrl K";
  const look = useLook();
  const mode = useMode();
  const projects = useProjects();
  const activeProject = useActiveProject();
  const activeProjectMode = activeProject?.mode;
  useEffect(() => {
    if (activeProjectMode) saveMode(activeProjectMode);
  }, [activeProjectMode]);
  const newLock = lockedFor(lock, activeProject);
  const newLocked = useRef(false);
  newLocked.current = newLock.locked;
  const modeProjects = projects.filter((p) => p.mode === mode);
  const modeCopy = MODE_COPY[mode];
  const path = useRouterState({ select: (st) => st.location.pathname });
  const onBoard = path === "/";
  useEffect(() => setMoreOpen(false), [path]);
  // A card opened from anywhere (CardPanel.tsx) shows in the side panel; moving to another page
  // closes it, as the page's own selection would.
  const [panelCard, setPanelCard] = useState<CardOpen | undefined>(undefined);
  useEffect(() => setPanelCard(undefined), [path]);
  const closePanelCard = useCallback(() => setPanelCard(undefined), []);
  // The phone's sticky stage headers sit under the top bar: publish its height.
  const shellRef = useRef<HTMLDivElement>(null);
  // Restart, beside SCRAM while one holds: open the review and restart of the SCRAM the lamp shows (a real
  // trip before any drill, so a drill is never lifted in its place), and take focus there.
  const openScramReview = () => {
    // The widest real hold first (organization, then project), then a drill: the one the lamp describes.
    const toggle = [
      '.scram-banner-item[data-kind="trip"][data-scope="organization"]',
      '.scram-banner-item[data-kind="trip"]',
      '.scram-banner-item[data-kind="drill"]',
    ]
      .map((sel) => shellRef.current?.querySelector<HTMLButtonElement>(`${sel} button[aria-expanded]`))
      .find(Boolean);
    if (!toggle) return;
    if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
    // Centred, so a sticky top bar (phone) never covers it.
    toggle.scrollIntoView?.({ block: "center" });
    toggle.focus();
  };
  useEffect(() => {
    const shell = shellRef.current;
    const bar = shell?.querySelector<HTMLElement>(".topbar");
    if (!shell || !bar || !phone) return;
    const set = () => shell.style.setProperty("--phone-top-h", `${bar.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(set);
    ro?.observe(bar);
    return () => ro?.disconnect();
  }, [phone]);
  const activePlace = PLACES.find((p) => (p.to === "/" ? path === "/" : path.startsWith(p.to)));
  useFirstRunSetup(path);

  // On a phone the places are one scrolling row: keep the current one in view.
  useEffect(() => {
    document.querySelector(".places .place-link.active")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setPalette((open) => !open);
        return;
      }
      const target = e.target as HTMLElement | null;
      const inField =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      // The board's quick add claims `c` first (its listener prevents the default). Its state update can
      // re-render before this listener runs and remove the .bd-add opener, so look at the event too.
      if (e.defaultPrevented) return;
      // Every key below is a single character: none fires when the person turned them off.
      if (!singleKeysOn()) return;
      const hasBoardQuickAdd = document.querySelector(".bd-add, .bd-add-form") !== null;
      const hasOpenOverlay = document.querySelector(OPEN_MODAL) !== null;
      // `?` opens the shortcut list only when nothing modal is open: inside New Work or the palette
      // the list would open behind it. The list closes itself on `?` and Escape from its own handler.
      if (!inField && !hasOpenOverlay && e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (!inField && !hasOpenOverlay && !phoneRef.current && e.key === "[" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleRailRef.current();
        return;
      }
      if (!inField && !hasBoardQuickAdd && !hasOpenOverlay && !newLocked.current && e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setNewWorkOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [pendingSignOut, setPendingSignOut] = useState(false);
  async function logout() {
    setPendingSignOut(true);
    const startedUnder = sessionGeneration();
    try {
      const s = await api.logout();
      if (!stillCurrent(startedUnder)) {
        void qc.invalidateQueries({ queryKey: ["session"] });
        return;
      }
      await adoptSession(qc, s);
    } catch {
      void qc.invalidateQueries({ queryKey: ["session"] });
    } finally {
      setPendingSignOut(false);
    }
  }

  const rail = (
      <aside className="rail" id="cr-rail" inert={railCollapsed}>
        <div className="brand-row">
          <Link to="/" className="brand">
            <BrandMark />
            <span>Control Rod</span>
          </Link>
        </div>

        <button
          type="button"
          className="places-cta"
          onClick={() => setNewWorkOpen(true)}
          disabled={newLock.locked}
          title={newLock.why}
          aria-keyshortcuts={onBoard ? undefined : "C"}
        >
          <span>+ {modeCopy.newCta}</span>
          {/* On the Board, C adds a card in Ready (QuickAdd), so this button does not claim it there. */}
          {!onBoard && <kbd>C</kbd>}
        </button>

        <div className="rail-projects" aria-label="Projects">
          <div className="rail-projects-head">
            <span className="places-group-label" style={{ padding: 0 }}>
              Projects
            </span>
            <button
              type="button"
              className="rail-proj-add"
              title="New project"
              aria-label="New project"
              onClick={() => setNewProjectOpen(true)}
            >
              +
            </button>
          </div>
          <ul className="rail-projects-list">
            <li>
              <button
                type="button"
                className={activeProject === null ? "rail-proj-btn active" : "rail-proj-btn"}
                aria-pressed={activeProject === null}
                onClick={() => selectProject(projectUser, null)}
              >
                <span className="rail-proj-name">All {modeCopy.label}</span>
              </button>
            </li>
            {modeProjects.map((proj) => (
              <li key={proj.id}>
                <button
                  type="button"
                  className={activeProject?.id === proj.id ? "rail-proj-btn active" : "rail-proj-btn"}
                  aria-pressed={activeProject?.id === proj.id}
                  title={proj.repo ? `${proj.name} (${proj.repo})` : proj.name}
                  onClick={() => selectProject(projectUser, proj.id)}
                >
                  <span className="rail-proj-name">{proj.name}</span>
                  {proj.repo && <span className="rail-proj-repo mono">{proj.repo.split("/").pop()}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Places" className="places nav-scroll">
          {PLACE_GROUPS.map((group) => {
            const collapsible = COLLAPSIBLE_GROUPS.has(group);
            const isCollapsed = collapsible && Boolean(collapsedGroups[group]);
            return (
              <div key={group} className="places-group">
                {collapsible ? (
                  <button
                    type="button"
                    className="places-group-toggle"
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleGroup(group)}
                  >
                    <span>{group}</span>
                    <span aria-hidden="true" className="places-group-chev">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                  </button>
                ) : (
                  <div className="places-group-label">{group}</div>
                )}
                {!isCollapsed && (
                  <ul>
                    {PLACES.filter((p) => p.group === group).map((p) => (
                      <li key={p.to}>
                        <Link
                          to={p.to}
                          className="place-link"
                          activeOptions={{ exact: p.to === "/" }}
                          activeProps={{ className: "place-link active", "aria-current": "page" }}
                        >
                          <span>{p.label}</span>
                          {p.to === "/inbox" && <InboxBadge needs={needs} failed={inboxFailed} />}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="rail-foot">
          <div className="user-chip" title={session.user ?? "Signed in"}>
            <span className="rail-avatar" aria-hidden="true">
              {userInitial(session.user)}
            </span>
            <span className="user-chip-name">{session.user ?? "Signed in"}</span>
          </div>
          <button type="button" className="btn small rail-shortcuts" aria-keyshortcuts="?" onClick={() => setHelpOpen(true)}>
            Shortcuts <kbd>?</kbd>
          </button>
          <button type="button" className="btn small" disabled={pendingSignOut} onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
  );

  const workspace = (
      <div className="main">
        <AgentUpdates />
        <UpdateNotice />
        <header className="topbar">
          {phone && (
            <div className="phone-top">
              <Link to="/" className="brand phone-brand" aria-label="Control Rod, Board">
                <BrandMark />
              </Link>
              <label className="phone-project">
                <span className="sr-only">Project</span>
                <select
                  value={activeProject?.id ?? ""}
                  onChange={(e) => selectProject(projectUser, e.target.value === "" ? null : e.target.value)}
                >
                  <option value="">All {modeCopy.label}</option>
                  {modeProjects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="places-cta phone-new"
                onClick={() => setNewWorkOpen(true)}
                disabled={newLock.locked}
                title={newLock.why}
              >
                <span aria-hidden="true">+ New</span>
                <span className="sr-only">{modeCopy.newCta}</span>
              </button>
            </div>
          )}
          <div className="top-left">
            {!phone && (
              <button
                type="button"
                className="rail-toggle"
                aria-controls="cr-rail"
                aria-expanded={!railCollapsed}
                aria-keyshortcuts={keysOn ? "[" : undefined}
                title={`${railCollapsed ? "Show navigation" : "Hide navigation"}${keysOn ? "  [" : ""}`}
                onClick={toggleRail}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <rect x="3" y="4" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 4v12" stroke="currentColor" strokeWidth="1.5" />
                  {!railCollapsed && <path d="M4.8 7h1.6M4.8 9.5h1.6M4.8 12h1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />}
                </svg>
                <span className="sr-only">{railCollapsed ? "Show navigation" : "Hide navigation"}</span>
              </button>
            )}
            <span className="console-live-dot" aria-hidden="true" />
            <span className="crumb">{activePlace?.label ?? "Control Rod"}</span>
            <details
              className="workspace-options"
              onBlur={(event) => {
                if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                  event.currentTarget.open = false;
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !event.currentTarget.open) return;
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }}
            >
              <summary className="stream-pill" aria-label={`${modeCopy.label} workspace options`}>
                {modeCopy.label}
              </summary>
              <div className="workspace-options-panel">
                <span className="workspace-option-label">Engineering mode</span>
                <div className="seg" role="group" aria-label="Engineering mode">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={mode === m.id ? "active" : ""}
                      aria-pressed={mode === m.id}
                      onClick={() => switchModeAndSyncProject(projectUser, m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </div>

          <div className="top-right">
            {live.status === "unknown" && (
              <span className="shell-notlive" role="status">
                Not live
              </span>
            )}
            {!phone && <ActiveRuns />}
            {!phone && (
              <button
                type="button"
                className="btn small palette-trigger"
                onClick={() => setPalette(true)}
                aria-keyshortcuts={isMac() ? "Meta+K" : "Control+K"}
              >
                <span>
                  Search{" "}
                  <span className="sr-only">or run a command </span>
                </span>
                <kbd>{shortcut}</kbd>
              </button>
            )}

            <ScramSwitch
              rods={rods}
              stopping={scramStopping(scrams)}
              failed={scramRead.isError}
              presenting={presenting}
              onRestart={openScramReview}
            />
          </div>
        </header>

        {/* On every screen: a SCRAM locks actions in its scope; a drill locks the same way, since it stops work for real. */}
        <ScramBanner presenting={presenting} />

        {/* The page and the side panel. One tree whether the panel is open or not, so opening it never
            remounts the page (its scroll, filters and drafts stay). */}
        <Group orientation="horizontal" className="work-panes" onLayoutChanged={(_layout, meta) => persistSideSoon(meta.isUserInteraction)}>
          <Panel id="page" className="page-panel" minSize={`${PAGE_MIN_PX}px`}>
            <main id="main" className="content" tabIndex={-1} inert={(side.full && sideDocked) || undefined}>
              {children}
            </main>
            {/* Full width: the panel covers the page, which stays mounted (scroll, filters, drafts) under it. */}
            {side.full && sideDocked && <SidePanelSlot slot={side.slot} full />}
          </Panel>
          {side.open && sideDocked && !side.full && (
            <Separator className="side-sep" aria-label="Side panel width" title="Drag to resize the side panel." />
          )}
          {side.open && sideDocked && !side.full && (
            <Panel
              id="side"
              className="side-pane"
              panelRef={sidePanel}
              defaultSize={`${loadSideWidth(sideUser)}px`}
              minSize={`${SIDE_MIN_PX}px`}
              maxSize={`${SIDE_MAX_PX}px`}
              groupResizeBehavior="preserve-pixel-size"
            >
              <SidePanelSlot slot={side.slot} />
            </Panel>
          )}
        </Group>
        {side.open && !sideDocked && <SidePanelSlot slot={side.slot} overlay wide={side.wide} full={side.full} />}
        {phone && (
          <PhoneBar
            needs={needs}
            inboxFailed={inboxFailed}
            moreOpen={moreOpen}
            setMoreOpen={setMoreOpen}
            mode={mode}
            projectUser={projectUser}
            user={session.user}
            pendingSignOut={pendingSignOut}
            onSignOut={() => void logout()}
            onSearch={() => {
              setMoreOpen(false);
              setPalette(true);
            }}
            onNewProject={() => {
              setMoreOpen(false);
              setNewProjectOpen(true);
            }}
          />
        )}
      </div>

  );

  return (
    <ScramLockContext.Provider value={lock}>
    <SidePanelProvider host={side.host}>
    <CardPanelContext.Provider value={setPanelCard}>
    <div className="shell" ref={shellRef} data-phone={phone ? "" : undefined} data-look={look} data-mode={mode} data-scram={scramKind} data-tab-hidden={tabHidden ? "" : undefined}>
      <a className="skip" href="#main">
        Skip to content
      </a>

      {/* One tree on every width: the workspace stays mounted (and keeps unsaved drafts and focus) when
          a window crosses the phone breakpoint; on a phone the rail and its handle are simply absent. */}
      <Group orientation="horizontal" className="shell-panes" elementRef={groupElRef} onLayoutChanged={(_layout, meta) => persistRailSoon(meta.isUserInteraction)}>
        {!phone && (
        <Panel
          id="rail"
          className="rail-panel"
          panelRef={railPanel}
          defaultSize={`${RAIL_DEFAULT_PX}px`}
          minSize={`${RAIL_MIN_PX}px`}
          maxSize={`${RAIL_MAX_PX}px`}
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={onRailResize}
        >
          {rail}
        </Panel>
        )}
        {!phone && (
        <Separator
          className="rail-sep"
          aria-label="Navigation width"
          title={`Drag to resize the navigation. Double-click to reset.${keysOn ? " Press [ to hide or show it." : ""}`}
        />
        )}
        <Panel id="workspace" className="main-panel" minSize="560px">
          {workspace}
        </Panel>
      </Group>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <NewWorkModal open={newWorkOpen} mode={mode} onClose={() => setNewWorkOpen(false)} />
      {newProjectOpen && <ProjectModal open={newProjectOpen} defaultMode={mode} onClose={() => setNewProjectOpen(false)} />}
      <ShortcutHelp open={helpOpen} mac={isMac()} onClose={() => setHelpOpen(false)} />
      {panelCard && (
        <BoardReviewDrawer
          key={panelCard.id}
          packageId={panelCard.id}
          mode={mode}
          {...(panelCard.runLog ? { openRunLog: panelCard.runLog } : {})}
          onClose={closePanelCard}
        />
      )}
    </div>
    </CardPanelContext.Provider>
    </SidePanelProvider>
    </ScramLockContext.Provider>
  );
}
