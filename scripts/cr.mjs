#!/usr/bin/env node
// Control Rod on one machine. Run as `controlrod <command>` from any folder once `pnpm cr link` has
// put that command on PATH, or as `pnpm cr <command>` inside this checkout: start, stop, restart,
// status, open, logs, update, doctor, setup, verify <file> (checks a downloaded inclusion proof
// offline), receipt, bench (Control Rod's own cross-vendor checking benchmark), link and unlink.
// Any other command goes to the run daemon's own CLI (`controlrod agents update`, for example).
// Starts the control plane (with an embedded Postgres unless CONTROLROD_DATABASE_URL is set),
// the run daemon, and serves the web app at http://localhost:7300.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandPath, link, ownerOf, refresh, unlink } from "./lib/link.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

// The command's own dependencies (package.json "dependencies") must load before anything imports
// them; an update stopped between moving the code and installing leaves them missing or half
// installed, and the command then installs them first instead of failing to load. Never while an
// update is running: that update installs them itself.
{
  const deps = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies ?? {});
  const missingDeps = async () => {
    const out = [];
    for (const d of deps) {
      try {
        await import(d);
      } catch (e) {
        if (!["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(e?.code)) throw e;
        out.push(d);
      }
    }
    return out;
  };
  const missing = await missingDeps();
  if (missing.length) {
    // The repair holds the update lock (the same proper-lockfile folder, kept fresh while pnpm
    // runs), so it never installs alongside an update or another repair. A lock nobody has
    // refreshed for 15 seconds is stale, as proper-lockfile treats it.
    const gitEnv = { ...process.env };
    for (const k of Object.keys(gitEnv)) if (k.startsWith("GIT_")) delete gitEnv[k];
    const gd = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8", env: gitEnv }).stdout?.trim();
    const lock = gd ? join(gd, "controlrod-update.lock") : join(root, "node_modules", ".controlrod-repair.lock");
    // Ownership-aware without files inside the folder (proper-lockfile removes a stale lock with a
    // plain rmdir): a holder knows its lock by the folder's inode and only ever removes that one. A
    // stale lock is taken over by renaming it aside (only one process can win that rename) and
    // checking that what was moved is still the stale folder that was looked at.
    const look = (dir) => {
      try {
        const st = statSync(dir);
        return { ino: st.ino, age: Date.now() - st.mtimeMs };
      } catch {
        return null;
      }
    };
    let mine = null;
    const take = () => {
      try {
        mkdirSync(lock);
      } catch (e) {
        if (e?.code !== "EEXIST") throw e;
        return false;
      }
      mine = look(lock)?.ino ?? null;
      return mine !== null;
    };
    const ownerOf = (dir) => look(dir)?.ino ?? null;
    let held = take();
    if (!held) {
      const seen = look(lock);
      if (seen && seen.age > 15000) {
        const aside = `${lock}.stale.${process.pid}.${Date.now()}`;
        let moved = false;
        try {
          renameSync(lock, aside);
          moved = true;
        } catch {}
        if (moved) {
          const now = look(aside);
          if (now && now.ino === seen.ino && now.age > 15000) {
            rmSync(aside, { recursive: true, force: true });
            held = take();
          } else {
            // Another command took the lock between the look and the rename: give it back.
            try {
              renameSync(aside, lock);
            } catch {}
          }
        }
      }
    }
    if (!held) {
      console.error("Control Rod is being updated or its dependencies installed right now. Try again when that has finished.");
      process.exit(1);
    }
    const release = () => {
      if (ownerOf(lock) === mine) rmSync(lock, { recursive: true, force: true });
    };
    // A plain install first; pnpm trusts a half-installed node_modules, so the second try forces a
    // reinstall. Each try runs this command again in a fresh process, since a module that failed to
    // load stays failed in this one.
    const attempt = Number(process.env.CONTROLROD_DEPS_ATTEMPT ?? 0);
    const installed = attempt < 2;
    if (installed) {
      console.log(`Installing Control Rod's dependencies first (missing: ${missing.join(", ")})...`);
      const touch = setInterval(() => {
        try {
          if (ownerOf(lock) === mine) utimesSync(lock, new Date(), new Date());
        } catch {}
      }, 3000);
      await new Promise((done) => {
        const child = spawn("pnpm", ["install", "--frozen-lockfile", ...(attempt ? ["--force"] : [])], { cwd: root, stdio: "inherit" });
        child.on("error", done);
        child.on("exit", done);
      });
      clearInterval(touch);
    }
    release();
    if (!installed) {
      console.error(`Could not install ${missing.join(", ")}. In ${root}, run: pnpm install --frozen-lockfile --force`);
      process.exit(1);
    }
    const again = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      stdio: "inherit",
      env: { ...process.env, CONTROLROD_DEPS_ATTEMPT: String(attempt + 1) },
    });
    process.exit(again.status ?? 1);
  }
  delete process.env.CONTROLROD_DEPS_ATTEMPT;
}
const { alive, claimRecord, clearRecord, findRunning, freeOrphanedSegments, healthy, orphanedSegments, readRecord, segmentUse, stopLauncher } =
  await import("./lib/instance.mjs");
