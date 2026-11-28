// Resolves the user's login-shell environment when Control Rod is launched as a GUI app on macOS
// or Linux. A GUI app started by launchd/Finder inherits a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin),
// which hides Homebrew, mise, nvm, and ~/.local/bin where coding agent CLIs (claude, codex, agy,
// grok, opencode) and gh/git live.
//
// Patterned on sindresorhus/fix-path (MIT) and VS Code's shell-env probe; no code copied.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export const ENV_START_MARKER = "__CONTROLROD_SHELL_ENV_START__";
export const ENV_END_MARKER = "__CONTROLROD_SHELL_ENV_END__";

/**
 * Environment keys safe to inherit from the user's login shell into the launcher and daemon.
 * Secrets/API keys are intentionally excluded (the daemon's sandbox strips them too); agent CLIs
 * use their own user sign-ins under HOME / CLAUDE_CONFIG_DIR / CODEX_HOME.
 */
const ALLOWED_SHELL_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LANGUAGE",
  "TZ",
  "TMPDIR",
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
]);

function isAllowedShellKey(key: string): boolean {
  return ALLOWED_SHELL_KEYS.has(key) || key.startsWith("LC_");
}

/** Well-known user and package-manager CLI directories for macOS and Linux. */
export function commonCliDirs(home: string = homedir(), platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") return [];
  const dirs = [
    join(home, ".local", "bin"),
    join(home, ".local", "share", "mise", "shims"),
    join(home, ".asdf", "shims"),
    join(home, ".volta", "bin"),
    join(home, ".cargo", "bin"),
    join(home, "go", "bin"),
  ];
  if (platform === "darwin") {
    dirs.push("/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin");
  } else {
    dirs.push("/usr/local/bin", "/snap/bin");
  }
  return dirs;
}

/** Joins PATH strings/entries while deduplicating and preserving first-seen precedence. */
export function mergePaths(groups: readonly (string | undefined)[], sep: string = delimiter): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    if (!group) continue;
    for (const raw of group.split(sep)) {
      const entry = raw.trim();
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
    }
  }
  return out.join(sep);
}

/**
 * Parses NUL-delimited `env -0` output framed between start/end markers, ignoring any banner or
 * MOTD text printed by shell startup files.
 */
export function parseNullDelimitedEnv(
  raw: string,
  startMarker: string = ENV_START_MARKER,
  endMarker: string = ENV_END_MARKER,
): Record<string, string> {
  const start = raw.indexOf(startMarker);
  if (start < 0) return {};
  const end = raw.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return {};
  const payload = raw.slice(start + startMarker.length, end);
  const env: Record<string, string> = {};
  for (const entry of payload.split("\0")) {
    if (!entry) continue;
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    const key = entry.slice(0, eq);
    if (!isAllowedShellKey(key)) continue;
    env[key] = entry.slice(eq + 1);
  }
  return env;
}

export interface ProbeShellOptions {
  shell?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
  runner?: typeof spawnSync;
}

/**
 * Runs the user's login shell to capture PATH and safe locale/agent-config variables.
 * Tries interactive login (`-ilc`) first so `.zshrc`/`.bashrc` PATH edits are captured, and falls
 * back to non-interactive login (`-lc`) if interactive startup fails or times out.
 */
export function probeLoginShellEnv(options: ProbeShellOptions = {}): Record<string, string> {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") return {};

  const baseEnv = options.env ?? process.env;
  const shell = options.shell ?? baseEnv.SHELL ?? (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
  const timeoutMs = options.timeoutMs ?? 4000;
  const run = options.runner ?? spawnSync;
  const command = `printf '${ENV_START_MARKER}'; env -0; printf '${ENV_END_MARKER}'`;

  const probeEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    // Prevent interactive shell plugins (oh-my-zsh, tmux autostart) from blocking the probe.
    DISABLE_AUTO_UPDATE: "true",
    ZSH_TMUX_AUTOSTART: "false",
  };

  for (const flags of [["-ilc", command], ["-lc", command]] as const) {
    const res = run(shell, flags, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: timeoutMs,
      env: probeEnv,
    });
    if (res.status === 0 && typeof res.stdout === "string") {
      const parsed = parseNullDelimitedEnv(res.stdout);
      if (Object.keys(parsed).length > 0) return parsed;
    }
  }
  return {};
}

export interface ResolveDesktopEnvOptions extends ProbeShellOptions {
  home?: string;
  sep?: string;
}

/**
 * Produces the child-process environment for the Control Rod launcher and daemon so agent CLIs
 * (Claude Code, Codex, Antigravity, Grok, OpenCode) are found identically from a double-clicked
 * GUI app and from a terminal.
 */
export function resolveDesktopEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  options: ResolveDesktopEnvOptions = {},
): NodeJS.ProcessEnv {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") return { ...baseEnv };

  const home = options.home ?? baseEnv.HOME ?? homedir();
  const sep = options.sep ?? delimiter;
  const probed = baseEnv.CONTROLROD_SKIP_SHELL_ENV === "1" ? {} : probeLoginShellEnv({ ...options, env: baseEnv, platform });

  const merged: NodeJS.ProcessEnv = { ...baseEnv };
  for (const [key, value] of Object.entries(probed)) {
    if (key === "PATH") continue;
    if (!merged[key]) merged[key] = value;
  }

  merged.PATH = mergePaths([probed.PATH, baseEnv.PATH, ...commonCliDirs(home, platform)], sep);
  return merged;
}
