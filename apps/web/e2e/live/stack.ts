/**
 * The real Control Rod stack for the live suites: the built control plane (services/api/dist) with its
 * embedded PostgreSQL in a throwaway CONTROLROD_HOME, the Go run daemon with only the scripted fake
 * runtime (tests/e2e/fake), and the release build of the web app it serves. Nothing is mocked.
 *
 * Each stack is isolated: its own home, ports, database, daemon token and attestation trust anchor.
 * The suites can kill and restart the daemon or the control plane to see what a person sees.
 *
 * Environment:
 *   LIVE_DAEMON_BIN  a built `controlrod` binary (default: built once into the shared cache dir)
 *   LIVE_RUN_AS      a user to run the stack as when the suite runs as root (the embedded database
 *                    refuses root); uses `setpriv`, Linux only
 *   LIVE_KEEP        keep the stack's home after the run, for reading its logs
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { accessSync, chownSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeAttestation, type Attestation } from "./passkey.js";

export const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const AGENT_BINARIES = ["claude", "codex", "opencode", "grok", "gemini", "antigravity", "ollama", "agy"];

function freePort(): Promise<number> {
  return new Promise((ok, bad) => {
    const s = createServer();
    s.once("error", bad);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => (typeof a === "object" && a ? ok(a.port) : bad(new Error("no port"))));
    });
  });
}

/** PATH without any directory holding a real agent CLI, so the daemon offers the fake runtime only. */
function pathWithoutAgents(): string {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter((d) => d && !AGENT_BINARIES.some((b) => existsSync(join(d, b))))
    .join(delimiter);
}

/** The daemon binary: LIVE_DAEMON_BIN, or one `go build` per run into the shared cache. */
export function daemonBinary(): string {
  const given = process.env.LIVE_DAEMON_BIN;
  if (given) return given;
  const out = join(tmpdir(), "cr-live-cache", "controlrod");
  if (!existsSync(out)) {
    mkdirSync(join(tmpdir(), "cr-live-cache"), { recursive: true });
    execFileSync("go", ["build", "-o", out, "./cmd/controlrod"], { cwd: join(repoRoot, "daemon"), stdio: "inherit" });
  }
  return out;
}

interface Uid { uid: number; gid: number; name: string }
function runAs(): Uid | null {
  const name = process.env.LIVE_RUN_AS;
  if (!name) return null;
  const line = readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith(`${name}:`));
  if (!line) throw new Error(`LIVE_RUN_AS: no user ${name}`);
  const [, , uid, gid] = line.split(":");
  return { uid: Number(uid), gid: Number(gid), name };
}

