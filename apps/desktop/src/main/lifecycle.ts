// Manages the Control Rod local services lifecycle for the desktop shell by reusing the existing
// launcher (`scripts/cr.mjs`) and instance record/lock helpers (`scripts/lib/instance.mjs`).
// Zero duplication of lockfiles, daemon/API shutdown ordering, or macOS Postgres shm cleanup.
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveDesktopEnv } from "./shell-env.js";

export interface RunningInstance {
  pid: number | null;
  mode?: string;
  record?: { pid?: number; url?: string; port?: number; started?: string } | null;
  started?: string | null;
  foreign?: boolean;
  command?: string | null;
}

export interface InstanceModule {
  findRunning: (home: string, port: number, root?: string | null) => Promise<RunningInstance | null>;
  healthy: (port: number, timeoutMs?: number) => Promise<boolean>;
  readRecord: (home: string) => { pid: number; url?: string; port?: number; started?: string } | null;
  stopLauncher: (
    pid: number,
    opts?: { now?: boolean; timeoutMs?: number; log?: (msg: string) => void; started?: string | null },
  ) => Promise<boolean>;
  freeOrphanedSegments: () => number;
  alive: (pid: number) => boolean;
}

export type LifecycleState =
  | { phase: "starting"; message: string }
  | { phase: "ready"; url: string; reused: boolean }
  | { phase: "stopping"; message: string }
  | { phase: "error"; title: string; message: string; details: string };