const { cleanEnv, gitRunner, update, UpdateError } = await import("./lib/update.mjs");
// Resolved once against the folder the command was run in, and handed to every child as an
// absolute path, so a relative CONTROLROD_HOME means the same folder everywhere.
const home = resolve(process.env.INIT_CWD ?? process.cwd(), process.env.CONTROLROD_HOME ?? join(homedir(), ".controlrod"));
process.env.CONTROLROD_HOME = home;
const bin = join(home, "bin");
const port = Number(process.env.CONTROLROD_PORT ?? 7300);
const logFile = join(home, "logs", "controlrod.log");
const cli = process.env.CONTROLROD_CLI === "1";
const me = cli ? "controlrod" : "pnpm cr";
const appUrl = () => process.env.CONTROLROD_ORIGIN ?? `http://localhost:${port}`;

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
function nodeVersionOk() {
  const [maj, min] = process.versions.node.split(".").map(Number);
  return maj > 22 || (maj === 22 && min >= 12);
}

function agentRunProblems() {
  const os = platform();
  if (os === "darwin") {
    return which("sandbox-exec") ? [] : ["Seatbelt (sandbox-exec) was not found on PATH"];
  }
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

function doctor({ agents = false, fix = false } = {}) {
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
  const nodeFound = version("node");
  const rows = [
    ["node 22.12+", nodeFound && nodeVersionOk() ? nodeFound : null, true],
    ["pnpm", version("pnpm"), true],
    ["go", version("go", ["version"]), true],
    ["uv (optional, for Python SDK and contributor checks)", version("uv"), false],
    ["claude (Claude Code, your login)", which("claude") && version("claude"), false],
    ["codex (optional, for an independent pre-check runtime)", which("codex") && version("codex"), false],
  ];
  let ok = true;
  for (const [name, found, required] of rows) {
    if (name.startsWith("node ") && nodeFound && !found) {
      console.log(`MISSING  ${name}: found ${nodeFound}, need >= v22.12.0`);
      ok = false;
      continue;
    }
    console.log(`${found ? "ok  " : required ? "MISSING" : "--  "}  ${name}${found ? `: ${found}` : ""}`);
    if (!found && required) ok = false;
  }
  if (!databaseOk()) ok = false;
  if (platform() === "darwin" && !process.env.CONTROLROD_DATABASE_URL) {
    const dead = orphanedSegments();
    if (!dead.length) console.log("ok    database memory: no shared memory left behind by stopped databases");
    else if (fix) {
      const n = freeOrphanedSegments(dead);
      console.log(`ok    database memory: freed ${n} shared memory segment${n === 1 ? "" : "s"} left behind by stopped databases`);
    } else {
      console.log(
        `--    database memory: ${dead.length} shared memory segment${dead.length === 1 ? "" : "s"} left behind by PostgreSQL runs that were killed.` +
          `\n      macOS has 32 in all; when they run out the database cannot start. \`${me} doctor --fix\` frees them (only ones whose PostgreSQL is gone).`,
      );
    }
  }
  const problems = agentRunProblems();
  if (problems.length === 0) console.log("ok    agent runs: the sandbox can start on this platform");
  for (const p of problems) console.log(`--    agent runs: ${p}`);
  if (problems.length) {
    console.log(
      "\nThe app, the board, the office view and the records work without this. The daemon will not start an" +
        "\nagent until the sandbox can hold, and it says why.",
    );
  }
  if (agents && which("go")) agentChecks();
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

/**
 * Runs the daemon's own startup checks for each agent CLI (`controlrod runtimes`): sign-in, the
 * sandbox preflight and, for Codex, whether this version turns on anything Control Rod has not
 * qualified. So doctor says what the daemon will refuse before anything starts. Uses the built
 * daemon when there is one; otherwise compiles it once with `go run`.
 */
function agentChecks() {
  const built = join(bin, "controlrod");
  const r = existsSync(built)
    ? spawnSync(built, ["runtimes"], { encoding: "utf8", timeout: 120000 })
    : spawnSync("go", ["run", "./cmd/controlrod", "runtimes"], { cwd: join(root, "daemon"), encoding: "utf8", timeout: 300000 });
  const out = (r.stdout ?? "").trim();
  if (r.status !== 0 || !out) {
    console.log("--    agents: the daemon's checks could not run here; `${me} start` reports each agent when it starts");
    return;
  }
  console.log("\nAgents, as the daemon will find them:");
  console.log(out);
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
  // An update builds everything again: a change to a build config or a workspace package does
  // not show in an app's own sources.
  const force = process.env.CONTROLROD_FORCE_BUILD === "1";
  if (force || newer(join(root, "apps", "web", "src"), join(root, "apps", "web", "dist", "index.html"))) {
    run("pnpm", ["--filter", "@control-rod/web", "build"]);
  }
  if (force || newer(join(root, "services", "api", "src"), join(root, "services", "api", "dist", "server.js"))) {
    run("pnpm", ["--filter", "@control-rod/api", "build"]);
  }
  run("go", ["build", "-o", join(bin, "controlrod"), "./cmd/controlrod"], { cwd: join(root, "daemon") });
  // A `controlrod` command that points here is rewritten if this version writes it differently.
  try {
    refresh(root);
  } catch {
    /* the command is a convenience; never fail a build over it */
  }
}

/** Says what runs already; true when the caller should not start another. */
async function alreadyRunning({ open = false } = {}) {
  const running = await findRunning(home, port, root);
  if (!running) return false;
  if (running.foreign) {
    console.error(
      `Port ${port} is already in use${running.command ? ` by: ${running.command}` : ""}.\n` +
        `Stop that program, or start Control Rod on another port with CONTROLROD_PORT.`,
    );
    process.exit(1);
  }
  console.log(`Control Rod is already running at ${appUrl()} (${running.mode === "background" ? "in the background" : "in another terminal"}).`);
  if (open && process.stdout.isTTY && !process.env.CI) openUrl(readRecord(home)?.url ?? appUrl());
  else console.log(`Open it with \`${me} open\`, or stop it with \`${me} stop\`.`);
  return true;
}

/**
 * macOS has only 32 shared memory segments in all, and every PostgreSQL that is killed outright
 * leaves one behind; when they run out, no PostgreSQL starts. When they are about to run out (the
 * database could not start anyway), start frees the ones that are certainly dead: this user's,
 * PostgreSQL's 56-byte interlock size, nothing attached, and the process that made them gone. It
 * says what it freed. The owner chose this over a separate `doctor --fix` step (2026-11-24).
 */
function freeDeadDatabaseMemory() {
  if (platform() !== "darwin" || process.env.CONTROLROD_DATABASE_URL) return;
  const use = segmentUse();
  if (!use || use.used < use.limit - 2) return;
  const dead = orphanedSegments();
  const freed = dead.length ? freeOrphanedSegments(dead) : 0;
  if (freed) {
    console.log(`Freed ${freed} shared memory segment${freed === 1 ? "" : "s"} left behind by stopped databases (macOS allows ${use.limit} in all).`);
  } else {
    console.log(
      `\nmacOS is almost out of shared memory segments (${use.used} of ${use.limit} in use) and none are safe to free here, ` +
        "so the database may not start. Restarting the Mac frees them.",
    );
  }
}

/** Opens the app in the browser when someone is at this terminal to see it. */
function openWhenInteractive(url, wanted) {
  if (!wanted || !process.stdout.isTTY || process.env.CI) return;
  openUrl(url);
}

/** The address the browser uses. In GitHub Codespaces that is the forwarded https address. */
function origin() {
  if (process.env.CONTROLROD_ORIGIN) return process.env.CONTROLROD_ORIGIN;
  const csName = process.env.CODESPACE_NAME;
  const csDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  return csName && csDomain ? `https://${csName}-${port}.${csDomain}` : `http://localhost:${port}`;
}

async function start() {
  if (await alreadyRunning()) return;
  // Claimed before anything is built or started, so two starts at once cannot both go ahead.
  const background = process.env.CONTROLROD_LAUNCH_MODE === "background";
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const claimed = await claimRecord(home, {
    root,
    port,
    url: origin(),
    mode: background ? "background" : "foreground",
    log: background ? logFile : null,
    startedAt: new Date().toISOString(),
  });
  if (!claimed) {
    if (!(await alreadyRunning())) console.log(`Another Control Rod is starting. See \`${me} status\`; if none is, one just stopped abruptly: try again in 15 seconds.`);
    return;
  }
  process.on("exit", () => clearRecord(home));
  if (!doctor()) process.exit(1);
  setup();
  // On a first run the database package was not installed yet when `doctor` looked; look again now.
  if (!databaseOk()) process.exit(1);
  freeDeadDatabaseMemory();
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

  let apiExited = false;
  let apiExitCode = 0;
  let stopping = false;
  // One Ctrl+C can arrive twice (from the terminal and relayed by pnpm), so only a press at least a
  // second after the first counts as the second press that skips the drain.
  let stopAt = 0;
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let daemon;
  let daemonExited = false;
  // Exit only after the daemon has stopped: it lets running work finish and saves completions to its
  // outbox, and the daemon bounds that wait itself (its grace, stop ladder and final drain).
  const afterDaemon = (exit) => {
    if (!daemon || daemonExited) return exit();
    daemon.once("exit", exit);
    daemon.kill("SIGTERM");
  };
  // The daemon shares the terminal, so a Ctrl+C reaches it directly and it starts its own graceful
  // stop. The control plane, and the embedded PostgreSQL it starts, run in their own process group
  // where a Ctrl+C does not reach them: this launcher stops them only after the daemon has exited,
  // so the daemon's final completions still have somewhere to go. The control plane also stops by
  // itself if this launcher disappears (CONTROLROD_LAUNCHER_PID).
  const api = spawn("node", [join(root, "services", "api", "dist", "server.js")], {
    env: { ...env, CONTROLROD_LAUNCHER_PID: String(process.pid) },
    stdio: "inherit",
    detached: true,
  });
  api.on("exit", (code, signal) => {
    apiExited = true;
    apiExitCode = code ?? (signal ? 1 : 0);
    if (!stopping) {
      stopping = true;
      stopAt = performance.now();
      console.error(`\nThe control plane exited unexpectedly (code=${code ?? signal}). Stopping the run daemon first.`);
      afterDaemon(() => process.exit(apiExitCode || 1));
    }
  });
  // A second Ctrl+C (SIGINT) skips the drain. SIGTERM and SIGHUP, which `controlrod stop` and a
  // closed terminal send, only ever ask for the graceful stop, however often they arrive.
  const stop = (force) => {
    if (stopping) {
      if (!force || performance.now() - stopAt < 1000) return;
      // A second Ctrl+C does not wait: stop both now. Unsaved completions stay in the daemon's outbox.
      console.error("\nStopping now.");
      if (daemon && !daemonExited) daemon.kill("SIGKILL");
      if (!apiExited) api.kill("SIGTERM");
      process.exit(130);
    }
    stopping = true;
    stopAt = performance.now();
    console.log("\nStopping: running work finishes and its results are saved first (Ctrl+C again to stop now).");
    // The daemon stops first, while the control plane is still up to take its final completions.
    afterDaemon(() => {
      if (apiExited) process.exit(apiExitCode);
      const hardExit = setTimeout(() => process.exit(0), 5000);
      hardExit.unref();
      api.once("exit", () => process.exit(0));
      api.kill("SIGTERM");
    });
  };
  // Installed before the health wait, so a Ctrl+C during startup also stops the control plane.
  process.on("SIGINT", () => stop(true));
  process.on("SIGTERM", () => stop(false));
  process.on("SIGHUP", () => stop(false));
  // If the launcher exits any other way (an error such as a failed start), take the children with it.
  process.on("exit", () => {
    clearRecord(home);
    if (daemon && !daemonExited) daemon.kill("SIGTERM");
    if (!apiExited) api.kill("SIGTERM");
  });
  for (let i = 0; i < 120; i++) {
    if (stopping) return;
    if (apiExited) throw new Error(`The control plane exited before becoming healthy (code=${apiExitCode})`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (i === 119) throw new Error("The control plane did not start");
    await new Promise((r) => setTimeout(r, 500));
  }
  // Shutdown began during startup: never start the daemon.
  if (stopping) return;
  // The daemon reads its token from CONTROLROD_HOME/daemon.token, and reads it again if the control
  // plane restarts and writes a new one; passing it in the environment would pin the old token.
  const daemonEnv = { ...env, CONTROLROD_API: `http://127.0.0.1:${port}`, CONTROLROD_LAUNCHER_PID: String(process.pid) };
  delete daemonEnv.CONTROLROD_DAEMON_TOKEN;
  daemon = spawn(join(bin, "controlrod"), ["daemon", "--parallel", process.env.CONTROLROD_PARALLEL ?? "3"], {
    env: daemonEnv,
    stdio: "inherit",
  });
  daemon.on("exit", (code, signal) => {
    daemonExited = true;
    if (!stopping) {
      console.error(`\nThe run daemon exited (code=${code ?? signal}); runs will wait until it is restarted.`);
    }
  });
  const how = process.env.CONTROLROD_LAUNCH_MODE === "background" ? `\`${me} stop\` stops everything` : "Ctrl+C stops everything";
  console.log(`\nControl Rod: open ${env.CONTROLROD_ORIGIN ?? `http://localhost:${port}`} (${how})\n`);
  if (!cli && ownerOf(commandPath()) === "none") {
    console.log("Tip: run `pnpm cr link` once to get the `controlrod` command (controlrod start, update, stop) in any folder.\n");
  }
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

function resolveCliArgs(argv) {
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--receipt") {
      out.push(a);
      if (i + 1 < argv.length) out.push(resolve(cwd, argv[++i]));
      continue;
    }
    if (a === "--diff-sha256" || a === "--head-sha" || a === "--revision") {
      out.push(a);
      if (i + 1 < argv.length) out.push(argv[++i]);
      continue;
    }
    if (a.startsWith("-")) {
      out.push(a);
      continue;
    }
    out.push(resolve(cwd, a));
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The short commit and its date, for `version` and `status`. */
function versionLine() {
  const git = gitRunner(root);
  const sha = git(["rev-parse", "--short", "HEAD"]);
  const date = git(["log", "-1", "--format=%cs"]);
  return sha.ok ? `Control Rod ${sha.out} (${date.out || "unknown date"})` : "Control Rod (not a git clone)";
}

/** Keeps the log from growing without end: one older copy, rotated at start. */
function openLog() {
  mkdirSync(dirname(logFile), { recursive: true });
  try {
    if (statSync(logFile).size > 10 * 1024 * 1024) renameSync(logFile, `${logFile}.1`);
  } catch {
    /* no log yet */
  }
  return openSync(logFile, "a", 0o600);
}

function tail(file, lines) {
  try {
    return readFileSync(file, "utf8").split("\n").slice(-lines - 1).join("\n");
  } catch {
    return "";
  }
}

/**
 * Starts Control Rod detached from this terminal, its output going to the log. Builds in the
 * foreground first, so the person sees progress and errors here, then waits until it answers.
 */
async function startBackground({ open = false } = {}) {
  if (await alreadyRunning({ open })) return 0;
  // The checks print only when something is missing; the full list is in `doctor`.
  const said = [];
  const print = console.log;
  console.log = (...a) => said.push(a.join(" "));
  let ok;
  try {
    ok = doctor();
  } finally {
    console.log = print;
  }
  if (!ok) {
    console.log(said.join("\n"));
    return 1;
  }
  setup();
  if (!databaseOk()) return 1;
  freeDeadDatabaseMemory();
  const fd = openLog();
  const child = spawn(process.execPath, [join(root, "scripts", "cr.mjs"), "start", "--foreground"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env, CONTROLROD_LAUNCH_MODE: "background" },
  });
  closeSync(fd);
  child.unref();
  process.stdout.write("\nStarting Control Rod in the background");
  for (let i = 0; i < 240; i++) {
    if (child.exitCode !== null || !alive(child.pid)) break;
    // Ready means this launch answers: its own record, and the port healthy.
    if (readRecord(home)?.pid === child.pid && (await healthy(port))) {
      console.log(`\nControl Rod is running at ${appUrl()}`);
      console.log(`Log: ${logFile}  (\`${me} logs\`)`);
      console.log(`Stop it with \`${me} stop\`.`);
      openWhenInteractive(readRecord(home)?.url ?? appUrl(), open);
      return 0;
    }
    if (i % 4 === 3) process.stdout.write(".");
    await sleep(500);
  }
  // Do not leave a launch that never became ready running unseen.
  if (child.exitCode === null && alive(child.pid)) child.kill("SIGTERM");
  else {
    // Another start won the race: that one is running, which is what was asked for.
    const other = await findRunning(home, port, root);
    if (other && !other.foreign) {
      console.log(`\nControl Rod is already running at ${readRecord(home)?.url ?? appUrl()} (started by another command).`);
      openWhenInteractive(readRecord(home)?.url ?? appUrl(), open);
      return 0;
    }
  }
  console.error(`\nControl Rod did not start. The end of its log (${logFile}):\n`);
  console.error(tail(logFile, 30));
  return 1;
}

async function stopCommand({ now = false, quiet = false } = {}) {
  const running = await findRunning(home, port, root);
  if (!running) {
    if (!quiet) console.log("Control Rod is not running.");
    return { code: 0, wasRunning: false };
  }
  if (running.foreign) {
    console.error(`Something other than a Control Rod started here is using port ${port}${running.command ? `: ${running.command}` : ""}. Not stopping it.`);
    return { code: 1, wasRunning: false };
  }
  console.log(now ? "Stopping Control Rod now..." : "Stopping Control Rod (running work finishes and is saved first)...");
  if (!(await stopLauncher(running.pid, { now, started: running.started }))) {
    console.error(`Control Rod is still finishing running work. Wait, or run \`${me} stop --now\` to stop without waiting.`);
    return { code: 1, wasRunning: true, stuck: true, mode: running.mode };
  }
  console.log("Stopped.");
  return { code: 0, wasRunning: true, mode: running.mode };
}

/** Runs the launcher in this terminal as a child, so this process can return its exit code. */
function startHere() {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(root, "scripts", "cr.mjs"), "start", "--foreground"], { cwd: root, stdio: "inherit", env: cleanEnv() });
    // Ctrl+C reaches the child directly (same terminal); a stop signal sent here is passed on.
    const pass = (sig) => () => child.kill(sig);
    process.on("SIGINT", () => undefined);
    process.on("SIGTERM", pass("SIGTERM"));
    process.on("SIGHUP", pass("SIGHUP"));
    child.on("exit", (code) => done(code ?? 1));
  });
}

