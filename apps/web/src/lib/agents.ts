import type { AgentSetupView, CheckIn, RuntimeStatus, SubscriptionView, Writing } from "../api/types.js";

/**
 * The agents roster and first-run setup share one view of each agent. It joins three things the app
 * already has: what the daemon found (/runtimes), what each CLI's own status command said
 * (/subscriptions), and the person's seat (/setup). The status line says, in plain words, why an agent
 * is or is not able to work, so the roster and Provider CLIs never disagree.
 */

export type AgentId = "claude" | "codex" | "agy" | "grok" | "opencode" | "ollama";

export interface AgentInfo {
  id: AgentId;
  name: string;
  vendor: string;
  /** Control Rod can launch it under a sandbox today. The others are listed so people know they are coming. */
  runnable: boolean;
  /** How to install it, for a runnable agent that was not found. From each vendor's own install page. */
  install?: string;
  /** How to sign in, for a runnable agent that is installed and signed out. */
  signIn?: string;
}

/** Built-in agents, in the order the dispatcher prefers them (services/api/src/work.ts pickRuntime). */
export const AGENTS: readonly AgentInfo[] = [
  { id: "claude", name: "Claude Code", vendor: "Anthropic", runnable: true, install: "npm install -g @anthropic-ai/claude-code", signIn: "claude" },
  { id: "codex", name: "Codex", vendor: "OpenAI", runnable: true, install: "npm install -g @openai/codex", signIn: "codex login" },
  { id: "agy", name: "Antigravity", vendor: "Google", runnable: true, signIn: "agy" },
  { id: "grok", name: "Grok CLI", vendor: "xAI", runnable: true, install: "npm install -g @xai-official/grok", signIn: "grok" },
  { id: "opencode", name: "OpenCode", vendor: "any provider", runnable: false },
  { id: "ollama", name: "Local model (Ollama)", vendor: "runs on this computer", runnable: false },
];

export type AgentState = "ready" | "not-checked" | "not-found" | "signed-out" | "held" | "not-yet";

export interface AgentRow {
  info: AgentInfo;
  seated: boolean;
  state: AgentState;
  /** One plain sentence: why it can or cannot work now. */
  status: string;
  /** A command the person can run to fix it, when there is one. */
  fix?: string;
  version?: string;
  path?: string;
}

const NOT_YET =
  "Control Rod can't run this one yet: it needs a sandbox Control Rod can hold, and that isn't built. It joins the table when it is.";

export function agentRows(runtimes: RuntimeStatus[] | undefined, subs: SubscriptionView | undefined, setup: AgentSetupView | undefined): AgentRow[] {
  const reported = runtimes !== undefined && (runtimes.length > 0 || subs?.reported === true);
  return AGENTS.map((info) => {
    const seat = setup?.seats.find((s) => s.runtime === info.id);
    const seated = info.runnable ? (seat?.seated ?? true) : false;
    const rt = runtimes?.find((r) => r.runtime === info.id);
    const probe = subs?.probes.find((p) => p.id === info.id);
    const version = probe?.observed_version ?? rt?.version;
    const path = probe?.path ?? rt?.artifact?.path;
    const base = { info, seated, ...(version ? { version } : {}), ...(path ? { path } : {}) };
    if (!info.runnable) return { ...base, state: "not-yet", status: NOT_YET };
    if (!reported) return { ...base, state: "not-checked", status: "Not checked yet. Control Rod checks each agent when it starts, then every few minutes." };
    if (rt?.ready) return { ...base, state: "ready", status: "Ready. Installed, signed in, and passing Control Rod's checks." };
    const installed = probe?.installed ?? rt !== undefined;
    if (!installed)
      return { ...base, state: "not-found", status: "Not found on this computer.", ...(info.install ? { fix: info.install } : {}) };
    if (probe?.auth === "signed-out")
      return { ...base, state: "signed-out", status: "Installed, but not signed in.", ...(info.signIn ? { fix: info.signIn } : {}) };
    const why = rt?.reason ? plainReason(rt.reason, info.id) : "Control Rod's last check did not pass, and the check gave no reason.";
    return { ...base, state: "held", status: `Installed${probe?.auth === "signed-in" ? " and signed in" : ""}, but Control Rod won't give it work yet. ${why}` };
  });
}

