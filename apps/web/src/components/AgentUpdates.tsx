import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { AgentId, AgentUpdate } from "../api/types.js";
import { type Passkeys, browserPasskeys, signAdmin } from "../lib/decide.js";

/**
 * Agent updates (change record agent-update-prompt). When the app opens, the daemon's startup check
 * says which agent CLIs have a newer version. Each shows installed and latest version and the exact
 * command the daemon would run. Update and Update all are signed requests; the daemon runs only its
 * own command, while no run is active. Nothing here runs on a timer, and nothing installs unasked.
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

export function AgentUpdates({ passkeys = browserPasskeys }: { passkeys?: Passkeys } = {}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["runtimes"], queryFn: api.runtimes });
  const admin = useQuery({ queryKey: ["admin"], queryFn: api.admin });
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const update = useMutation({
    mutationFn: (agents: AgentId[]) => signAdmin("runtime.update", { agents }, passkeys),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["runtimes"] }),
  });

  const requested = new Set<string>(q.data?.agent_updates_requested ?? []);
  const shown = (q.data?.agent_updates ?? []).filter((u) => !dismissed.includes(keyOf(u)));
  if (shown.length === 0) return null;

  const may = admin.data?.actions.find((a) => a.command === "runtime.update");
  const allowed = may?.allowed === true;
  const updatable = shown.filter((u) => u.command?.length && !requested.has(u.agent));
  const dismiss = (keys: string[]) => {
    const next = [...new Set([...dismissed, ...keys])];
    setDismissed(next);
    writeDismissed(next);
  };
  const noun = shown.length === 1 ? "agent update" : "agent updates";

  return (
    <section className="agent-updates" aria-labelledby="agent-updates-title">
      <header className="au-head">
        <div>
          <h2 id="agent-updates-title">
            {shown.length} {noun}
          </h2>
          <p className="muted small">Newer versions bring bug fixes, new models and features.</p>
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
                requested.has(u.agent) ? (
                  <span className="small muted">Queued</span>
                ) : (
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={!allowed || update.isPending}
                    title={allowed ? undefined : may?.reason}
                    onClick={() => update.mutate([u.agent])}
                  >
                    Update
                  </button>
                )
              ) : null}
            </div>
            {u.command?.length ? (
              <p className="small muted">
                Runs <code>{u.command.join(" ")}</code>
              </p>
            ) : (
              <p className="small muted">{u.note ?? "Update it with the tool you installed it with."}</p>
            )}
            {requested.has(u.agent) && <p className="small muted">The daemon updates it when no run is active.</p>}
            {u.last_attempt?.outcome === "failed" && (
              <p className="small error" role="alert">
                The last update failed{u.last_attempt.detail ? `: ${u.last_attempt.detail}` : "."}
              </p>
            )}
          </li>
        ))}
      </ul>
      <footer className="au-foot">
        {may !== undefined && !allowed && <p className="small muted">{may.reason}</p>}
        {update.error && (
          <p className="small error" role="alert">
            {update.error.message}
          </p>
        )}
        {updatable.length > 1 && (
          <button
            type="button"
            className="btn small primary"
            disabled={!allowed || update.isPending}
            title={allowed ? undefined : may?.reason}
            onClick={() => update.mutate(updatable.map((u) => u.agent))}
          >
            Update all
          </button>
        )}
      </footer>
    </section>
  );
}
