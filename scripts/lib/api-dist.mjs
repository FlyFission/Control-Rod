// Builds the control plane's offline tools (services/api/dist) when its sources changed, one build
// at a time. `pnpm cr verify` and `pnpm cr receipt` use it, and so do tests that run the built
// tools, so two of them started together never write the same files at once. Run directly
// (`node scripts/lib/api-dist.mjs`) it builds if needed and exits with the build's status.
// Build output goes to standard error, so a command's own standard output stays exact.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** True when `out` is missing or any file under `src` is newer than it. */
export function newer(src, out) {
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

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Makes sure services/api/dist/<file> is current. Returns 0 when it is, else the failing step's
 * exit status. A lock left by a build that died is taken over after `staleMs`.
 */
export function ensureApiDist(root, file, { staleMs = 10 * 60 * 1000, waitMs = 15 * 60 * 1000 } = {}) {
  const quiet = { cwd: root, stdio: ["inherit", 2, 2] };
  if (!existsSync(join(root, "node_modules"))) {
    const r = spawnSync("pnpm", ["install", "--frozen-lockfile"], quiet);
    if (r.status !== 0) return r.status ?? 1;
  }
  const src = join(root, "services", "api", "src");
  const out = join(root, "services", "api", "dist", file);
  if (!newer(src, out)) return 0;
  const lock = join(root, "node_modules", ".controlrod-api-build.lock");
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
    }
    try {
      if (Date.now() - statSync(lock).mtimeMs > staleMs) rmSync(lock, { recursive: true, force: true });
    } catch {
      /* removed by its owner meanwhile */
    }
    if (Date.now() > until) {
      console.error(`Another build of the control plane is still running (${lock}). Try again when it has finished.`);
      return 1;
    }
    pause(500);
  }
  try {
    // Another command may have built it while this one waited.
    if (!newer(src, out)) return 0;
    const r = spawnSync("pnpm", ["--filter", "@control-rod/api", "build"], quiet);
    if (r.status !== 0) console.error("\nFailed: pnpm --filter @control-rod/api build");
    return r.status ?? 1;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  process.exit(ensureApiDist(root, "verify-bundle.js") || ensureApiDist(root, "pr-receipt.js"));
}
