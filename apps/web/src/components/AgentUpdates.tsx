import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { AgentUpdate } from "../api/types.js";

/**
 * Agent updates (change record agent-update-prompt). When the app opens, the daemon's startup check
 * says which agent CLIs have a newer version. Each shows installed and latest version and the exact
 * command to run in a terminal, with a Copy button. Nothing here installs anything: the person runs
 * the command, or `controlrod agents update`, which asks before each one. Nothing runs on a timer.
 *
 * The idea is from Orchestrator (agent-orchestrator, Apache-2.0); no code was copied.
 */
const DISMISSED = "controlrod.agent-updates.dismissed";

const keyOf = (u: AgentUpdate) => `${u.agent}@${u.latest}`;

function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED) ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]) {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify(keys));
  } catch {
    /* a private window keeps the dismissal for this page only */
  }
}

export function AgentUpdates() {
  const q = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [copied, setCopied] = useState<string | null>(null);

  const shown = (q.data?.agent_updates ?? []).filter((u) => !dismissed.includes(keyOf(u)));
  if (shown.length === 0) return null;

  const dismiss = (keys: string[]) => {
    const next = [...new Set([...dismissed, ...keys])];
    setDismissed(next);
    writeDismissed(next);
  };
  const copy = async (u: AgentUpdate) => {
    try {
      await navigator.clipboard.writeText(u.command!.join(" "));
      setCopied(u.agent);
    } catch {
      setCopied(null); /* the command stays on screen to copy by hand */
    }
  };
  const noun = shown.length === 1 ? "agent update" : "agent updates";

  return (
    <section className="agent-updates" aria-labelledby="agent-updates-title">
      <header className="au-head">
        <div>
          <h2 id="agent-updates-title">
            {shown.length} {noun}
          </h2>
          <p className="muted small">Newer versions bring bug fixes, new models and features. Update between runs.</p>
        </div>
        <button type="button" className="au-close" aria-label="Dismiss agent updates" onClick={() => dismiss(shown.map(keyOf))}>
          ×
        </button>
      </header>
      <ul className="au-list">
        {shown.map((u) => (
          <li key={u.agent} className="au-item">
            <div className="au-row">
              <strong>{u.name}</strong>
              <button type="button" className="au-close" aria-label={`Dismiss ${u.name} update`} onClick={() => dismiss([keyOf(u)])}>
                ×
              </button>
            </div>
            <div className="au-row">
              <span className="mono small">
                <span className="muted">{u.installed ? `v${u.installed}` : "unknown"}</span> → <strong>v{u.latest}</strong>
              </span>
              {u.command?.length ? (
                <button type="button" className="btn small" onClick={() => void copy(u)}>
                  {copied === u.agent ? "Copied" : "Copy command"}
                </button>
              ) : null}
            </div>
            {u.command?.length ? (
              <p className="small muted">
                Run in a terminal: <code>{u.command.join(" ")}</code>
              </p>
            ) : (
              <p className="small muted">{u.note ?? "Update it with the tool you installed it with."}</p>
            )}
          </li>
        ))}
      </ul>
      <footer className="au-foot">
        <p className="small muted">
          Or run <code>controlrod agents update</code> to review and install each one.
        </p>
      </footer>
    </section>
  );
}