/** The daemon's reason, as one sentence ending in a full stop. It is already written in plain words. */
function plainReason(reason: string, runtime: string): string {
  // The daemon's sentence often opens with "<runtime> is installed, but", which the row already says.
  let r = reason.trim().replace(new RegExp(`^${runtime} is installed,? but\\s+`, "i"), "");
  r = r.charAt(0).toUpperCase() + r.slice(1);
  return /[.!?]$/.test(r) ? r : `${r}.`;
}

/**
 * What the person is setting up, read back before anything is saved. It is a preview, not a promise:
 * it follows the dispatcher's order (the author is the first ready, seated agent; the checker the next
 * from another vendor, never the author's own runtime), but a card's lane, pins and sandbox can still
 * change who takes a given job.
 */
export function readBack(rows: AgentRow[]): string {
  const working = rows.filter((r) => r.seated && r.state === "ready");
  const waiting = rows.filter((r) => r.seated && r.info.runnable && r.state !== "ready");
  const later = waiting.length > 0 ? ` ${list(waiting.map((r) => r.info.name))} ${waiting.length === 1 ? "is" : "are"} seated and will join once ${waiting.length === 1 ? "it's" : "they're"} ready.` : "";
  if (working.length === 0) return `No agent at the table can work yet, so new cards will wait.${later}`;
  const author = working[0]!;
  const checker = working.find((r) => r.info.vendor !== author.info.vendor);
  if (!checker)
    return `As things stand, ${author.info.name} would write the work. Nobody from another vendor can check it yet, so checks wait for a second agent unless you sign an override.${later}`;
  return `As things stand, ${author.info.name} would write the work and ${checker.info.name} would check it without seeing how it was written.${later}`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export const CHECK_IN_CHOICES: readonly { id: CheckIn; label: string; detail: string; today: boolean }[] = [
  { id: "start", label: "Just at the start", detail: "You approve the plan, and the agents carry it through.", today: false },
  { id: "start-and-merge", label: "At the start and before merge", detail: "You sign the plan's release, and you sign acceptance before anything merges or ships.", today: true },
  { id: "every-step", label: "At every step", detail: "You see the plan, the work, the check and the merge.", today: false },
];

/**
 * How agents write the prose the person reads (answers, the top of a deliverable, finding text).
 * Focus follows the rules in services/api/src/brief.ts FOCUS_WRITING, adapted from i-have-adhd (MIT).
 */
export const WRITING_CHOICES: readonly { id: Writing; label: string; detail: string }[] = [
  { id: "focus", label: "Focus", detail: "The outcome or next step first, numbered steps, short lists, one next step at the end. Nothing the work needs is left out." },
  { id: "standard", label: "Standard", detail: "Each agent writes in its own usual style." },
];

/** Said under a choice that is saved now but changes nothing yet. */
export const CHECK_IN_LATER =
  "Saved for when check-in points arrive. Until then, what stops a card for you is set under What needs your passkey.";

/**
 * Which known agent a run's provider names (RuntimeRef.provider), so a figure can show its agent's
 * icon. Providers are matched exactly, lower-cased; a provider this table does not list has no icon
 * of its own and gets the generic glyph. Add a row here to give a new agent its badge.
 */
const PROVIDER_AGENT: Readonly<Record<string, AgentId>> = {
  claude: "claude",
  "claude-code": "claude",
  anthropic: "claude",
  codex: "codex",
  openai: "codex",
  agy: "agy",
  antigravity: "agy",
  grok: "grok",
  opencode: "opencode",
  ollama: "ollama",
};

export function agentIdForProvider(provider: string | undefined): AgentId | undefined {
  return provider ? PROVIDER_AGENT[provider.toLowerCase()] : undefined;
}
