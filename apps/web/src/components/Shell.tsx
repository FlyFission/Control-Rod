import { type ReactNode, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { BrandMark } from "../pages/SignIn.js";
import { type Look, saveLook, useLook } from "../lib/kind.js";
import { MODE_COPY, useMode, type EngineeringMode } from "../lib/mode.js";
import {
  hydrateServerProjects,
  selectProject,
  switchModeAndSyncProject,
  useActiveProject,
  useProjects,
} from "../lib/projects.js";
import { PLACES, type PlaceGroup } from "../places/places.js";
import { ActiveRuns } from "./ActiveRuns.js";
import { CommandPalette } from "./CommandPalette.js";
import { NewWorkModal } from "./NewWorkModal.js";
import { ProjectModal } from "./ProjectModal.js";
import { adoptSession, sessionGeneration, stillCurrent } from "../lib/session.js";
import { readString, writeString } from "../lib/storage.js";

const COLLAPSED_GROUPS_KEY = "cr.nav-collapsed";
const COLLAPSIBLE_GROUPS = new Set<PlaceGroup>(["Audit", "Control"]);

function loadCollapsedGroups(): Record<string, boolean> {
  const raw = readString(COLLAPSED_GROUPS_KEY);
  if (!raw) return { Audit: true, Control: true };
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : { Audit: true, Control: true };
  } catch {
    return { Audit: true, Control: true };
  }
}

const LOOKS: { id: Look; name: string }[] = [
  { id: "a", name: "A Control room" },
  { id: "b", name: "B Drafting table" },
  { id: "c", name: "C Instrument panel" },
];

const MODES: { id: EngineeringMode; label: string }[] = [
  { id: "software", label: "Software" },
  { id: "capital-projects", label: "Capital Projects" },
  { id: "nuclear-grade", label: "Nuclear-Grade" },
];

const PLACE_GROUPS: readonly PlaceGroup[] = ["Work", "Audit", "Control"];

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function userInitial(name: string | undefined): string {
  const s = (name ?? "U").trim();
  return (s[0] ?? "U").toUpperCase();
}

/**
 * The shell (specification 12; plan task 3.1): 224px navigation rail + operational topbar +
 * scrollable workspace, Inbox count, mode/look switchers, and command palette (Ctrl+K / Cmd+K).
 */
export function Shell({ session, children }: { session: Session; children: ReactNode }) {
  const qc = useQueryClient();
  // Only what waits on this person counts (OV-01); work waiting on someone else never does.
  const inbox = useQuery({ queryKey: ["inbox", session.user ?? "", "badge"], queryFn: () => api.inbox() });
  const serverProjects = useQuery({
    queryKey: ["workspace-projects", session.user ?? ""],
    queryFn: () => api.workspaceProjects(),
    retry: false,
  });
  useEffect(() => {
    if (serverProjects.data) {
      hydrateServerProjects(serverProjects.data);
    }
  }, [serverProjects.data]);
  const needs = inbox.data?.items.length ?? 0;
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
  const shortcut = isMac() ? "⌘K" : "Ctrl K";
  const look = useLook();
  const mode = useMode();
  const projects = useProjects();
  const activeProject = useActiveProject();
  const modeProjects = projects.filter((p) => p.mode === mode);
  const modeCopy = MODE_COPY[mode];
  const path = useRouterState({ select: (st) => st.location.pathname });
  const activePlace = PLACES.find((p) => (p.to === "/" ? path === "/" : path.startsWith(p.to)));

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
      const hasBoardQuickAdd = document.querySelector(".bd-add, .bd-quick") !== null;
      const hasOpenOverlay = document.querySelector("dialog[open], .palette") !== null;
      if (!inField && !hasBoardQuickAdd && !hasOpenOverlay && e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
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
    <div className="shell" data-look={look} data-mode={mode}>
      <a className="skip" href="#main">
        Skip to content
      </a>

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
                onClick={() => selectProject(null)}
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
                  onClick={() => selectProject(proj.id)}
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
          <button type="button" className="btn small" disabled={pendingSignOut} onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="top-left">
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
                      onClick={() => switchModeAndSyncProject(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <span className="workspace-option-label">Board look</span>
                <div className="seg" role="group" aria-label="Board look">
                  {LOOKS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={look === l.id ? "active" : ""}
                      aria-pressed={look === l.id}
                      title={l.name}
                      onClick={() => saveLook(l.id)}
                    >
                      <span>{l.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </div>

          <div className="top-right">
            <ActiveRuns />
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

            <Link to="/office" className="btn small danger">
              SCRAM
            </Link>
          </div>
        </header>

        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <NewWorkModal open={newWorkOpen} mode={mode} onClose={() => setNewWorkOpen(false)} />
      {newProjectOpen && <ProjectModal open={newProjectOpen} defaultMode={mode} onClose={() => setNewProjectOpen(false)} />}
    </div>
  );
}