async function status() {
  const running = await findRunning(home, port, root);
  const r = readRecord(home);
  console.log(versionLine());
  console.log(`  code:  ${root}`);
  console.log(`  data:  ${home}`);
  if (!running) {
    console.log(`\nNot running. Start it with \`${me} start\`.`);
    return 0;
  }
  if (running.foreign) {
    console.log(`\nPort ${port} is in use by something else${running.command ? `: ${running.command}` : ""}.`);
    return 1;
  }
  const up = await healthy(port);
  const since = r?.startedAt ? ` since ${new Date(r.startedAt).toLocaleString()}` : "";
  const where = running.mode === "background" ? "in the background" : "in a terminal";
  console.log(`\n${up ? "Running" : "Starting"} at ${r?.url ?? appUrl()}, ${where}${since}.`);
  if (running.mode === "background") console.log(`Log: ${logFile}`);
  return 0;
}

function openUrl(url) {
  const os = platform();
  const opener = os === "darwin" ? "open" : os === "win32" ? "explorer.exe" : which("wslview") ? "wslview" : which("xdg-open") ? "xdg-open" : null;
  if (opener && spawnSync(opener, [url], { stdio: "ignore" }).status === 0) {
    console.log(`Opened ${url}`);
    return 0;
  }
  console.log(`Open ${url} in your browser.`);
  return 0;
}

