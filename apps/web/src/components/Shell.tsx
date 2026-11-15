import { type ReactNode, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { BrandMark } from "../pages/SignIn.js";
import { type Look, saveLook, useLook } from "../lib/kind.js";
import { MODE_COPY, saveMode, useMode, type EngineeringMode } from "../lib/mode.js";
import { PLACES, type PlaceGroup } from "../places/places.js";
import { CommandPalette } from "./CommandPalette.js";
import { NewWorkModal } from "./NewWorkModal.js";
import { adoptSession, sessionGeneration, stillCurrent } from "../lib/session.js";

const LOOKS: { id: Look; name: string }[] = [
  { id: "a", name: "A Control room" },
  { id: "b", name: "B Drafting table" },
  { id: "c", name: "C Instrument panel" },
];

const MODES: { id: EngineeringMode; label: string }[] = [
  { id: "software", label: "Software" },
  { id: "capital-projects", label: "Capital Projects" },
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
  const needs = inbox.data?.items.length ?? 0;
  const [palette, setPalette] = useState(false);
  const [newWorkOpen, setNewWorkOpen] = useState(false);
  const shortcut = isMac() ? "⌘K" : "Ctrl K";
  const look = useLook();
  const mode = useMode();
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
      const hasBoardQuickAdd = document.querySelector(".bd-add, .bd-quick") !== null;
      if (!inField && !hasBoardQuickAdd && e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
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

        <nav aria-label="Places" className="places nav-scroll">
          {PLACE_GROUPS.map((group) => (
            <div key={group} className="places-group">
              <div className="places-group-label">{group}</div>
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
            </div>
          ))}
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
            <span className="stream-pill">
              <span className="stream-dot" aria-hidden="true" />
              <span>{modeCopy.label}</span>
            </span>
          </div>

          <div className="top-right">
            <div className="seg" role="group" aria-label="Engineering mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={mode === m.id ? "active" : ""}
                  aria-pressed={mode === m.id}
                  onClick={() => saveMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

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
                  <span aria-hidden="true">Look {l.id.toUpperCase()}</span>
                  <span className="sr-only">Look {l.name}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn small palette-trigger"
              aria-label="Search or run a command"
              onClick={() => setPalette(true)}
              aria-keyshortcuts={isMac() ? "Meta+K" : "Control+K"}
            >
              <span>Search</span>
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
    </div>
  );
}
