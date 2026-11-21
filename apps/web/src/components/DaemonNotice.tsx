import { Link } from "@tanstack/react-router";
import { type DaemonPresence, useDaemonPresence } from "../lib/daemon.js";

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The words for a presence that stops work; null when work can run (or it is not known yet). */
export function daemonNoticeText(p: DaemonPresence): { title: string; detail: string } | null {
  switch (p.state) {
    case "never":
      return {
        title: "No run daemon has connected yet, so no agent can start.",
        detail: "Start Control Rod with pnpm cr start on this machine; it starts the daemon too. Cards wait in Ready until then.",
      };
    case "silent":
      return {
        title: `The run daemon has not answered since ${clock(p.since)}.`,
        detail: "Runs cannot start or report until it is back. Restart Control Rod with pnpm cr start; a run that was going is marked lost and can be run again.",
      };
    case "no-agent":
      return {
        title: "The run daemon found no agent it can run.",
        detail: `Install and sign in to Claude Code or Codex on this machine, then restart Control Rod.${p.reasons.length ? ` (${p.reasons.join("; ")})` : ""}`,
      };
    default:
      return null;
  }
}

export function DaemonNotice({ running }: { running: number }) {
  const text = daemonNoticeText(useDaemonPresence(running));
  if (text === null) return null;
  return (
    <div className="daemon-notice" role="status">
      <strong>{text.title}</strong> <span>{text.detail}</span> <Link to="/settings/subscriptions">Agents on this machine</Link>
    </div>
  );
}
