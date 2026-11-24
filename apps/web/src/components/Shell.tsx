import { type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AgentUpdates } from "./AgentUpdates.js";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { BrandMark } from "../pages/SignIn.js";
import { RodGauge } from "../design/instruments/RodGauge.js";
import { ScramBanner, useScrams } from "../features/office/Scram.js";
import { type RodPosition, rodState } from "../features/office/plant-instruments.js";
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
import { CommandPalette } from "./CommandPalette.js";
import { NewWorkModal } from "./NewWorkModal.js";
import { ProjectModal } from "./ProjectModal.js";
import { ShortcutHelp } from "./ShortcutHelp.js";
import { OPEN_MODAL, singleKeysOn } from "../lib/singleKeys.js";
import { useAttentionSignals } from "../lib/useAttentionSignals.js";
import { adoptSession, sessionGeneration, stillCurrent } from "../lib/session.js";
import { useFirstRunSetup } from "../lib/firstRun.js";
import { readString, writeString } from "../lib/storage.js";
import { PHONE_QUERY, useMedia } from "../lib/useMedia.js";
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

/** The rod gauge's words, beside it, so the position is never left to a small drawing. */
const ROD_LABEL: Record<RodPosition, string> = {
  withdrawn: "No SCRAM",
  bank: "SCRAM: project",
  inserted: "SCRAM: organization",
  drill: "SCRAM drill",
  unknown: "SCRAM unknown",
};

const PLACE_GROUPS: readonly PlaceGroup[] = ["Work", "Audit", "Control / Setup"];

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The places the phone's bottom bar names; every other place sits under More. */
const BAR_PLACES = ["/", "/plant", "/inbox", "/today"];

/**
 * The phone's navigation: Board, Plant, Inbox, Today and More along the bottom, each at least 44 px
 * tall. More opens a sheet with every other place, the engineering mode, search, runs and sign out.
 */
function PhoneBar({
  needs,
  moreOpen,
  setMoreOpen,
  mode,
  projectUser,
  user,
  pendingSignOut,
  onSignOut,
  onSearch,
}: {
  needs: number;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  mode: EngineeringMode;
  projectUser: string | undefined;
  user: string | undefined;
  pendingSignOut: boolean;
  onSignOut: () => void;
  onSearch: () => void;
}) {
  const moreBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    sheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
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
        <div className="more-scrim" onClick={() => setMoreOpen(false)}>
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
              <button type="button" className="btn small" onClick={() => { setMoreOpen(false); moreBtn.current?.focus(); }}>
                Close
              </button>
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
              {to === "/inbox" && needs > 0 && (
                <span className="badge" aria-label={`${needs} waiting on you`}>
                  {needs}
                </span>
              )}
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
 * The shell (specification 12; plan task 3.1): 224px navigation rail + operational topbar +
 * scrollable workspace, Inbox count, mode/look switchers, and command palette (Ctrl+K / Cmd+K).
 */
export function Shell({ session, children }: { session: Session; children: ReactNode }) {
  return (
    <WorkspaceProjectUser value={session.signed_in ? session.user : undefined}>
      <WorkspaceShell session={session}>{children}</WorkspaceShell>
    </WorkspaceProjectUser>
  );
}

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
  // SCRAM is app-wide (control room redesign, section 6.6): one read feeds the banner, the rod gauge,
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
  useEffect(() => setMoreOpen(false), [path]);
  // The phone's sticky stage headers sit under the top bar: publish its height.
  const shellRef = useRef<HTMLDivElement>(null);
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

  return (
    <ScramLockContext.Provider value={lock}>
    <div className="shell" ref={shellRef} data-phone={phone ? "" : undefined} data-look={look} data-mode={mode} data-scram={scramKind} data-tab-hidden={tabHidden ? "" : undefined}>
      <a className="skip" href="#main">
        Skip to content
      </a>

      {!phone && (
      <aside className="rail">
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
          aria-keyshortcuts="C"
        >
          <span>+ {modeCopy.newCta}</span>
          <kbd>C</kbd>
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
                          {p.to === "/inbox" && needs > 0 && (
                            <span className="badge" aria-label={`${needs} waiting on you`}>
                              {needs}
                            </span>
                          )}
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
          <div className="user-chip">
            <span className="rail-avatar" aria-hidden="true">
              {userInitial(session.user)}
            </span>
            <span>{session.user ?? "Signed in"}</span>
          </div>
          <button type="button" className="btn small rail-shortcuts" aria-keyshortcuts="?" onClick={() => setHelpOpen(true)}>
            Shortcuts <kbd>?</kbd>
          </button>
          <button type="button" className="btn small" disabled={pendingSignOut} onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      )}

      <div className="main">
        <AgentUpdates />
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
            <span className="shell-rods" data-position={rods.position}>
              <RodGauge position={rods.position} {...(rods.caption ? { caption: rods.caption } : {})} />
              <span className="shell-rods-label" aria-hidden="true">
                {ROD_LABEL[rods.position]}
              </span>
            </span>
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

            <Link to="/office" className="btn small danger topbar-scram">
              SCRAM
            </Link>
          </div>
        </header>

        {/* On every screen: a SCRAM locks actions in its scope; a drill locks the same way, since it stops work for real. */}
        {scrams && scrams.length > 0 && <ScramBanner presenting={presenting} />}

        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
        {phone && (
          <PhoneBar
            needs={needs}
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
          />
        )}
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <NewWorkModal open={newWorkOpen} mode={mode} onClose={() => setNewWorkOpen(false)} />
      {newProjectOpen && <ProjectModal open={newProjectOpen} defaultMode={mode} onClose={() => setNewProjectOpen(false)} />}
      <ShortcutHelp open={helpOpen} mac={isMac()} onClose={() => setHelpOpen(false)} />
    </div>
    </ScramLockContext.Provider>
  );
}
