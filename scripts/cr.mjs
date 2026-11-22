#!/usr/bin/env node
// Control Rod on one machine: `pnpm cr doctor`, `pnpm cr setup`, `pnpm cr start`, and
// `pnpm cr verify <file>` to check a downloaded inclusion proof offline.
// Starts the control plane (with an embedded Postgres unless CONTROLROD_DATABASE_URL is set),
// the run daemon, and serves the web app at http://localhost:7300.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = process.env.CONTROLROD_HOME ?? join(homedir(), ".controlrod");
const bin = join(home, "bin");
const port = Number(process.env.CONTROLROD_PORT ?? 7300);

const which = (cmd) => {
  const r = spawnSync(platform() === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("\n")[0] : null;
};
const version = (cmd, args = ["--version"]) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0] : null;
};
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
};

/**
 * The bundled PostgreSQL is a prebuilt binary. On Linux it links against system libraries (ICU in
 * particular) whose version differs between distributions; when one is missing it dies with a stack
 * trace deep inside the database package. Look first and say so plainly. Returns text, or null if fine.
 */
function embeddedDatabaseProblem() {
  if (platform() !== "linux" || !which("ldd")) return null;
  const store = join(root, "node_modules", ".pnpm");
  if (!existsSync(store)) return null;
  const pkg = readdirSync(store).find((d) => d.startsWith("@embedded-postgres+linux-"));
  if (!pkg) return null;
  const initdb = join(store, pkg, "node_modules", "@embedded-postgres", pkg.slice("@embedded-postgres+".length).replace(/@.*$/, ""), "native", "bin", "initdb");
  if (!existsSync(initdb)) return null;
  const r = spawnSync("ldd", [initdb], { encoding: "utf8" });
  const missing = (r.stdout ?? "").split("\n").filter((l) => l.includes("not found")).map((l) => l.trim().split(" ")[0]);
  return missing.length ? `It needs shared libraries this system does not have: ${missing.join(", ")}.` : null;
}

/** Prints the database row for `doctor`; false when the bundled database cannot run and no other is set. */
function databaseOk() {
  if (process.env.CONTROLROD_DATABASE_URL) {
    console.log("ok    database: using CONTROLROD_DATABASE_URL");
    return true;
  }
  const problem = embeddedDatabaseProblem();
  if (!problem) {
    console.log("ok    database: bundled PostgreSQL");
    return true;
  }
  console.log("MISSING  database: the bundled PostgreSQL cannot start on this machine");
  console.log(`\n${problem}\n`);
  console.log(
    "First try a clean install, which creates library links an older install can skip:\n" +
      "  rm -rf node_modules && pnpm install\n" +
      "If that does not fix it, use your own PostgreSQL 17 instead. For example, with Docker:\n" +
      "  docker run -d --name controlrod-pg -e POSTGRES_PASSWORD=controlrod -p 127.0.0.1:5432:5432 postgres:17\n" +
      "  export CONTROLROD_DATABASE_URL=postgres://postgres:controlrod@127.0.0.1:5432/postgres\n" +
      "Postgres.app or Homebrew (`brew install postgresql@17`) work the same way: point CONTROLROD_DATABASE_URL at a\n" +
      "superuser connection, then run this command again.\n",
  );
  return false;
}

/**
 * Mirrors QualifiedPlatform and the Linux sandbox preflight in daemon/internal/runner/sandbox.go: agent
 * runs are offered on WSL2, native Linux and macOS. On Linux and WSL2 each CLI's sandbox is bubblewrap,
 * and Claude Code's network proxy needs socat, so say what is missing before setup instead of after.
 * Returns one line per problem, or an empty list when agent runs can start here.
 */
