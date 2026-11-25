import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { RodState } from "../features/office/plant-instruments.js";
import "./scram-switch.css";

/**
 * The top bar's SCRAM: one button and a beacon lamp beside it. The lamp is dark while nothing is
 * stopped, flashes red while a SCRAM is in force (steady under reduced motion), flashes amber for a
 * drill and is hatched when the status could not be read, so an unknown is never shown as clear.
 * Hover or focus shows what SCRAM does: it stops every agent where it stands, and the way back is
 * a reviewed restart. While a SCRAM is in force a Restart button sits beside it, since that is the
 * way to resume.
 */

type Lamp = "off" | "trip" | "drill" | "unknown";

const LAMP: Record<RodState["position"], Lamp> = {
  withdrawn: "off",
  bank: "trip",
  inserted: "trip",
  drill: "drill",
  unknown: "unknown",
};

const LAMP_WORDS: Record<Lamp, string> = {
  off: "SCRAM lamp off: no SCRAM in force",
  trip: "SCRAM lamp lit: SCRAM in force",
  drill: "SCRAM drill lamp lit: drill SCRAM in force",
  unknown: "SCRAM lamp unknown: status could not be read",
};

const STEPS = [
  { n: "1", head: "Stop", body: "Every running agent stops at its next heartbeat, everywhere or in one project. Queued work is held." },
  { n: "2", head: "Review", body: "See what each stopped run reported." },
  { n: "3", head: "Restart", body: "Sign a restart for all of it, one discipline or one package. It is refused while anything in that scope is unresolved." },
];

/**
 * rods: the rod state from the shell's SCRAM read. stopping: a SCRAM in force whose stop the control
 * plane has not yet recorded. failed: the latest SCRAM read failed, so cached data is not current and
 * the banner (where Restart leads) shows an error instead of the review.
 */
export function ScramSwitch({ rods, stopping, failed, presenting, onRestart }: { rods: RodState; stopping: boolean; failed: boolean; presenting: boolean; onRestart: () => void }) {
  // A failed read never shows as clear: an off lamp turns to unknown; a lit lamp stays lit with its "as of" caption.
  const lamp: Lamp = failed && LAMP[rods.position] === "off" ? "unknown" : LAMP[rods.position];
  const tipId = useId();
  const [dismissed, setDismissed] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const hovered = useRef(false);
  // Escape hides the card wherever focus is, but only while the card is open (hovered or focused), so a
  // stray Escape elsewhere never suppresses the next one.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = root.current;
      if (e.key !== "Escape" || !el) return;
      if (hovered.current || el.contains(document.activeElement)) setDismissed(true);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);
  const held = lamp === "trip" || lamp === "drill";
  const status = failed && lamp === "unknown" ? "SCRAM status could not be read" : (rods.caption ?? (lamp === "off" ? "No SCRAM in force" : LAMP_WORDS[lamp]));
  const lede = !held
    ? lamp === "unknown"
      ? "SCRAM status could not be read just now. SCRAM still works: it stops all agent activity, and work is held until you restart it."
      : "Stops all agent activity. Work is held until you restart it."
    : failed
      ? "Last reading: SCRAM in force. Current status could not be read, so this may be out of date."
      : stopping
        ? "SCRAM in force. Agents are stopping: each stops at its next heartbeat, and work is held until you restart it."
        : "SCRAM in force: the work it still holds stays stopped until you restart it. Restart opens the review, where you sign a restart."
  return (
    <span
      ref={root}
      className="scram-switch"
      data-lamp={lamp}
      data-tip-dismissed={dismissed ? "" : undefined}
      onMouseEnter={() => {
        hovered.current = true;
      }}
      onMouseLeave={() => {
        hovered.current = false;
        setDismissed(false);
      }}
      onBlur={() => setDismissed(false)}
    >
      <span className="scram-lamp" role="img" aria-label={rods.caption ? `${LAMP_WORDS[lamp]}. ${rods.caption}` : LAMP_WORDS[lamp]}>
        <span className="scram-lamp-lens" />
      </span>
      <Link to="/office" className="btn small danger topbar-scram" aria-describedby={tipId}>
        SCRAM
      </Link>
      {held && !presenting && !failed && (
        <button type="button" className="btn small scram-restart" onClick={onRestart} aria-describedby={tipId}>
          Restart
        </button>
      )}
      <span className="scram-tip" role="tooltip" id={tipId}>
        <span className="scram-tip-head">
          <span className="scram-tip-title">SCRAM</span>
          <span className="scram-tip-status">{status}</span>
        </span>
        <span className="scram-tip-lede">{lede}</span>
        <span className="scram-tip-steps" aria-hidden="true">
          {STEPS.map((s) => (
            <span key={s.n} className="scram-tip-step" data-step={s.n}>
              <span className="scram-tip-n">{s.n}</span>
              <span className="scram-tip-step-text">
                <strong>{s.head}</strong> {s.body}
              </span>
            </span>
          ))}
        </span>
        <span className="sr-only">Stop at the next heartbeat, then review what each run reported, then sign a restart for all, one discipline or one package; it is refused while anything in that scope is unresolved.</span>
      </span>
    </span>
  );
}