async function openCommand() {
  const running = await findRunning(home, port, root);
  if (running?.foreign) {
    console.error(`Port ${port} is in use by something else${running.command ? `: ${running.command}` : ""}.`);
    return 1;
  }
  if (!running) {
    const code = await startBackground();
    if (code !== 0) return code;
  }
  return openUrl(readRecord(home)?.url ?? appUrl());
}

function logsCommand(follow) {
  if (!existsSync(logFile)) {
    console.log(`No log yet. A start in the background (\`controlrod start\`) writes one to ${logFile}; a start in a terminal prints there instead.`);
    return 0;
  }
  if (follow) {
    const r = spawnSync("tail", ["-n", "100", "-f", logFile], { stdio: "inherit" });
    return r.status ?? 0;
  }
  console.log(tail(logFile, 200));
  return 0;
}

// Long steps of an update run without blocking, so the update lock keeps being refreshed while they do.
const runAsync = (cmd, args, opts) =>
  new Promise((done) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", () => done(false));
    child.on("exit", (code) => done(code === 0));
  });

async function updateCommand(flags) {
  const pnpmCmd = which("pnpm");
  try {
    return await update(
      root,
      { check: Boolean(flags.check), restart: flags.restart !== false },
      {
        git: gitRunner(root),
        log: (m) => console.log(m),
        holdInterrupts: () => {
          process.on("SIGINT", () => console.log("\nFinishing the update safely first; please wait."));
        },
        stop: async () => {
          const s = await stopCommand({ quiet: true });
          if (s.stuck) return null;
          if (s.code !== 0) throw new UpdateError("Could not stop what is using Control Rod's port; nothing was changed.");
          return { wasRunning: s.wasRunning, mode: s.mode };
        },
        install: () => {
          if (!pnpmCmd) {
            console.error("pnpm was not found. Install it (https://pnpm.io/installation) and run `controlrod update` again.");
            return false;
          }
          return runAsync("pnpm", ["install", "--frozen-lockfile"], { cwd: root, env: cleanEnv() });
        },
        // The updated checkout's own setup builds it, so a new version's build steps are the ones used.
        build: () =>
          runAsync(process.execPath, [join(root, "scripts", "cr.mjs"), "setup"], {
            cwd: root,
            env: { ...cleanEnv(), CONTROLROD_FORCE_BUILD: "1" },
          }),
        restart: async ({ mode }) => {
          if (mode === "background") {
            return spawnSync(process.execPath, [join(root, "scripts", "cr.mjs"), "start", "--background", "--no-open"], { cwd: root, stdio: "inherit", env: cleanEnv() }).status ?? 1;
          }
          console.log("\nControl Rod was running, so it starts again here (Ctrl+C stops it).\n");
          return startHere();
        },
      },
    );
  } catch (e) {
    if (e instanceof UpdateError) {
      console.error(e.message);
      return e.code;
    }
    throw e;
  }
}

