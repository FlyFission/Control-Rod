import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { StateMark, type StateKind } from "../../components/StateMark.js";
import type { AnnunciatorWindow } from "./plant-instruments.js";

/**
 * The plant's annunciator (plant view design, section 6): four windows in the header, dark when the
 * plant is normal, each lit while its condition holds. Name and count are always text, and each window
 * carries its state's shape, so nothing is said by colour alone. A window that has not been read says
 * "Loading" or "Unavailable", never 0.
 *
 * One polite live region announces a window going lit or dark, not every refresh.
 */

const MARK: Partial<Record<AnnunciatorWindow["id"], StateKind>> = {
  "waiting-on-you": "needs",
  stuck: "stuck",
  changed: "changed",
};

function value(w: AnnunciatorWindow): string {
  if (w.state === "loading") return "…";
  if (w.state === "unavailable") return "–";
  return String(w.count ?? 0);
}

function spoken(w: AnnunciatorWindow): string {
  if (w.state === "loading") return `${w.label}: loading`;
  if (w.state === "unavailable") return `${w.label}: unavailable`;
  return [`${w.label}: ${w.count ?? 0}`, w.note, w.asOf].filter(Boolean).join(", ");
}

export function Annunciator({ windows }: { windows: readonly AnnunciatorWindow[] }) {
  const lit = windows.filter((w) => w.state === "lit").map((w) => w.id).join(",");
  const previous = useRef<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    // The first reading is not news; after that, say what lit and what went dark.
    if (previous.current !== undefined && previous.current !== lit) {
      const before = new Set(previous.current ? previous.current.split(",") : []);
      const now = new Set(lit ? lit.split(",") : []);
      const on = windows.filter((w) => now.has(w.id) && !before.has(w.id)).map((w) => `${w.label} lit`);
      const off = windows.filter((w) => before.has(w.id) && !now.has(w.id)).map((w) => `${w.label} clear`);
      setAnnouncement([...on, ...off].join(". "));
    }
    previous.current = lit;
  }, [lit, windows]);
  return (
    <>
      <ul className="plant-annunciator" aria-label="Annunciator">
        {windows.map((w) => {
          const mark = MARK[w.id];
          const body = (
            <>
              <span className="sr-only">{spoken(w)}</span>
              <span className="plant-window-count" aria-hidden="true">
                {value(w)}
              </span>
              <span className="plant-window-label" aria-hidden="true">
                {mark && w.state === "lit" && (
                  <>
                    <StateMark kind={mark} size={9} />{" "}
                  </>
                )}
                {w.label}
              </span>
              <span className="plant-window-note" aria-hidden="true">
                {w.state === "loading" ? "Loading" : w.state === "unavailable" ? "Unavailable" : [w.note, w.asOf].filter(Boolean).join(", ") || (w.state === "dark" ? "Clear" : "")}
              </span>
            </>
          );
          return (
            <li key={w.id} className="plant-window" data-window={w.id} data-state={w.state}>
              {w.id === "waiting-on-you" ? (
                <Link to="/inbox" className="plant-window-body" title="Open the Inbox">
                  {body}
                </Link>
              ) : (
                <span className="plant-window-body">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
