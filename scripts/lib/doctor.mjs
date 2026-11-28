// What `controlrod doctor` checks on this machine, apart from the database (which needs the
// installed packages; scripts/cr.mjs checks it). Everything it reads comes through its first
// argument (`machine()` for the real one), so the tests can stand in a platform, a user id and the
// commands on PATH.
import { spawnSync } from "node:child_process";
import { openSync, readSync, closeSync, realpathSync } from "node:fs";
import { platform } from "node:os";

/** Anthropic's install of Claude Code's native build, the one the daemon can identify by digest. */
export const CLAUDE_NATIVE_INSTALL = "curl -fsSL https://claude.ai/install.sh | bash";

/** The real machine. */
export function machine(env = process.env) {
  const os = platform();
  const which = (cmd) => {
    const r = spawnSync(os === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
    return r.status === 0 ? r.stdout.trim().split("\n")[0] : null;
  };
  const version = (cmd, args = ["--version"]) => {
    const r = spawnSync(cmd, args, { encoding: "utf8" });
    return r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0] : null;
  };
  return {
    platform: () => os,
    getuid: () => (typeof process.getuid === "function" ? process.getuid() : undefined),
    env,
    node: process.versions.node,
    which,
    version,
    run: (cmd, args, opts) => spawnSync(cmd, args, { encoding: "utf8", ...opts }),
    realpath: (p) => {
      try {
        return realpathSync(p);
      } catch {
        return p;
      }
    },
    head: (p) => {
      try {
        const fd = openSync(p, "r");
        try {
          const b = Buffer.alloc(4);
          const n = readSync(fd, b, 0, 4, 0);
          return b.subarray(0, n);
        } finally {
          closeSync(fd);
        }
      } catch {
        return Buffer.alloc(0);
      }
    },
  };
}

export function nodeVersionOk(v) {
  const [maj, min] = v.split(".").map(Number);
  return maj > 22 || (maj === 22 && min >= 12);
}

/** A native executable (ELF or Mach-O), as the daemon's isNative reads it (daemon/internal/runner/artifact.go). */
function isNative(head) {
  if (head.length < 4) return false;
  const h = head.toString("hex");
  return h === "7f454c46" || ["cffaedfe", "cefaedfe", "cafebabe"].includes(h);
}

/**
 * Mirrors QualifiedPlatform and the Linux sandbox preflight in daemon/internal/runner/sandbox.go: agent
 * runs are offered on WSL2, native Linux and macOS. On Linux and WSL2 each CLI's sandbox is bubblewrap,
 * and Claude Code's network proxy needs socat. Returns one { text, blocking } per problem; blocking
 * marks a platform where no agent can ever run (native Windows).
 */
export function agentRunProblems(d) {
  const os = d.platform();
  if (os === "darwin") return d.which("sandbox-exec") ? [] : [{ text: "Seatbelt (sandbox-exec) was not found on PATH", blocking: false }];
  if (os === "win32") {
    return [{ text: "native Windows can't run agents. Install WSL2 (wsl --install), then install and run Control Rod inside it", blocking: true }];
  }
  if (os !== "linux") return [{ text: `agent runs are not qualified on ${os} yet`, blocking: false }];
  const problems = [];
  const bwrap = d.which("bwrap");
  if (!bwrap) problems.push({ text: "bubblewrap is missing: sudo apt install bubblewrap", blocking: false });
  if (!d.which("socat")) problems.push({ text: "socat is missing (Claude Code needs it): sudo apt install socat", blocking: false });
  if (bwrap) {
    const r = d.run("bwrap", ["--unshare-user", "--unshare-net", "--ro-bind", "/", "/", "--dev", "/dev", "true"], { timeout: 15000 });
    if (r.status !== 0) {
      problems.push({
        text:
          "bubblewrap cannot create a sandbox here, usually because Ubuntu 24.04 and later turn off user" +
          '\n      namespaces by default. Allow it for bubblewrap only: see "Linux setup" in docs/daemon.md',
        blocking: false,
      });
    }
  }
  return problems;
}

/**
 * One row per agent CLI: ok with its version, or `--` with what stands in the way and the fix. These are
 * the quick checks; the daemon's own (`controlrod runtimes`) follow in a full doctor.
 */
