import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { StateMark, type StateKind } from "../../components/StateMark.js";
import { useVisible } from "./OfficeStage.js";
import type { AnnunciatorWindow } from "./plant-instruments.js";

/**
 * The plant's annunciator (plant view design, section 6): four windows in the header, dark when the
 * plant is normal, each lit while its condition holds. Name and count are always text, and each window
 * carries its state's shape, so nothing is said by colour alone. A window that has not been read says
 * "Loading" or "Unavailable", never 0.
 *
 * One polite live region announces a window going lit or dark, not every refresh, and only between
 * confirmed readings. A window flashes three times when it comes on, never on the first reading.
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

/** How long a newly lit window flashes: three flashes of the CSS animation. */
const FLASH_MS = 2400;

/** `linkInbox` is false only where no router exists (the theme harness page). */
export function Annunciator({ windows, linkInbox = true }: { windows: readonly AnnunciatorWindow[]; linkInbox?: boolean }) {
  const visible = useVisible();
  // The last confirmed reading of each window: lit or dark. Loading and unavailable confirm nothing,
  // so a window that loses its read is never announced as clear, nor flashes when the read returns.
  const confirmed = useRef<Map<string, "lit" | "dark"> | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());
  const key = windows.map((w) => `${w.id}:${w.state}`).join(",");
  useEffect(() => {
    const before = confirmed.current;
    const now = new Map(before ?? []);
    for (const w of windows) if (w.state === "lit" || w.state === "dark") now.set(w.id, w.state);
    confirmed.current = now;
    // The first reading is not news; after that, say what lit and what went dark.
    if (!before) return;
    const on = windows.filter((w) => w.state === "lit" && before.get(w.id) === "dark");
    const off = windows.filter((w) => w.state === "dark" && before.get(w.id) === "lit");
    if (on.length + off.length === 0) return;
    setAnnouncement([...on.map((w) => `${w.label} lit`), ...off.map((w) => `${w.label} clear`)].join(". "));
    if (on.length === 0) return;
    setFlashing(new Set(on.map((w) => w.id)));
    const t = setTimeout(() => setFlashing(new Set()), FLASH_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <>
      <ul className="plant-annunciator" aria-label="Annunciator" data-motion={visible ? "running" : "paused"}>
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
            <li key={w.id} className="plant-window" data-window={w.id} data-state={w.state} data-flash={flashing.has(w.id) ? "" : undefined}>
              {w.id === "waiting-on-you" && linkInbox ? (
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