function linkCommand() {
  const r = link(root);
  if (r.status === "unsupported") {
    console.error("The controlrod command needs macOS, Linux or WSL2. On Windows, run Control Rod inside WSL2.");
    return 1;
  }
  if (r.status === "foreign") {
    console.error(`${r.path} already exists and was not written by Control Rod. Not replacing it.\nSet CONTROLROD_BIN_DIR to another folder on your PATH and run \`pnpm cr link\` again.`);
    return 1;
  }
  console.log(`${r.status === "written" ? "Installed" : "Already installed:"} ${r.path} -> ${root}`);
  if (r.profile) {
    if (r.profile.added) console.log(`Added ${dirname(r.path)} to your PATH in ${r.profile.file}.`);
    console.log(`\nOpen a new terminal (or run: ${r.profile.line}), then:`);
  } else console.log("\nFrom any folder:");
  console.log("  controlrod start      start Control Rod (add --background to keep this terminal free)");
  console.log("  controlrod update     update to the latest version");
  console.log("  controlrod help       every command");
  return 0;
}

/** Hands a command Control Rod's launcher does not own to the run daemon's CLI. */
function daemonCommand(args) {
  const built = join(bin, "controlrod");
  if (!existsSync(built)) {
    mkdirSync(bin, { recursive: true });
    run("go", ["build", "-o", built, "./cmd/controlrod"], { cwd: join(root, "daemon") });
  }
  const r = spawnSync(built, args, { stdio: "inherit", env: { ...process.env, CONTROLROD_HOME: home } });
  return r.status ?? 1;
}

