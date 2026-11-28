#!/usr/bin/env node
// Stages the self-contained Control Rod runtime (web UI, API + embedded PostgreSQL, Go daemon,
// launcher scripts, packs, vendor-family table) into apps/desktop/runtime/ and invokes
// electron-builder to package the desktop app (macOS unsigned .dmg by default).
//
// Usage:
//   node scripts/build-desktop.mjs                 # build + stage + package macOS unsigned .dmg
//   node scripts/build-desktop.mjs --stage-only    # build + stage runtime only (works on Linux CI)
//   node scripts/build-desktop.mjs --dir           # build + stage + unpacked app directory
//   node scripts/build-desktop.mjs --skip-build    # reuse existing dist/ builds when staging
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const desktopDir = join(root, "apps", "desktop");
const runtimeDir = join(desktopDir, "runtime");

const args = new Set(process.argv.slice(2));
const stageOnly = args.has("--stage-only");
const dirOnly = args.has("--dir");
const skipBuild = args.has("--skip-build");

function run(cmd, cmdArgs, opts = {}) {
  console.log(`> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`Command failed (${r.status ?? r.signal}): ${cmd} ${cmdArgs.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function copyRequired(src, dest) {
  if (!existsSync(src)) {
    throw new Error(`Expected build output missing: ${src}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
}

if (!skipBuild) {
  run("pnpm", ["--filter", "@control-rod/web", "build"]);
  run("pnpm", ["--filter", "@control-rod/api", "build"]);
  run("pnpm", ["--filter", "@control-rod/desktop", "build"]);
}

console.log("Staging self-contained Control Rod runtime into apps/desktop/runtime/...");
rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });

// 1. Launcher scripts and root package.json (for scripts/cr.mjs dependency check)
copyRequired(join(root, "scripts", "cr.mjs"), join(runtimeDir, "scripts", "cr.mjs"));
copyRequired(join(root, "scripts", "lib"), join(runtimeDir, "scripts", "lib"));
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
writeFileSync(
  join(runtimeDir, "package.json"),
  `${JSON.stringify({ name: rootPkg.name, private: true, type: "module", dependencies: rootPkg.dependencies }, null, 2)}\n`,
);

// 2. Built web UI
copyRequired(join(root, "apps", "web", "dist"), join(runtimeDir, "apps", "web", "dist"));

// 3. Built control plane API, WASM kernel, and production node_modules (dereferenced, no external symlinks)
const apiStage = join(runtimeDir, "services", "api");
run("pnpm", ["--filter", "@control-rod/api", "deploy", "--prod", "--legacy", apiStage]);
copyRequired(join(root, "services", "api", "dist"), join(apiStage, "dist"));
copyRequired(join(root, "services", "api", "kernel"), join(apiStage, "kernel"));

// 4. Root launcher production dependencies (commander, proper-lockfile) and their transitive deps
//    from pnpm's virtual store, dereferenced so runtime/node_modules is completely self-contained.
function stageModuleTree(pkgPath, targetNodeModules, visited = new Set()) {
  const realPkg = realpathSync(pkgPath);
  const storeNodeModules = dirname(realPkg);
  for (const entry of readdirSync(storeNodeModules)) {
    if (entry.startsWith(".") || visited.has(entry)) continue;
    visited.add(entry);
    const src = join(storeNodeModules, entry);
    copyRequired(src, join(targetNodeModules, entry));
    stageModuleTree(src, targetNodeModules, visited);
  }
}
for (const dep of Object.keys(rootPkg.dependencies ?? {})) {
  const depSrc = join(root, "node_modules", dep);
  if (existsSync(depSrc)) {
    stageModuleTree(depSrc, join(runtimeDir, "node_modules"));
  }
}

// 5. Shared data files read at runtime by services/api (vendor-family table, json schemas, packs)
copyRequired(
  join(root, "daemon", "internal", "runner", "models.json"),
  join(runtimeDir, "daemon", "internal", "runner", "models.json"),
);
copyRequired(
  join(root, "spec", "generated", "json-schema"),
  join(runtimeDir, "spec", "generated", "json-schema"),
);
if (existsSync(join(root, "packs"))) {
  copyRequired(join(root, "packs"), join(runtimeDir, "packs"));
}

// 6. Compile Go daemon binary into runtime/bin/controlrod
const daemonName = process.platform === "win32" ? "controlrod.exe" : "controlrod";
const daemonOut = join(runtimeDir, "bin", daemonName);
mkdirSync(dirname(daemonOut), { recursive: true });
run("go", ["build", "-o", daemonOut, "./cmd/controlrod"], { cwd: join(root, "daemon") });

console.log("Runtime staged successfully.");

if (stageOnly) {
  console.log("--stage-only set; skipping electron-builder.");
  process.exit(0);
}

// 7. Package with electron-builder
const builderArgs = dirOnly
  ? ["exec", "electron-builder", "--config", "electron-builder.config.mjs", "--dir"]
  : ["exec", "electron-builder", "--config", "electron-builder.config.mjs", "--mac", "dmg"];

run("pnpm", builderArgs, { cwd: desktopDir });
console.log("Desktop package built in apps/desktop/release/.");
