import { type ReactNode, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Session } from "../api/types.js";
import { BrandMark } from "../pages/SignIn.js";
import { PLACES } from "../places/places.js";
import { CommandPalette } from "./CommandPalette.js";
import { adoptSession } from "../lib/session.js";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The shell (specification 12; plan task 3.1): every place in one navigation, the Inbox count, and
 * the command palette on one shortcut (Ctrl+K, or Command+K on a Mac).
 */
export function Shell({ session, children }: { session: Session; children: ReactNode }) {
  const qc = useQueryClient();
  // Only what waits on this person counts (OV-01); work waiting on someone else never does.
  const inbox = useQuery({ queryKey: ["inbox", session.user ?? "", "badge"], queryFn: () => api.inbox() });
  const needs = inbox.data?.items.length ?? 0;
  const [palette, setPalette] = useState(false);
  const shortcut = isMac() ? "⌘K" : "Ctrl K";
  const path = useRouterState({ select: (st) => st.location.pathname });

  // On a phone the places are one scrolling row: keep the current one in view.
  useEffect(() => {
    document.querySelector(".places .place-link.active")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function logout() {
    try {
      const s = await api.logout();
      // Nothing one person's session loaded survives into the next one.
      await adoptSession(qc, s);
    } catch {
      void qc.invalidateQueries({ queryKey: ["session"] });
    }
  }

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/inbox" className="brand">
          <BrandMark />
          <span>Control Rod</span>
        </Link>
        <button type="button" className="palette-trigger" onClick={() => setPalette(true)} aria-keyshortcuts={isMac() ? "Meta+K" : "Control+K"}>
          <span>Search or run a command</span>
          <kbd>{shortcut}</kbd>
        </button>
        <div className="who">
          <span className="muted">{session.user ?? "Signed in"}</span>
          <button type="button" className="btn ghost small" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="frame">
        <nav aria-label="Places" className="places">
          <ul>
            {PLACES.map((p) => (
              <li key={p.to}>
                <Link to={p.to} className="place-link" activeProps={{ className: "place-link active", "aria-current": "page" }}>
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
        </nav>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