function agentRunProblems() {
  const os = platform();
  if (os === "darwin") return [];
  if (os !== "linux") return [`agent runs are not qualified on ${os} yet; use WSL2 on Windows`];
  const problems = [];
  if (!which("bwrap")) problems.push("bubblewrap is missing: sudo apt install bubblewrap");
  if (!which("socat")) problems.push("socat is missing (Claude Code needs it): sudo apt install socat");
  if (which("bwrap")) {
    const r = spawnSync("bwrap", ["--unshare-user", "--unshare-net", "--ro-bind", "/", "/", "--dev", "/dev", "true"], {
      encoding: "utf8",
      timeout: 15000,
    });
    if (r.status !== 0) {
      problems.push(
        "bubblewrap cannot create a sandbox here, usually because Ubuntu 24.04 and later turn off user" +
          '\n      namespaces by default. Allow it for bubblewrap only: see "Linux setup" in docs/daemon.md',
      );
    }
  }
  return problems;
}

function doctor() {
  // The bundled PostgreSQL refuses to run as root, and it fails with a stack trace well after setup has
  // built everything. Catch it first, unless the caller brings their own database.
  if (typeof process.getuid === "function" && process.getuid() === 0 && !process.env.CONTROLROD_DATABASE_URL) {
    console.log("MISSING  ordinary user: you are running as root");
    console.log(
      "\nThe bundled PostgreSQL will not start as root. Run Control Rod from an ordinary user account, or set\n" +
        "CONTROLROD_DATABASE_URL to your own PostgreSQL 17 superuser connection and run this command again.\n",
    );
    return false;
  }
  const rows = [
    ["node 22+", version("node"), true],
    ["pnpm", version("pnpm"), true],
    ["go", version("go", ["version"]), true],
    ["uv (Python tools)", version("uv"), true],
    ["claude (Claude Code, your login)", which("claude") && version("claude"), false],
    ["codex (optional, for an independent pre-check runtime)", which("codex") && version("codex"), false],
  ];
  let ok = true;
  for (const [name, found, required] of rows) {
    console.log(`${found ? "ok  " : required ? "MISSING" : "--  "}  ${name}${found ? `: ${found}` : ""}`);
    if (!found && required) ok = false;
  }
  if (!databaseOk()) ok = false;
  const problems = agentRunProblems();
  if (problems.length === 0) console.log("ok    agent runs: the sandbox can start on this platform");
  for (const p of problems) console.log(`--    agent runs: ${p}`);
  if (problems.length) {
    console.log(
      "\nThe app, the board, the office view and the records work without this. The daemon will not start an" +
        "\nagent until the sandbox can hold, and it says why.",
    );
  }
  if (!which("claude")) console.log("\nInstall Claude Code and sign in so agents can run on your subscription.");
  if (!which("codex")) {
    console.log(
      "\nWithout Codex, every pre-check waits for an independent runtime. It never runs on the author's runtime on its own." +
        "\nTo go ahead with Claude alone, open each held pre-check, write why, and sign the override with your passkey." +
        "\nA different Claude model does not count as independent. The signed override is recorded, and the pre-check" +
        "\nrecord shows a shared runtime with your override.",
    );
  }
  return ok;
}

function newer(src, out) {
  if (!existsSync(out)) return true;
  const outTime = statSync(out).mtimeMs;
  const stack = [src];
  while (stack.length) {
    const p = stack.pop();
    const s = statSync(p);
    if (s.isDirectory()) {
      for (const e of readdirSync(p)) if (e !== "node_modules" && e !== "dist") stack.push(join(p, e));
    } else if (s.mtimeMs > outTime) return true;
  }
  return false;
}
function setup() {
  mkdirSync(bin, { recursive: true });
  if (!existsSync(join(root, "node_modules"))) run("pnpm", ["install", "--frozen-lockfile"]);
  if (newer(join(root, "apps", "web", "src"), join(root, "apps", "web", "dist", "index.html"))) {
    run("pnpm", ["--filter", "@control-rod/web", "build"]);
  }
  if (newer(join(root, "services", "api", "src"), join(root, "services", "api", "dist", "server.js"))) {
    run("pnpm", ["--filter", "@control-rod/api", "build"]);
  }
  run("go", ["build", "-o", join(bin, "controlrod"), "./cmd/controlrod"], { cwd: join(root, "daemon") });
}