function bench(rest) {
  // Control Rod's own benchmark (bench/cross-check/README.md). Started by hand only.
  const py = which("python3") ?? which("python");
  if (!py) {
    console.error(`${me} bench needs Python 3.`);
    return 1;
  }
  const r = spawnSync(py, [join(root, "bench", "cross-check", "bench.py"), ...rest], {
    stdio: "inherit",
    cwd: process.env.INIT_CWD ?? process.cwd(),
  });
  return r.status ?? 1;
}

/**
 * Commander (MIT) parses the commands and writes the help. A fresh clone that skipped
 * `pnpm install` has no node_modules yet: install once, then load it.
 */
const { Command } = await import("commander");
const exit = (code) => process.exit(typeof code === "number" ? code : 0);
const program = new Command()
  .name(me)
  .description("Control Rod: your coding agents at one table, checked by a different one, on your own machine.")
  .version(versionLine(), "-v, --version", "show which version this is")
  .helpCommand("help [command]", "show help for a command")
  .showSuggestionAfterError(true)
  .addHelpText(
    "after",
    `\nAgent CLIs:\n  agents [check]        which agent CLIs are installed and signed in\n  agents update         update Claude Code, Codex and the others, asking before each\n\nYour records live in ${home}.`,
  );

// `controlrod start` is the one step: it checks the machine, builds when needed, frees database
// memory left behind on macOS, runs in the background and opens the app. `pnpm cr start`, the
// developer's form inside the checkout, keeps running in that terminal as before.
program.command("start").description(cli ? "start Control Rod in the background and open it in your browser" : "start Control Rod in this terminal (Ctrl+C stops it)")
  .option("-f, --foreground", "keep it in this terminal (Ctrl+C stops it)")
  .option("-b, --background", "run in the background and give this terminal back")
  .option("--no-open", "do not open the browser")
  .action(async (o) => {
    const background = o.background || (cli && !o.foreground);
    if (background) exit(await startBackground({ open: o.open }));
    else start();
  });
