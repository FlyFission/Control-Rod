/**
 * Builds what the live stack runs: the spec package, the control plane, the web app's release build,
 * and the daemon. LIVE_SKIP_BUILD=1 skips it when nothing changed. Clears last run's findings.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { daemonBinary, repoRoot } from "./stack.js";
import { findingsDir } from "./fixtures.js";

export default function globalSetup() {
  rmSync(findingsDir, { recursive: true, force: true });
  if (process.env.LIVE_SKIP_BUILD === "1") return;
  const pnpm = (...args: string[]) => execFileSync("pnpm", args, { cwd: repoRoot, stdio: "inherit" });
  pnpm("--filter", "@control-rod/spec", "run", "build");
  pnpm("--filter", "@control-rod/api", "run", "build");
  pnpm("--filter", "@control-rod/web", "run", "build");
  if (!process.env.LIVE_DAEMON_BIN) rmSync(daemonBinary(), { force: true });
  daemonBinary();
}