async function waitForHealth() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The control plane did not start");
}

async function start() {
  if (!doctor()) process.exit(1);
  setup();
  // On a first run the database package was not installed yet when `doctor` looked; look again now.
  if (!databaseOk()) process.exit(1);
  const env = { ...process.env, CONTROLROD_HOME: home };
  // In GitHub Codespaces the browser reaches the app at a forwarded https address, not localhost, and a
  // passkey is bound to the address it was made on. Use that address unless the caller chose one.
  const csName = process.env.CODESPACE_NAME;
  const csDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (csName && csDomain && !process.env.CONTROLROD_ORIGIN) {
    const host = `${csName}-${port}.${csDomain}`;
    env.CONTROLROD_ORIGIN = `https://${host}`;
    env.CONTROLROD_RP_ID ??= host;
  }
  env.PATH = [bin, env.PATH].filter(Boolean).join(delimiter);

  const api = spawn("node", [join(root, "services", "api", "dist", "server.js")], { env, stdio: "inherit" });
  await waitForHealth();
  // The daemon reads its token from CONTROLROD_HOME/daemon.token, and reads it again if the control
  // plane restarts and writes a new one; passing it in the environment would pin the old token.
  const daemonEnv = { ...env, CONTROLROD_API: `http://127.0.0.1:${port}` };
  delete daemonEnv.CONTROLROD_DAEMON_TOKEN;
  const daemon = spawn(join(bin, "controlrod"), ["daemon", "--parallel", process.env.CONTROLROD_PARALLEL ?? "3"], {
    env: daemonEnv,
    stdio: "inherit",
  });
  console.log(`\nControl Rod: open ${env.CONTROLROD_ORIGIN ?? `http://localhost:${port}`} (Ctrl+C stops everything)\n`);
  const stop = () => {
    daemon.kill("SIGTERM");
    api.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  api.on("exit", (code) => {
    daemon.kill("SIGTERM");
    process.exit(code ?? 0);
  });
}

/**
 * Checks downloaded inclusion proofs with nothing but the files: no database, no server. Builds the
 * control plane first if its sources changed, since the check is the control plane's own function.
 */
function verify(files) {
  if (!existsSync(join(root, "node_modules"))) run("pnpm", ["install", "--frozen-lockfile"]);
  if (newer(join(root, "services", "api", "src"), join(root, "services", "api", "dist", "verify-bundle.js"))) {
    run("pnpm", ["--filter", "@control-rod/api", "build"]);
  }
  const r = spawnSync("node", [join(root, "services", "api", "dist", "verify-bundle.js"), ...files], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

/**
 * Builds an honest Markdown PR receipt from a downloaded package inclusion proof offline.
 */
function receipt(file) {
  if (!existsSync(join(root, "node_modules"))) run("pnpm", ["install", "--frozen-lockfile"]);
  if (newer(join(root, "services", "api", "src"), join(root, "services", "api", "dist", "pr-receipt.js"))) {
    run("pnpm", ["--filter", "@control-rod/api", "build"]);
  }
  const r = spawnSync("node", [join(root, "services", "api", "dist", "pr-receipt.js"), ...(file ? [file] : [])], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const cmd = process.argv[2] ?? "start";
if (cmd === "doctor") process.exit(doctor() ? 0 : 1);
else if (cmd === "setup") setup();
else if (cmd === "start") await start();
else if (cmd === "verify") verify(process.argv.slice(3).map((f) => resolve(process.env.INIT_CWD ?? process.cwd(), f)));
else if (cmd === "receipt") {
  const f = process.argv[3];
  receipt(f ? resolve(process.env.INIT_CWD ?? process.cwd(), f) : undefined);
} else {
  console.log("Usage: pnpm cr [doctor|setup|start|verify <inclusion-proof.json>|receipt <inclusion-proof.json>]");
  process.exit(2);
}