program.command("stop").description("stop Control Rod; running work finishes and is saved first")
  .option("--now", "stop without waiting for running work")
  .action(async (o) => exit((await stopCommand({ now: o.now })).code));
program.command("restart").description("stop, then start again the same way")
  .option("-b, --background", "start again in the background")
  .option("--now", "stop without waiting for running work")
  .action(async (o) => {
    const s = await stopCommand({ now: o.now, quiet: true });
    if (s.code !== 0) exit(s.code);
    // A terminal start comes back in this terminal; otherwise `controlrod restart` runs it in the background.
    if (s.mode === "background" || o.background || (cli && s.mode !== "foreground")) exit(await startBackground({ open: false }));
    else exit(await startHere());
  });
program.command("status").description("is it running, where, and which version").action(async () => exit(await status()));
program.command("open").description("open the app in your browser (starts it in the background if needed)").action(async () => exit(await openCommand()));
program.command("logs").description("show the log of a background start")
  .option("-f, --follow", "keep printing new lines")
  .action((o) => exit(logsCommand(o.follow)));
program.command("update").alias("upgrade").description("update to the latest version, rebuild, and restart it if it was running")
  .option("--check", "only say what is new")
  .option("--no-restart", "do not start it again afterwards")
  .action(async (o) => exit(await updateCommand(o)));