export function agentCliRows(d) {
  const os = d.platform();
  const rows = [];
  const claude = d.which("claude");
  if (!claude) rows.push(`--    claude (Claude Code): not installed. Install the native build, then run claude once to sign in: ${CLAUDE_NATIVE_INSTALL}`);
  else if (!isNative(d.head(d.realpath(claude)))) {
    rows.push(
      "--    claude (Claude Code): starts through a script (an npm or pnpm install). Control Rod runs only a native program it can" +
        "\n      identify, and finds one in an npm install when npm's install step ran. If the agent checks below refuse it," +
        `\n      install the native build: ${CLAUDE_NATIVE_INSTALL}`,
    );
  } else rows.push(`ok    claude (Claude Code, your login): ${d.version("claude") ?? "found"}`);
  const codex = d.which("codex");
  rows.push(codex ? `ok    codex (Codex, an independent pre-check runtime): ${d.version("codex") ?? "found"}` : "--    codex (optional, for an independent pre-check runtime): not installed. npm install -g @openai/codex");
  for (const [cmd, name] of [
    ["agy", "Antigravity"],
    ["grok", "Grok CLI"],
  ]) {
    if (!d.which(cmd)) continue;
    rows.push(os === "darwin" ? `ok    ${cmd} (${name}): ${d.version(cmd) ?? "found"}` : `--    ${cmd} (${name}): found, but Control Rod runs it on macOS only (its sandbox is checked there alone)`);
  }
  return rows;
}

/**
 * The machine rows of `doctor`. Returns the tool rows (lines), the rows that bear on agent runs
 * (agentLines, which a background start always prints), the notes that follow them, whether the app
 * can start (ok), whether agent runs can start (agentsOk, which `doctor --strict` also requires) and
 * whether this platform can never run agents (blocking, native Windows).
 */
export function checkMachine(d, { me = "controlrod" } = {}) {
  const lines = [];
  const agentLines = [];
  let ok = true;
  let agentsOk = true;
  const uid = d.getuid();
  // The bundled PostgreSQL refuses to run as root. Say so as one row and keep checking the rest.
  if (uid === 0 && !d.env.CONTROLROD_DATABASE_URL) {
    lines.push(
      "MISSING  ordinary user: you are running as root. The bundled PostgreSQL will not start as root: use an ordinary" +
        "\n      user account, or set CONTROLROD_DATABASE_URL to your own PostgreSQL 17 superuser connection.",
    );
    ok = false;
  }
  // `node` on PATH is what the build and the server run; the version check reads the node running this.
  const nodeFound = d.version("node");
  if (nodeFound && !nodeVersionOk(d.node)) {
    lines.push(`MISSING  node 22.12+: found ${nodeFound}, need >= v22.12.0`);
    ok = false;
  } else if (!nodeFound) {
    lines.push("MISSING  node 22.12+");
    ok = false;
  } else lines.push(`ok    node 22.12+: ${nodeFound}`);
  for (const [name, found, required] of [
    ["pnpm", d.version("pnpm"), true],
    ["go", d.version("go", ["version"]), true],
    // The web build runs tools/check_theme_assets.py, so the first start needs Python 3.
    ["python3 (the web build runs a Python check)", d.version("python3"), true],
    ["uv (optional, for Python SDK and contributor checks)", d.version("uv"), false],
  ]) {
    lines.push(`${found ? "ok  " : required ? "MISSING" : "--  "}  ${name}${found ? `: ${found}` : ""}`);
    if (!found && required) ok = false;
  }
  const problems = agentRunProblems(d);
  if (problems.length === 0) agentLines.push("ok    agent runs: the sandbox can start on this platform");
  for (const p of problems) agentLines.push(`${p.blocking ? "MISSING" : "--  "}  agent runs: ${p.text}`);
  if (problems.length) agentsOk = false;
  const cliRows = agentCliRows(d);
  agentLines.push(...cliRows);
  // At least one agent Control Rod can start here, found on PATH.
  const startable = d.platform() === "darwin" ? ["claude", "codex", "agy", "grok"] : ["claude", "codex"];
  if (!startable.some((c) => d.which(c))) agentsOk = false;
  const notes = [];
  if (problems.some((p) => !p.blocking)) {
    notes.push(
      "The app, the board, the office view and the records work without this. The daemon will not start an" +
        "\nagent until the sandbox can hold, and it says why.",
    );
  }
  if (!agentsOk) notes.push(`Agent runs can't start on this machine yet (the rows above say why). \`${me} doctor --strict\` exits 1 until they can.`);
  return { lines, agentLines, notes, ok, agentsOk, blocking: problems.some((p) => p.blocking) };
}
