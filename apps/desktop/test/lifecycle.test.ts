import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DesktopLifecycle, type InstanceModule, type LifecycleState } from "../src/main/lifecycle.js";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

describe("DesktopLifecycle", () => {
  it("starts a real launcher, waits for /health, and shuts down cleanly on quit with no orphan process", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "cr-lifecycle-"));
    const home = join(tmp, "home");
    const runtimeRoot = join(tmp, "runtime");
    const port = await freePort();

    try {
      mkdirSync(join(runtimeRoot, "scripts"), { recursive: true });
      mkdirSync(home, { recursive: true });

      // Stub scripts/cr.mjs that mirrors the real launcher contract: listens on /health,
      // writes launcher.json, and exits cleanly on SIGTERM.
      writeFileSync(
        join(runtimeRoot, "scripts", "cr.mjs"),
        `
import { createServer } from "node:http";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const home = process.env.CONTROLROD_HOME;
const port = Number(process.env.CONTROLROD_PORT);
const recordPath = join(home, "launcher.json");

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, "127.0.0.1", () => {
  writeFileSync(recordPath, JSON.stringify({ pid: process.pid, port, url: "http://localhost:" + port, mode: "foreground" }));
});

const shutdown = () => {
  server.close(() => {
    rmSync(recordPath, { force: true });
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
`,
      );

      const states: LifecycleState[] = [];
      let livePid: number | null = null;
      const freedShm = vi.fn(() => 0);

      const instanceModule: InstanceModule = {
        findRunning: vi.fn(async () => null),
        healthy: async (p) => {
          try {
            const r = await fetch(`http://127.0.0.1:${p}/health`);
            return r.ok;
          } catch {
            return false;
          }
        },
        readRecord: (h) => {
          try {
            const raw = JSON.parse(readFileSync(join(h, "launcher.json"), "utf8"));
            return raw;
          } catch {
            return null;
          }
        },
        alive: (pid) => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        },
        stopLauncher: async (pid) => {
          try {
            process.kill(pid, "SIGTERM");
          } catch {
            return true;
          }
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            try {
              process.kill(pid, 0);
            } catch {
              return true;
            }
            await new Promise((r) => setTimeout(r, 50));
          }
          return false;
        },
        freeOrphanedSegments: freedShm,
      };

      const lifecycle = new DesktopLifecycle({
        runtimeRoot,
        home,
        port,
        platform: "darwin",
        nodeExecPath: process.execPath,
        healthTimeoutMs: 10_000,
        pollIntervalMs: 50,
        resolveEnv: (env) => env,
        instanceModule,
        onStateChange: (s) => states.push(s),
      });

      const ready = await lifecycle.start();
      expect(ready).toEqual({
        phase: "ready",
        url: `http://localhost:${port}`,
        reused: false,
      });
      expect(lifecycle.ownsServices()).toBe(true);
      livePid = lifecycle.getOwnedPid();
      expect(livePid).toBeGreaterThan(1);
      expect(instanceModule.alive(livePid!)).toBe(true);

      // Quit cleanly
      await lifecycle.stop();
      expect(lifecycle.ownsServices()).toBe(false);
      expect(instanceModule.alive(livePid!)).toBe(false);
      expect(instanceModule.readRecord(home)).toBeNull();
      expect(freedShm).toHaveBeenCalledOnce();
      expect(states.map((s) => s.phase)).toEqual(["starting", "starting", "ready", "stopping"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("reuses an already-running instance without starting a second one and leaves it running on quit", async () => {
    const spawnSpy = vi.fn();
    const stopLauncherSpy = vi.fn();

    const instanceModule: InstanceModule = {
      findRunning: vi.fn(async () => ({
        pid: 4242,
        mode: "background",
        record: { pid: 4242, port: 7300, url: "http://localhost:7300" },
        started: "Sat Nov 28 07:00:00 2026",
      })),
      healthy: vi.fn(async () => true),
      readRecord: vi.fn(() => ({ pid: 4242, port: 7300, url: "http://localhost:7300" })),
      stopLauncher: stopLauncherSpy,
      freeOrphanedSegments: vi.fn(() => 0),
      alive: vi.fn(() => true),
    };

    const lifecycle = new DesktopLifecycle({
      runtimeRoot: "/tmp/unused",
      port: 7300,
      instanceModule,
      spawn: spawnSpy as never,
      resolveEnv: (env) => env,
    });

    const state = await lifecycle.start();
    expect(state).toEqual({
      phase: "ready",
      url: "http://localhost:7300",
      reused: true,
    });
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(lifecycle.ownsServices()).toBe(false);

    // Quitting the desktop window must NOT stop an externally started Control Rod.
    await lifecycle.stop();
    expect(stopLauncherSpy).not.toHaveBeenCalled();
  });

  it("reports a calm error with collapsed details when a foreign process holds the port", async () => {
    const instanceModule: InstanceModule = {
      findRunning: vi.fn(async () => ({
        foreign: true,
        pid: 9876,
        command: "python3 -m http.server 7300",
      })),
      healthy: vi.fn(async () => false),
      readRecord: vi.fn(() => null),
      stopLauncher: vi.fn(async () => true),
      freeOrphanedSegments: vi.fn(() => 0),
      alive: vi.fn(() => false),
    };

    const lifecycle = new DesktopLifecycle({
      runtimeRoot: "/tmp/unused",
      port: 7300,
      instanceModule,
      resolveEnv: (env) => env,
    });

    const state = await lifecycle.start();
    expect(state.phase).toBe("error");
    if (state.phase === "error") {
      expect(state.title).toContain("7300");
      expect(state.details).toContain("python3 -m http.server 7300");
    }
  });

  it("surfaces an error state when the spawned launcher exits before becoming healthy", async () => {
    const fakeChild = new EventEmitter() as EventEmitter & {
      pid: number;
      exitCode: number | null;
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    fakeChild.pid = 55555;
    fakeChild.exitCode = null;
    fakeChild.stdout = new EventEmitter();
    fakeChild.stderr = new EventEmitter();
    fakeChild.kill = vi.fn();

    const spawnSpy = vi.fn(() => {
      setTimeout(() => {
        fakeChild.stderr.emit("data", "database failed to bind\n");
        fakeChild.exitCode = 1;
        fakeChild.emit("exit", 1, null);
      }, 20);
      return fakeChild;
    });

    const instanceModule: InstanceModule = {
      findRunning: vi.fn(async () => null),
      healthy: vi.fn(async () => false),
      readRecord: vi.fn(() => null),
      stopLauncher: vi.fn(async () => true),
      freeOrphanedSegments: vi.fn(() => 0),
      alive: vi.fn(() => false),
    };

    const lifecycle = new DesktopLifecycle({
      runtimeRoot: "/tmp/unused",
      port: 7300,
      pollIntervalMs: 15,
      healthTimeoutMs: 2000,
      instanceModule,
      spawn: spawnSpy as never,
      resolveEnv: (env) => env,
    });

    const state = await lifecycle.start();
    expect(state.phase).toBe("error");
    if (state.phase === "error") {
      expect(state.title).toBe("Control Rod could not start");
      expect(state.details).toContain("database failed to bind");
    }
  });
});
