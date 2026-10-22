#!/usr/bin/env node
// Control Rod on one machine: `pnpm cr doctor`, `pnpm cr setup`, `pnpm cr start`.
// Starts the control plane (with an embedded Postgres unless CONTROLROD_DATABASE_URL is set),
// the run daemon, and serves the web app at http://localhost:7300.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = process.env.CONTROLROD_HOME ?? join(homedir(), ".controlrod");
const bin = join(home, "bin");
const port = Number(process.env.CONTROLROD_PORT ?? 7300);
const drawing tool_COMMIT = "e4214f7180d041d1a88fbb1885317648d0e8bc4b";
const sitePack = join(root, "packs", "capital-projects", "example-package");

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
const drawing tool = () => process.env.drawing tool_CLI ?? (existsSync(join(bin, "drawing tool-cli")) ? join(bin, "drawing tool-cli") : which("drawing tool-cli"));

function doctor() {
  const rows = [
    ["node 22+", version("node"), true],
    ["pnpm", version("pnpm"), true],
    ["go", version("go", ["version"]), true],
    ["uv (Python tools)", version("uv"), true],
    ["claude (Claude Code, your login)", which("claude") && version("claude"), false],
    ["codex (optional, for an independent pre-check runtime)", which("codex") && version("codex"), false],
    ["drawing tool-cli (drawings)", drawing tool() && version(drawing tool()), false],
  ];
  let ok = true;
  for (const [name, found, required] of rows) {
    console.log(`${found ? "ok  " : required ? "MISSING" : "--  "}  ${name}${found ? `: ${found}` : ""}`);
    if (!found && required) ok = false;
  }
  if (!which("claude")) console.log("\nInstall Claude Code and sign in so agents can run on your subscription.");
  if (!drawing tool()) console.log("\nDrawings need drawing tool: run `pnpm cr setup-drawing tool` (needs Rust; builds the pinned version).");
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
  if (existsSync(join(sitePack, "pyproject.toml"))) run("uv", ["sync", "--quiet"], { cwd: sitePack });
}

function setupdrawing tool() {
  const src = join(home, "src", "drawing tool");
  if (!existsSync(src)) run("git", ["clone", "https://github.com/storytold/drawing tool", src]);
  run("git", ["-C", src, "fetch", "--depth", "1", "origin", drawing tool_COMMIT]);
  run("git", ["-C", src, "checkout", "--quiet", drawing tool_COMMIT]);
  run("cargo", ["build", "--release", "-p", "drawing tool-cli"], { cwd: src });
  run("cp", [join(src, "target", "release", "drawing tool-cli"), join(bin, "drawing tool-cli")]);
  console.log(`drawing tool ${drawing tool_COMMIT.slice(0, 7)} installed in ${bin}`);
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
  const env = { ...process.env, CONTROLROD_HOME: home };
  const cc = drawing tool();
  if (cc) env.drawing tool_CLI = cc;
  const venvBin = join(sitePack, ".venv", "bin");
  env.PATH = [bin, existsSync(venvBin) ? venvBin : null, env.PATH].filter(Boolean).join(delimiter);

  const api = spawn("node", [join(root, "services", "api", "dist", "server.js")], { env, stdio: "inherit" });
  await waitForHealth();
  const token = readFileSync(join(home, "daemon.token"), "utf8").trim();
  const daemon = spawn(join(bin, "controlrod"), ["daemon", "--parallel", process.env.CONTROLROD_PARALLEL ?? "3"], {
    env: { ...env, CONTROLROD_API: `http://127.0.0.1:${port}`, CONTROLROD_DAEMON_TOKEN: token },
    stdio: "inherit",
  });
  console.log(`\nControl Rod: open http://localhost:${port} (Ctrl+C stops everything)\n`);
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

const cmd = process.argv[2] ?? "start";
if (cmd === "doctor") process.exit(doctor() ? 0 : 1);
else if (cmd === "setup") setup();
else if (cmd === "setup-drawing tool") setupdrawing tool();
else if (cmd === "start") await start();
else {
  console.log("Usage: pnpm cr [doctor|setup|setup-drawing tool|start]");
  process.exit(2);
}
