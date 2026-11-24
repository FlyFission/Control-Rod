import { useId, useState } from "react";
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
  off: "SCRAM lamp off: agents running normally",
  trip: "SCRAM lamp lit: agent work stopped",
  drill: "SCRAM drill lamp lit: agent work stopped for a drill",
  unknown: "SCRAM lamp unknown: status could not be read",
};

const STEPS = [
  { n: "1", head: "Stop", body: "Every agent halts where it stands, everywhere or in one project." },
  { n: "2", head: "Review", body: "See what each stopped run reported." },
  { n: "3", head: "Restart", body: "Resume all of it, or one package at a time." },
];

export function ScramSwitch({ rods, presenting, onRestart }: { rods: RodState; presenting: boolean; onRestart: () => void }) {
  const lamp = LAMP[rods.position];
  const tipId = useId();
  const [dismissed, setDismissed] = useState(false);
  const stopped = lamp === "trip" || lamp === "drill";
  const status = rods.caption ?? (lamp === "off" ? "No SCRAM in force" : LAMP_WORDS[lamp]);
  return (
    <span
      className="scram-switch"
      data-lamp={lamp}
      data-tip-dismissed={dismissed ? "" : undefined}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setDismissed(true);
      }}
    >
      <span className="scram-lamp" role="img" aria-label={rods.caption ? `${LAMP_WORDS[lamp]}. ${rods.caption}` : LAMP_WORDS[lamp]}>
        <span className="scram-lamp-lens" />
      </span>
      <Link to="/office" className="btn small danger topbar-scram" aria-describedby={tipId}>
        SCRAM
      </Link>
      {stopped && !presenting && (
        <button type="button" className="btn small scram-restart" onClick={onRestart} aria-describedby={tipId}>
          Restart
        </button>
      )}
      <span className="scram-tip" role="tooltip" id={tipId}>
        <span className="scram-tip-head">
          <span className="scram-tip-title">SCRAM</span>
          <span className="scram-tip-status">{status}</span>
        </span>
        <span className="scram-tip-lede">
          {stopped ? "Agent work is stopped and held. Restart reviews what stopped and resumes it." : "Stops all agent activity at once. Work is held until you restart it."}
        </span>
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
        <span className="sr-only">Stop, then review what each run reported, then restart when ready.</span>
      </span>
    </span>
  );
}