function launch(cmd: string, args: string[], env: NodeJS.ProcessEnv, logFile: string, as: Uid | null): ChildProcess {
  const [c, a] = as ? ["setpriv", [`--reuid=${as.uid}`, `--regid=${as.gid}`, "--clear-groups", cmd, ...args]] : [cmd, args];
  writeFileSync(logFile, "", { flag: "a" });
  const child = spawn(c, a, { env, cwd: repoRoot, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const append = (b: Buffer) => writeFileSync(logFile, b, { flag: "a" });
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  return child;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Stack {
  /** Origin the browser uses; the passkey RP ID is "localhost". */
  url: string;
  home: string;
  attestation: Attestation;
  log(which: "api" | "daemon"): string;
  daemonRunning(): boolean;
  startDaemon(): Promise<void>;
  /**
   * Replaces the scripted agent for a role ("author", "pre-check", "intake") for runs queued from now
   * on; null restores the repository's script. The script runs in the run's workspace under bash.
   */
  setFake(role: "author" | "pre-check" | "intake", script: string | null): void;
  /** Kills the daemon the way a crash or a closed laptop lid does (SIGKILL by default). */
  killDaemon(signal?: NodeJS.Signals): Promise<void>;
  startApi(): Promise<void>;
  stopApi(signal?: NodeJS.Signals): Promise<void>;
  stop(): Promise<void>;
}

export async function startStack(opts: { name: string; env?: Record<string, string>; daemon?: boolean } = { name: "live" }): Promise<Stack> {
  const as = runAs();
  for (const p of [join(repoRoot, "services/api/dist/server.js"), join(repoRoot, "apps/web/dist/index.html")]) {
    if (!existsSync(p)) throw new Error(`${p} is missing: run the live global setup (it builds the API and the web app)`);
  }
  const base = mkdtempSync(join(tmpdir(), `cr-live-${opts.name.replace(/[^a-z0-9-]/gi, "-")}-`));
  const home = join(base, "home");
  mkdirSync(join(home, "trust-anchors"), { recursive: true, mode: 0o700 });
  const attestation = makeAttestation(mkdtempSync(join(base, "att-")));
  writeFileSync(join(home, "trust-anchors", "live-test.pem"), attestation.anchorPem);
  const fake = join(base, "fake");
  cpSync(join(repoRoot, "tests/e2e/fake"), fake, { recursive: true });
  if (as) {
    for (const f of readdirSync(fake)) chownSync(join(fake, f), as.uid, as.gid);
    for (const p of [fake, base, home, join(home, "trust-anchors"), join(home, "trust-anchors", "live-test.pem")]) chownSync(p, as.uid, as.gid);
  }
  const [port, pgPort] = [await freePort(), await freePort()];
  const url = `http://localhost:${port}`;
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: base,
    LANG: "C.UTF-8",
    CONTROLROD_HOME: home,
    CONTROLROD_PORT: String(port),
    CONTROLROD_PG_PORT: String(pgPort),
    CONTROLROD_FAKE_SCRIPTS: fake,
    ...opts.env,
  };
  const daemonBin = opts.daemon === false ? "" : daemonBinary();
  if (daemonBin && as) accessSync(daemonBin, constants.X_OK);
  const logs = { api: join(base, "api.log"), daemon: join(base, "daemon.log") };
  let api: ChildProcess | null = null;
  let daemon: ChildProcess | null = null;

  const health = async (want: boolean, ms = 60000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const up = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false);
      if (up === want) return;
      await sleep(250);
    }
    throw new Error(`control plane ${want ? "did not start" : "did not stop"}; log:\n${readFileSync(logs.api, "utf8").slice(-4000)}`);
  };
  const killGroup = (c: ChildProcess | null, signal: NodeJS.Signals) => {
    if (!c?.pid || c.exitCode !== null) return;
    try { process.kill(-c.pid, signal); } catch { /* already gone */ }
  };
  const exited = (c: ChildProcess | null, ms: number) =>
    !c || c.exitCode !== null || c.signalCode !== null ? Promise.resolve() : Promise.race([new Promise<void>((r) => c.once("exit", () => r())), sleep(ms)]);

  const stack: Stack = {
    url,
    home,
    attestation,
    log: (w) => (existsSync(logs[w]) ? readFileSync(logs[w], "utf8") : ""),
    daemonRunning: () => !!daemon && daemon.exitCode === null && daemon.signalCode === null,
    async startApi() {
      api = launch("node", [join(repoRoot, "services/api/dist/server.js")], env, logs.api, as);
      await health(true);
    },
    async stopApi(signal = "SIGTERM") {
      killGroup(api, signal);
      await exited(api, 15000);
      await health(false, 15000);
      // The embedded database needs a moment to release its port after a hard stop.
      if (signal === "SIGKILL") await sleep(1500);
    },
    async startDaemon() {
      if (!daemonBin) throw new Error("this stack runs without a daemon");
      // As `pnpm cr start` does: the daemon reads CONTROLROD_HOME/daemon.token itself.
      daemon = launch(daemonBin, ["daemon", "--parallel", "2", "--timeout", "2m"], {
        ...env,
        PATH: pathWithoutAgents(),
        CONTROLROD_ALLOW_FAKE: "1",
        CONTROLROD_API: `http://127.0.0.1:${port}`,
      }, logs.daemon, as);
      const end = Date.now() + 20000;
      while (Date.now() < end && !/daemon started/.test(stack.log("daemon"))) await sleep(100);
      if (!/runtimes=fake\b/.test(stack.log("daemon"))) {
        throw new Error(`daemon did not start with the fake runtime only; log:\n${stack.log("daemon").slice(-3000)}`);
      }
    },
    setFake(role, script) {
      const file = join(fake, `${role}.sh`);
      if (script === null) cpSync(join(repoRoot, "tests/e2e/fake", `${role}.sh`), file);
      else writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${script}\n`);
      if (as) chownSync(file, as.uid, as.gid);
    },
    async killDaemon(signal = "SIGKILL") {
      killGroup(daemon, signal);
      await exited(daemon, 10000);
    },
    async stop() {
      killGroup(daemon, "SIGTERM");
      killGroup(api, "SIGTERM");
      await Promise.all([exited(daemon, 10000), exited(api, 15000)]);
      killGroup(daemon, "SIGKILL");
      killGroup(api, "SIGKILL");
      if (!process.env.LIVE_KEEP) rmSync(base, { recursive: true, force: true });
      else console.log(`live stack kept at ${base}`);
    },
  };
  try {
    await stack.startApi();
    if (daemonBin) await stack.startDaemon();
  } catch (err) {
    await stack.stop();
    throw err;
  }
  return stack;
}

/** Every stack home left behind by an earlier run that crashed, for the global teardown. */
export function staleStackDirs(): string[] {
  return readdirSync(tmpdir()).filter((d) => d.startsWith("cr-live-") && d !== "cr-live-cache").map((d) => join(tmpdir(), d));
}