program.command("version").description("show which version this is").action(() => console.log(versionLine()));
program.command("doctor").description("check this machine and say what to fix")
  .option("--fix", "free shared memory left behind by stopped databases (macOS)")
  .action((o) => exit(doctor({ agents: true, fix: o.fix }) ? 0 : 1));
program.command("setup").description("build without starting").action(() => setup());
program.command("verify").description("check a downloaded inclusion proof or audit export offline").argument("<files...>");
program.command("receipt").description("write a PR receipt from an inclusion proof").argument("[file]");
program.command("link").description("install the controlrod command so it works in any folder").action(() => exit(linkCommand()));
program.command("unlink").description("remove the controlrod command").action(() => {
  const r = unlink();
  console.log(r.status === "removed" ? `Removed ${r.path}.` : r.status === "none" ? "The controlrod command is not installed." : `${r.path} was not written by Control Rod; left alone.`);
});
program.command("bench").description("Control Rod's own cross-vendor checking benchmark")
  .argument("[args...]")
  .helpOption(false)
  .allowUnknownOption()
  .action(() => undefined);

const DAEMON_COMMANDS = new Set(["agents", "check", "runtimes", "sandbox-args", "attestation-public", "daemon"]);
const args = process.argv.slice(2);
const known = new Set(program.commands.flatMap((c) => [c.name(), ...c.aliases()]));
// These pass their own flags through untouched, so they skip the parser.
const raw = { bench: (rest) => exit(bench(rest)), verify: (rest) => verify(resolveCliArgs(rest)), receipt: (rest) => receipt(rest.length ? resolveCliArgs(rest)[0] : undefined) };
if (args.length === 0 && cli) {
  program.outputHelp();
} else if (raw[args[0]] && !args.slice(1).some((a) => a === "--help" || a === "-h") ) {
  raw[args[0]](args.slice(1));
} else if (args.length === 0 && !cli) {
  await program.parseAsync(["start"], { from: "user" });
} else if (DAEMON_COMMANDS.has(args[0]) && !known.has(args[0])) {
  // The run daemon's own commands (daemon/cmd/controlrod/main.go).
  exit(daemonCommand(args));
} else {
  await program.parseAsync(args, { from: "user" });
}