export interface DesktopLifecycleOptions {
  /** Root directory containing `scripts/cr.mjs`, `services/api/dist`, `apps/web/dist`. */
  runtimeRoot: string;
  /** `CONTROLROD_HOME` directory (defaults to `~/.controlrod`). */
  home?: string;
  /** Control plane port (defaults to `CONTROLROD_PORT` or 7300). */
  port?: number;
  /** True when running inside a packaged `.app` bundle (uses `ELECTRON_RUN_AS_NODE=1` and bundled daemon). */
  packaged?: boolean;
  /** Executable used to run `scripts/cr.mjs` (defaults to `process.execPath`). */
  nodeExecPath?: string;
  /** Optional path to the prebuilt Go daemon binary in packaged mode. */
  daemonBin?: string;
  /** Platform override for testing. */
  platform?: NodeJS.Platform;
  /** Base environment override for testing. */
  baseEnv?: NodeJS.ProcessEnv;
  /** Health wait timeout in ms (defaults to 90_000). */
  healthTimeoutMs?: number;
  /** Health poll interval in ms (defaults to 300). */
  pollIntervalMs?: number;
  /** Graceful stop wait in ms (defaults to 20_000). */
  gracefulStopMs?: number;
  /** Forced stop wait in ms (defaults to 5_000). */
  forceStopMs?: number;
  /** Called whenever the lifecycle state transitions. */
  onStateChange?: (state: LifecycleState) => void;
  /** Dependency-injected instance module (defaults to dynamic import of `scripts/lib/instance.mjs`). */
  instanceModule?: InstanceModule;
  /** Dependency-injected spawn function. */
  spawn?: typeof nodeSpawn;
  /** Dependency-injected environment resolver. */
  resolveEnv?: (baseEnv: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  /** Dependency-injected sleep function. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const MAX_LOG_LINES = 80;

export class DesktopLifecycle {
  private readonly runtimeRoot: string;
  private readonly home: string;
  private readonly port: number;
  private readonly packaged: boolean;
  private readonly nodeExecPath: string;
  private readonly daemonBin: string | undefined;
  private readonly platform: NodeJS.Platform;
  private readonly baseEnv: NodeJS.ProcessEnv;
  private readonly healthTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly gracefulStopMs: number;
  private readonly forceStopMs: number;
  private readonly onStateChange: (state: LifecycleState) => void;
  private readonly spawnFn: typeof nodeSpawn;
  private readonly resolveEnvFn: (baseEnv: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private instancePromise: Promise<InstanceModule> | null = null;

  private child: ChildProcess | null = null;
  private ownedLauncherPid: number | null = null;
  private ownedLauncherStarted: string | null = null;
  private ownedLauncher = false;
  private stoppingPromise: Promise<void> | null = null;
  private aborted = false;
  private state: LifecycleState = { phase: "starting", message: "Starting Control Rod…" };
  private recentOutput: string[] = [];

  constructor(options: DesktopLifecycleOptions) {
    this.runtimeRoot = options.runtimeRoot;
    this.baseEnv = options.baseEnv ?? process.env;
    this.home = options.home ?? this.baseEnv.CONTROLROD_HOME ?? join(homedir(), ".controlrod");
    this.port = options.port ?? Number(this.baseEnv.CONTROLROD_PORT ?? 7300);
    this.packaged = options.packaged ?? false;
    this.nodeExecPath = options.nodeExecPath ?? process.execPath;
    this.daemonBin = options.daemonBin;
    this.platform = options.platform ?? process.platform;
    this.healthTimeoutMs = options.healthTimeoutMs ?? 90_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 300;
    this.gracefulStopMs = options.gracefulStopMs ?? 20_000;
    this.forceStopMs = options.forceStopMs ?? 5_000;
    this.onStateChange = options.onStateChange ?? (() => undefined);
    this.spawnFn = options.spawn ?? nodeSpawn;
    this.resolveEnvFn = options.resolveEnv ?? ((env) => resolveDesktopEnv(env, { platform: this.platform }));
    this.sleepFn = options.sleep ?? defaultSleep;
    if (options.instanceModule) {
      this.instancePromise = Promise.resolve(options.instanceModule);
    }
  }

  getState(): LifecycleState {
    return this.state;
  }

  ownsServices(): boolean {
    return this.ownedLauncher;
  }

  getOwnedPid(): number | null {
    return this.ownedLauncherPid;
  }

  private setState(next: LifecycleState): void {
    this.state = next;
    this.onStateChange(next);
  }

  private appendOutput(chunk: string): void {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line.trim()) continue;
      this.recentOutput.push(line);
      if (this.recentOutput.length > MAX_LOG_LINES) {
        this.recentOutput.shift();
      }
    }
  }

  private async loadInstance(): Promise<InstanceModule> {
    if (!this.instancePromise) {
      const url = pathToFileURL(join(this.runtimeRoot, "scripts", "lib", "instance.mjs")).href;
      this.instancePromise = import(url) as Promise<InstanceModule>;
    }
    return this.instancePromise;
  }

  private defaultUrl(): string {
    return this.baseEnv.CONTROLROD_ORIGIN ?? `http://localhost:${this.port}`;
  }

  /**
   * Starts local services if none are running, or connects to an already-running Control Rod
   * instance without launching a second one. Resolves once the workspace is healthy or enters
   * the `error` state.
   */
  async start(): Promise<LifecycleState> {
    this.aborted = false;
    this.recentOutput = [];
    this.setState({ phase: "starting", message: "Starting Control Rod…" });

    let instance: InstanceModule;
    try {
      instance = await this.loadInstance();
    } catch (err) {
      const details = err instanceof Error ? err.stack ?? err.message : String(err);
      const errorState: LifecycleState = {
        phase: "error",
        title: "Control Rod could not start",
        message: "The local launcher files could not be loaded. Reinstall the app or run from the workspace.",
        details,
      };
      this.setState(errorState);
      return errorState;
    }

    const running = await instance.findRunning(this.home, this.port, this.runtimeRoot);
    if (this.aborted) return this.state;

    if (running?.foreign) {
      const who = running.command ? ` (${running.command})` : "";
      const errorState: LifecycleState = {
        phase: "error",
        title: `Port ${this.port} is already in use`,
        message: "Another program is using Control Rod's local port. Close that program, then try again.",
        details: `Port: ${this.port}\nPID: ${running.pid ?? "unknown"}\nCommand: ${running.command ?? "unknown"}${who}`,
      };
      this.setState(errorState);
      return errorState;
    }

    if (running) {
      this.ownedLauncher = false;
      this.ownedLauncherPid = null;
      this.ownedLauncherStarted = null;
      this.setState({ phase: "starting", message: "Connecting to running Control Rod…" });
      const ok = await this.waitForHealth(instance, () => false);
      if (this.aborted) return this.state;
      if (ok) {
        const url = instance.readRecord(this.home)?.url ?? running.record?.url ?? this.defaultUrl();
        const ready: LifecycleState = { phase: "ready", url, reused: true };
        this.setState(ready);
        return ready;
      }
      const errorState: LifecycleState = {
        phase: "error",
        title: "Control Rod did not respond",
        message: "An existing Control Rod instance was found, but it did not become ready in time.",
        details: `Port: ${this.port}\nLauncher PID: ${running.pid ?? "unknown"}\nMode: ${running.mode ?? "unknown"}`,
      };
      this.setState(errorState);
      return errorState;
    }

    // Nothing is running: launch the existing `scripts/cr.mjs` foreground launcher.
    this.setState({ phase: "starting", message: "Starting local services…" });

    const resolvedEnv = this.resolveEnvFn(this.baseEnv);
    const childEnv: NodeJS.ProcessEnv = {
      ...resolvedEnv,
      CONTROLROD_HOME: this.home,
      CONTROLROD_PORT: String(this.port),
      CONTROLROD_DESKTOP: "1",
    };
    if (this.packaged) {
      childEnv.ELECTRON_RUN_AS_NODE = "1";
      childEnv.CONTROLROD_PACKAGED = "1";
      if (this.daemonBin) {
        childEnv.CONTROLROD_DAEMON_BIN = this.daemonBin;
      }
    }

    const scriptPath = join(this.runtimeRoot, "scripts", "cr.mjs");
    let exited = false;
    let exitInfo = "";

    const child = this.spawnFn(this.nodeExecPath, [scriptPath, "start", "--foreground", "--no-open"], {
      cwd: this.runtimeRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child = child;
    this.ownedLauncher = true;
    this.ownedLauncherPid = child.pid ?? null;

    child.stdout?.on("data", (buf: Buffer | string) => this.appendOutput(String(buf)));
    child.stderr?.on("data", (buf: Buffer | string) => this.appendOutput(String(buf)));
    child.on("error", (err) => {
      exited = true;
      exitInfo = `spawn error: ${err.message}`;
      this.appendOutput(exitInfo);
    });
    child.on("exit", (code, signal) => {
      exited = true;
      exitInfo = `code=${code ?? "null"} signal=${signal ?? "null"}`;
      if (this.child === child) {
        this.child = null;
      }
    });

    const ok = await this.waitForHealth(instance, () => exited);
    if (this.aborted) return this.state;

    if (ok) {
      const record = instance.readRecord(this.home);
      if (record && this.ownedLauncherPid !== null && record.pid === this.ownedLauncherPid) {
        this.ownedLauncherStarted = record.started ?? null;
      }
      const url = record?.url ?? this.defaultUrl();
      const ready: LifecycleState = { phase: "ready", url, reused: false };
      this.setState(ready);
      return ready;
    }

    // If another Control Rod won the startup race while we were spawning, reuse it.
    if (exited) {
      const other = await instance.findRunning(this.home, this.port, this.runtimeRoot);
      if (other && !other.foreign && (await instance.healthy(this.port, 1500))) {
        this.ownedLauncher = false;
        this.ownedLauncherPid = null;
        this.ownedLauncherStarted = null;
        const url = instance.readRecord(this.home)?.url ?? other.record?.url ?? this.defaultUrl();
        const ready: LifecycleState = { phase: "ready", url, reused: true };
        this.setState(ready);
        return ready;
      }
    }

    // Startup failed: stop the launcher we spawned so nothing lingers unseen.
    await this.stopOwnedChild(instance);

    const tail = this.recentOutput.join("\n").trim();
    const errorState: LifecycleState = {
      phase: "error",
      title: "Control Rod could not start",
      message: exited
        ? "The local services stopped before Control Rod was ready."
        : "The local services took too long to respond.",
      details: [
        `Port: ${this.port}`,
        `Home: ${this.home}`,
        exitInfo ? `Exit: ${exitInfo}` : "Exit: timed out waiting for /health",
        tail ? `\n${tail}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
    this.setState(errorState);
    return errorState;
  }

  private async waitForHealth(instance: InstanceModule, hasExited: () => boolean): Promise<boolean> {
    const deadline = Date.now() + this.healthTimeoutMs;
    while (!this.aborted && Date.now() < deadline) {
      if (hasExited()) return false;
      if (await instance.healthy(this.port, 1500)) return true;
      await this.sleepFn(this.pollIntervalMs);
    }
    return false;
  }

  private async stopOwnedChild(instance: InstanceModule): Promise<void> {
    const pid = this.ownedLauncherPid;
    const started = this.ownedLauncherStarted;
    const child = this.child;
    this.ownedLauncher = false;
    this.ownedLauncherPid = null;
    this.ownedLauncherStarted = null;
    this.child = null;

    if (pid !== null && instance.alive(pid)) {
      const stopOpts = started ? { now: false, timeoutMs: this.gracefulStopMs, started } : { now: false, timeoutMs: this.gracefulStopMs };
      const stopped = await instance.stopLauncher(pid, stopOpts);
      if (!stopped && instance.alive(pid)) {
        const forceOpts = started ? { now: true, timeoutMs: this.forceStopMs, started } : { now: true, timeoutMs: this.forceStopMs };
        await instance.stopLauncher(pid, forceOpts);
      }
    } else if (child && child.exitCode === null) {
      child.kill("SIGTERM");
    }

    // Safety net on macOS: if PostgreSQL was forced down, release any orphaned 56-byte SysV
    // interlock segments whose creating process is gone.
    if (this.platform === "darwin" && !this.baseEnv.CONTROLROD_DATABASE_URL) {
      try {
        instance.freeOrphanedSegments();
      } catch {
        // Best-effort cleanup only.
      }
    }
  }

  /**
   * Stops services started by this desktop shell cleanly (daemon drains first, then API and
   * embedded PostgreSQL stop). Leaves externally-started instances running untouched.
   */
  async stop(): Promise<void> {
    if (this.stoppingPromise) return this.stoppingPromise;
    this.aborted = true;

    this.stoppingPromise = (async () => {
      if (!this.ownedLauncher) return;
      this.setState({ phase: "stopping", message: "Stopping Control Rod…" });
      try {
        const instance = await this.loadInstance();
        await this.stopOwnedChild(instance);
      } catch {
        if (this.child && this.child.exitCode === null) {
          this.child.kill("SIGTERM");
        }
      }
    })();

    try {
      await this.stoppingPromise;
    } finally {
      this.stoppingPromise = null;
    }
  }
}
