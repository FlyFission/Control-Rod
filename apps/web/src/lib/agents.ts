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
  /** Control Rod starts it on macOS only: its sandbox has been checked there alone (daemon ConfinementGap). */
  macOSOnly?: boolean;
  /** How to install it, for a runnable agent that was not found. From each vendor's own install page. */
  install?: string;
  /** Where to get it when there is no one-line install command. */
  installWhere?: string;
  /** How to sign in, for a runnable agent that is installed and signed out. */
  signIn?: string;
}

/**
 * Anthropic's install of Claude Code's native build. Control Rod runs the native executable it can
 * identify by digest; an npm install works only when npm's install step copied that executable in.
 */
export const CLAUDE_NATIVE_INSTALL = "curl -fsSL https://claude.ai/install.sh | bash";

/** Built-in agents, in the order the dispatcher prefers them (services/api/src/work.ts pickRuntime). */
export const AGENTS: readonly AgentInfo[] = [
  { id: "claude", name: "Claude Code", vendor: "Anthropic", runnable: true, install: CLAUDE_NATIVE_INSTALL, signIn: "claude" },
  { id: "codex", name: "Codex", vendor: "OpenAI", runnable: true, install: "npm install -g @openai/codex", signIn: "codex login" },
  { id: "agy", name: "Antigravity", vendor: "Google", runnable: true, macOSOnly: true, installWhere: "Install Antigravity from Google's Antigravity download page, then run agy once to sign in.", signIn: "agy" },
  { id: "grok", name: "Grok CLI", vendor: "xAI", runnable: true, macOSOnly: true, install: "npm install -g @xai-official/grok", signIn: "grok" },
  { id: "opencode", name: "OpenCode", vendor: "any provider", runnable: false },
  { id: "ollama", name: "Local model (Ollama)", vendor: "runs on this computer", runnable: false },
];

/**
 * "not-here": Control Rod does not start this agent on this platform (Antigravity and Grok run on
 * macOS only). "not-yet": Control Rod cannot run it anywhere yet.
 */
export type AgentState = "ready" | "not-checked" | "not-found" | "signed-out" | "held" | "not-here" | "not-yet";

export interface AgentRow {
  info: AgentInfo;
  /** At the table. An agent that is not installed, or not available here, is never seated. */
  seated: boolean;
  state: AgentState;
  /** The daemon or the CLI's own status found it on this computer. */
  installed: boolean;
  /** One plain sentence: why it can or cannot work now. */
  status: string;
  /** A command the person can run to fix it, when there is one. */
  fix?: string;
  /** What running the fix does, when it is not the usual install or sign-in. */
  fixLabel?: string;
  /** For "not-here": the platform it is not available on, in words ("Linux"). */
  unavailableOn?: string;
  version?: string;
  path?: string;
}

const NOT_YET =
  "Not available yet. Control Rod can't run this one: it needs a sandbox Control Rod can hold, and that isn't built. It joins the table when it is.";

/** The platform as the daemon reported it, in words; undefined when it was not reported. */
export function platformWords(platform: string | undefined): string | undefined {
  if (platform === undefined) return undefined;
  if (platform === "darwin") return "macOS";
  if (platform === "linux" || platform === "wsl2") return "Linux";
  return "this computer";
}

/** Whether Control Rod starts this agent on the reported platform. Unknown platforms are not gated. */
export function availableHere(info: Pick<AgentInfo, "macOSOnly">, platform: string | undefined): boolean {
  return !info.macOSOnly || platform === undefined || platform === "darwin";
}

/** A reason that says the CLI starts through a script Control Rod cannot pin (daemon ErrUnsupportedLauncher). */
const SCRIPT_LAUNCHER = /identify (it )?by digest|starts through the script/i;

export function agentRows(runtimes: RuntimeStatus[] | undefined, subs: SubscriptionView | undefined, setup: AgentSetupView | undefined): AgentRow[] {
  const reported = runtimes !== undefined && (runtimes.length > 0 || subs?.reported === true);
  const platform = subs?.platform;
  return AGENTS.map((info): AgentRow => {
    const seat = setup?.seats.find((s) => s.runtime === info.id);
    const rt = runtimes?.find((r) => r.runtime === info.id);
    const probe = subs?.probes.find((p) => p.id === info.id);
    const version = probe?.observed_version ?? rt?.version;
    const path = probe?.path ?? rt?.artifact?.path;
    const installed = reported && (probe?.installed ?? rt !== undefined);
    const extra = { ...(version ? { version } : {}), ...(path ? { path } : {}) };
    const off = (state: AgentState, status: string, more: Partial<AgentRow> = {}): AgentRow => ({ info, seated: false, state, installed, status, ...extra, ...more });
    const on = (state: AgentState, status: string, more: Partial<AgentRow> = {}): AgentRow => ({ info, seated: seat?.seated ?? true, state, installed, status, ...extra, ...more });
    if (!info.runnable) return off("not-yet", NOT_YET);
    if (!availableHere(info, platform)) {
      const where = platformWords(platform)!;
      return off(
        "not-here",
        `${installed ? "Installed, but n" : "N"}ot available on ${where}. Control Rod runs ${info.name} on macOS only, because its sandbox has been checked there alone.`,
        { unavailableOn: where },
      );
    }
    if (!reported) return on("not-checked", "Not checked yet. Control Rod checks each agent when it starts, then every few minutes.");
    if (rt?.ready) return on("ready", "Ready. Installed, signed in, and passing Control Rod's checks.");
    if (!installed) {
      return off("not-found", info.install ? "Not installed on this computer." : `Not installed on this computer. ${info.installWhere ?? ""}`.trim(), {
        ...(info.install ? { fix: info.install } : {}),
      });
    }
    if (probe?.auth === "signed-out") return on("signed-out", "Installed, but not signed in.", info.signIn ? { fix: info.signIn } : {});
    const signedIn = probe?.auth === "signed-in" ? " and signed in" : "";
    if (rt?.reason && SCRIPT_LAUNCHER.test(rt.reason) && info.id === "claude") {
      return on(
        "held",
        `Installed${signedIn}, but Control Rod won't give it work yet. This install starts Claude Code through a script (an npm or pnpm install), and Control Rod only runs the native program it can identify. The native build fixes it.`,
        { fix: CLAUDE_NATIVE_INSTALL, fixLabel: "To install the native build, run" },
      );
    }
    const why = rt?.reason ? plainReason(rt.reason, info.id) : "Control Rod's last check did not pass, and the check gave no reason.";
    return on("held", `Installed${signedIn}, but Control Rod won't give it work yet. ${why}`);
  });
}

/** The person can seat or bench this agent: Control Rod can run it here and it is installed (or not checked yet). */
export function seatable(row: AgentRow): boolean {
  return row.info.runnable && row.state !== "not-found" && row.state !== "not-here" && row.state !== "not-yet";
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
  {
    id: "start-and-merge",
    label: "At the start and before merge",
    detail: "Cards stop for you where What needs your passkey says. With the default settings, a card starts on its own and you sign acceptance before anything merges or ships.",
    today: true,
  },
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
