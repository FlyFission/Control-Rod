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

/** The npm package each built-in agent is published as. Antigravity has none. */
const PACKAGE: Partial<Record<AgentUpdate["agent"], string>> = {
  claude: "@anthropic-ai/claude-code",
  codex: "@openai/codex",
  opencode: "opencode-ai",
  grok: "@xai-official/grok",
};
/** SemVer 2.0 without build metadata, the same pattern as the contract's `latest`. */
const SEMVER = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(-(0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;

/**
 * The command shown and copied, built here from fixed parts: never text from the daemon or the
 * control plane. Undefined unless the daemon found npm's global copy and `latest` is strict SemVer.
 */
const validVersion = (v: string) => v.length <= 64 && SEMVER.test(v);

export function npmCommand(u: AgentUpdate): string | undefined {
  const pkg = PACKAGE[u.agent];
  if (!u.npm_global || !pkg || !validVersion(u.latest)) return undefined;
  return `npm install --global ${pkg}@${u.latest}`;
}

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

  // An entry whose version is not strict SemVer is not shown at all, and one agent at one version
  // is shown once.
  const shown = (q.data?.agent_updates ?? []).filter((u, i, all) => validVersion(u.latest) && !dismissed.includes(keyOf(u)) && all.findIndex((o) => keyOf(o) === keyOf(u)) === i);
  if (shown.length === 0) return null;

  const dismiss = (keys: string[]) => {
    const next = [...new Set([...dismissed, ...keys])];
    setDismissed(next);
    writeDismissed(next);
  };
  const copy = async (u: AgentUpdate) => {
    try {
      await navigator.clipboard.writeText(npmCommand(u)!);
      setCopied(keyOf(u));
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
          <li key={keyOf(u)} className="au-item">
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
              {npmCommand(u) ? (
                <button type="button" className="btn small" onClick={() => void copy(u)}>
                  {copied === keyOf(u) ? "Copied" : "Copy command"}
                </button>
              ) : null}
            </div>
            {npmCommand(u) ? (
              <p className="small muted">
                Run in a terminal: <code>{npmCommand(u)}</code>
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
