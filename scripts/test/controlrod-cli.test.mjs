// The `controlrod` command: link (PATH install), update (git fast-forward with rollback), and the
// running-instance record. Real git and real processes; the install and build steps are stand-ins.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { claimRecord, clearRecord, findRunning, parseSegments, readRecord, releaseClaim, startedOf, stopLauncher, writeRecord } from "../lib/instance.mjs";
import { link, MARK, shellProfile, shim, unlink } from "../lib/link.mjs";
import { gitRunner, update, UpdateError } from "../lib/update.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const tmp = (name) => mkdtempSync(join(tmpdir(), `cr-${name}-`));

// ---------- link ----------

test("link writes an executable controlrod that runs this checkout, and adds PATH once", () => {
  const home = tmp("home");
  const env = { HOME: home, SHELL: "/bin/zsh", PATH: "/usr/bin:/bin" };
  const r = link(repoRoot, { env, os: "darwin" });
  assert.equal(r.status, "written");
  assert.equal(r.path, join(home, ".local", "bin", "controlrod"));
  assert.ok(r.profile.added);
  const rc = readFileSync(join(home, ".zshrc"), "utf8");
  assert.match(rc, /export PATH="\$HOME\/\.local\/bin:\$PATH"/);

  const again = link(repoRoot, { env, os: "darwin" });
  assert.equal(again.status, "unchanged");
  assert.equal(again.profile.added, false);
  assert.equal(readFileSync(join(home, ".zshrc"), "utf8"), rc, "the PATH line is added only once");

  const out = spawnSync(r.path, ["version"], { encoding: "utf8", env: { ...process.env, HOME: home } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^Control Rod [0-9a-f]{7}/);
});

test("link on PATH leaves startup files alone; bash on Linux uses .bashrc", () => {
  const home = tmp("home");
  const bin = join(home, ".local", "bin");
  const r = link(repoRoot, { env: { HOME: home, SHELL: "/bin/bash", PATH: `${bin}:/usr/bin` }, os: "linux" });
  assert.equal(r.profile, null);
  assert.equal(existsSync(join(home, ".bashrc")), false);
  const r2 = link(repoRoot, { env: { HOME: tmp("home2"), SHELL: "/bin/bash", PATH: "/usr/bin" }, os: "linux" });
  assert.match(r2.profile.file, /\.bashrc$/);
});

test("link never replaces a controlrod it did not write; unlink removes only its own", () => {
  const home = tmp("home");
  const env = { HOME: home, SHELL: "/bin/zsh", PATH: join(home, ".local", "bin") };
  link(repoRoot, { env });
  const path = join(home, ".local", "bin", "controlrod");
  writeFileSync(path, "#!/bin/sh\necho someone else's\n");
  assert.equal(link(repoRoot, { env }).status, "foreign");
  assert.equal(unlink(env).status, "foreign");
  assert.match(readFileSync(path, "utf8"), /someone else's/);
  // Marked but edited by the person: theirs now.
  writeFileSync(path, `#!/bin/sh\n${MARK}\necho edited\n`);
  assert.equal(link(repoRoot, { env }).status, "foreign");
  assert.equal(unlink(env).status, "foreign");
  writeFileSync(path, shim(repoRoot));
  assert.equal(unlink(env).status, "removed");
  assert.equal(existsSync(path), false);
});

test("the command explains a moved checkout instead of failing obscurely", () => {
  const home = tmp("home");
  const gone = join(tmp("gone"), "Control-Rod");
  const r = link(gone, { env: { HOME: home, PATH: join(home, ".local", "bin") } });
  const out = spawnSync(r.path, ["status"], { encoding: "utf8" });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /no longer at .*pnpm cr link/);
});

test("link treats a symlink, even a dangling one, as someone else's", () => {
  const home = tmp("home");
  const env = { HOME: home, PATH: join(home, ".local", "bin") };
  mkdirSync(join(home, ".local", "bin"), { recursive: true });
  symlinkSync(join(home, "nowhere"), join(home, ".local", "bin", "controlrod"));
  assert.equal(link(repoRoot, { env }).status, "foreign");
});

test("the PATH line never lets the shell run text from a folder name", () => {
  const home = "/home/u";
  assert.equal(shellProfile("/home/u/.local/bin", { HOME: home, SHELL: "/bin/zsh" }).line, 'export PATH="$HOME/.local/bin:$PATH"');
  const odd = shellProfile("/home/u/$(touch x)/bin", { HOME: home, SHELL: "/bin/zsh" }).line;
  assert.equal(odd, `export PATH='/home/u/$(touch x)/bin'":$PATH"`);
  const out = spawnSync("sh", ["-c", `${odd}; printf %s "$PATH"`], { encoding: "utf8", env: { PATH: "/bin" } });
  assert.equal(out.stdout, "/home/u/$(touch x)/bin:/bin");
});

test("a login bash on macOS gets the startup file it already reads", () => {
  const home = tmp("home");
  writeFileSync(join(home, ".profile"), "# mine\n");
  assert.equal(shellProfile("/x/bin", { HOME: home, SHELL: "/bin/bash" }, "darwin").file, join(home, ".profile"));
  writeFileSync(join(home, ".bash_login"), "# mine\n");
  assert.equal(shellProfile("/x/bin", { HOME: home, SHELL: "/bin/bash" }, "darwin").file, join(home, ".bash_login"));
  assert.equal(shellProfile("/x/bin", { HOME: tmp("h2"), SHELL: "/bin/bash" }, "darwin").file.endsWith(".bash_profile"), true);
});

test("the command skips a Node on PATH that is too old", () => {
  const home = tmp("home");
  const r = link(repoRoot, { env: { HOME: home, PATH: join(home, ".local", "bin") } });
  const fakeBin = tmp("oldnode");
  writeFileSync(join(fakeBin, "node"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const out = spawnSync(r.path, ["version"], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:/usr/bin:/bin` } });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^Control Rod /);
});

test("link refuses native Windows", () => {
  assert.equal(link(repoRoot, { env: { HOME: tmp("home") }, os: "win32" }).status, "unsupported");
});

// ---------- update ----------

const gitIn = (dir, ...args) => {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: gitEnv });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
// No global or system git config, so no user identity: stash must still work (as for a new user).
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", HOME: tmpdir() };
const commit = (dir, file, text, msg) => {
  writeFileSync(join(dir, file), text);
  gitIn(dir, "add", file);
  gitIn(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", msg);
  return gitIn(dir, "rev-parse", "HEAD");
};

function fixture() {
  const origin = tmp("origin");
  gitIn(origin, "init", "-q", "-b", "main");
  const first = commit(origin, "a.txt", "one\n", "first");
  const root = join(tmp("clone"), "Control-Rod");
  spawnSync("git", ["clone", "-q", origin, root], { env: gitEnv });
  const calls = [];
  const deps = {
    git: (args, opts = {}) => gitRunner(root)(args, { env: gitEnv, ...opts }),
    log: (m) => calls.push(["log", m]),
    stop: async () => (calls.push(["stop"]), { wasRunning: true, mode: "background" }),
    install: () => (calls.push(["install", gitIn(root, "rev-parse", "HEAD")]), true),
    build: () => (calls.push(["build", gitIn(root, "rev-parse", "HEAD")]), true),
    restart: async ({ mode }) => (calls.push(["restart", mode]), 0),
    holdInterrupts: () => calls.push(["hold"]),
  };
  const logs = () => calls.filter((c) => c[0] === "log").map((c) => c[1]).join("\n");
  const steps = () => calls.filter((c) => c[0] !== "log").map((c) => c[0]);
  return { origin, root, first, calls, deps, logs, steps };
}

test("up to date: says so and touches nothing", async () => {
  const f = fixture();
  assert.equal(await update(f.root, {}, f.deps), 0);
  assert.match(f.logs(), /up to date/);
  assert.deepEqual(f.steps(), []);
});

test("an update stops, fast-forwards, installs and builds the new code, records the old version, restarts", async () => {
  const f = fixture();
  const next = commit(f.origin, "a.txt", "two\n", "second change");
  assert.equal(await update(f.root, {}, f.deps), 0);
  assert.deepEqual(f.steps(), ["stop", "hold", "install", "build", "restart"]);
  assert.equal(f.calls.find((c) => c[0] === "build")[1], next, "the build runs on the new commit");
  assert.equal(readFileSync(join(f.root, "a.txt"), "utf8"), "two\n");
  assert.equal(gitIn(f.root, "config", "controlrod.lastVersion"), f.first);
  assert.match(f.logs(), /second change/);
  assert.equal(f.calls.find((c) => c[0] === "restart")[1], "background", "restarts the way it ran");
});

test("a failed build goes back to the old version, rebuilds it and restarts it", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "broken");
  let builds = 0;
  f.deps.build = () => (f.calls.push(["build", gitIn(f.root, "rev-parse", "HEAD")]), ++builds > 1);
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), f.first);
  assert.equal(readFileSync(join(f.root, "a.txt"), "utf8"), "one\n");
  assert.deepEqual(f.steps(), ["stop", "hold", "install", "build", "install", "build", "restart"]);
  assert.equal(f.calls.filter((c) => c[0] === "build")[1][1], f.first, "the rebuild is of the old commit");
  assert.match(f.logs(), /failed while building.*Going back/s);
  assert.equal(existsSync(join(f.root, ".git", "controlrod-update.json")), false);
});

test("a failed install also rolls back", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  let installs = 0;
  f.deps.install = () => ++installs > 1;
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), f.first);
});

test("if even the old version cannot be rebuilt, the next update finishes the job", async () => {
  const f = fixture();
  const next = commit(f.origin, "a.txt", "two\n", "new");
  f.deps.build = () => false;
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.match(f.logs(), /Could not rebuild the earlier version/);
  const built = [];
  const deps = { ...f.deps, build: () => (built.push(gitIn(f.root, "rev-parse", "HEAD")), true), log: () => undefined, stop: async () => ({ wasRunning: false }) };
  assert.equal(await update(f.root, {}, deps), 0);
  assert.deepEqual(built, [next]);
});

test("a checkout already at the latest commit but never built (interrupted update) is built", async () => {
  const f = fixture();
  writeFileSync(join(f.root, ".git", "controlrod-update.json"), JSON.stringify({ pending: f.first, from: f.first }));
  f.deps.stop = async () => (f.calls.push(["stop"]), { wasRunning: false });
  assert.equal(await update(f.root, {}, f.deps), 0);
  assert.deepEqual(f.steps(), ["stop", "hold", "install", "build"]);
  assert.equal(existsSync(join(f.root, ".git", "controlrod-update.json")), false);
});

test("local edits are set aside (no git identity needed), and the person is told how to get them back", async () => {
  const f = fixture();
  commit(f.origin, "b.txt", "new file\n", "add b");
  writeFileSync(join(f.root, "a.txt"), "my edit\n");
  assert.equal(await update(f.root, {}, f.deps), 0);
  assert.match(gitIn(f.root, "stash", "list"), /controlrod update/);
  assert.match(f.logs(), /git stash pop/);
  assert.equal(readFileSync(join(f.root, "a.txt"), "utf8"), "one\n");
  gitIn(f.root, "stash", "pop");
  assert.equal(readFileSync(join(f.root, "a.txt"), "utf8"), "my edit\n");
});

test("refuses, before stopping anything: another branch, own commits, no git clone", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  gitIn(f.root, "switch", "-q", "-c", "mine");
  await assert.rejects(update(f.root, {}, f.deps), (e) => e instanceof UpdateError && /branch "mine"/.test(e.message));
  gitIn(f.root, "switch", "-q", "main");
  commit(f.root, "c.txt", "local\n", "local commit");
  await assert.rejects(update(f.root, {}, f.deps), /commits of its own/);
  const plain = tmp("plain");
  await assert.rejects(update(plain, {}, { ...f.deps, git: gitRunner(plain) }), /not a git clone/);
  assert.deepEqual(f.steps(), [], "nothing was stopped");
});

test("when the running copy will not stop yet, nothing changes", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  f.deps.stop = async () => null;
  await assert.rejects(update(f.root, {}, f.deps), /still finishing/);
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), f.first);
});

test("--check lists what is new and changes nothing", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "feature one");
  commit(f.origin, "a.txt", "three\n", "feature two");
  assert.equal(await update(f.root, { check: true }, f.deps), 0);
  assert.match(f.logs(), /2 new changes.*feature two.*feature one/s);
  assert.deepEqual(f.steps(), []);
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), f.first);
});

test("not running: updates without restarting and says how to start", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  f.deps.stop = async () => ({ wasRunning: false });
  assert.equal(await update(f.root, {}, f.deps), 0);
  assert.ok(!f.steps().includes("restart"));
  assert.match(f.logs(), /controlrod start/);
});

test("git variables pointing elsewhere never redirect the update", async () => {
  const f = fixture();
  const next = commit(f.origin, "a.txt", "two\n", "new");
  const other = tmp("other");
  gitIn(other, "init", "-q", "-b", "main");
  const head = commit(other, "o.txt", "other\n", "other repo");
  const saved = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
  process.env.GIT_DIR = join(other, ".git");
  process.env.GIT_WORK_TREE = other;
  try {
    f.deps.git = gitRunner(f.root);
    assert.equal(await update(f.root, {}, f.deps), 0);
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), next);
  assert.equal(gitIn(other, "rev-parse", "HEAD"), head, "the other repository is untouched");
});

test("a file the person keeps that git ignores is never overwritten; the update rolls back instead", async () => {
  const f = fixture();
  commit(f.origin, ".gitignore", "local.env\n", "ignore local.env");
  await update(f.root, {}, { ...f.deps, stop: async () => ({ wasRunning: false }) });
  writeFileSync(join(f.root, "local.env"), "SECRET=mine\n");
  // Upstream starts tracking a file of that name.
  gitIn(f.origin, "rm", "-q", "--cached", ".gitignore");
  writeFileSync(join(f.origin, "local.env"), "SECRET=upstream\n");
  gitIn(f.origin, "add", "-f", "local.env");
  gitIn(f.origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "track local.env");
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.equal(readFileSync(join(f.root, "local.env"), "utf8"), "SECRET=mine\n");
});

test("only one update runs per checkout at a time", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  let release;
  const paused = new Promise((r) => (release = r));
  const first = update(f.root, {}, { ...f.deps, stop: async () => (await paused, { wasRunning: false }) });
  await new Promise((r) => setTimeout(r, 200));
  await assert.rejects(update(f.root, {}, f.deps), /Another `controlrod update` is running/);
  release();
  assert.equal(await first, 0);
  assert.equal(existsSync(join(f.root, ".git", "controlrod-update.lock")), false);
});

test("an update with a build longer than the lock's stale time keeps its lock", { timeout: 60000 }, async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  const first = update(f.root, {}, { ...f.deps, build: () => new Promise((r) => setTimeout(() => r(true), 18000)) });
  await new Promise((r) => setTimeout(r, 17000));
  await assert.rejects(update(f.root, {}, f.deps), /Another `controlrod update` is running/);
  assert.equal(await first, 0);
});

test("after an unfinished update, a failing next update goes back to the last version that built", async () => {
  const f = fixture();
  const b = commit(f.origin, "a.txt", "B\n", "B");
  // A -> B was interrupted after moving: HEAD is B, journal says it came from A.
  gitIn(f.root, "fetch", "-q", "origin", "main");
  gitIn(f.root, "merge", "-q", "--ff-only", b);
  writeFileSync(join(f.root, ".git", "controlrod-update.json"), JSON.stringify({ pending: b, from: f.first }));
  commit(f.origin, "a.txt", "C\n", "C");
  let builds = 0;
  f.deps.build = () => ++builds > 1;
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), f.first, "back on A, the last version known to build");
});

test("a restart that fails after a good update says so and keeps the new version", async () => {
  const f = fixture();
  const next = commit(f.origin, "a.txt", "two\n", "new");
  f.deps.restart = async () => 1;
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), next);
  assert.match(f.logs(), /installed but did not start/);
});

test("going back never writes over an ignored file the person keeps; it stops and says so", async () => {
  const f = fixture();
  // B stops tracking notes.txt and ignores it; the person then keeps their own notes.txt.
  commit(f.origin, "notes.txt", "tracked\n", "track notes");
  await update(f.root, {}, { ...f.deps, stop: async () => ({ wasRunning: false }) });
  const a = gitIn(f.root, "rev-parse", "HEAD");
  gitIn(f.origin, "rm", "-q", "notes.txt");
  writeFileSync(join(f.origin, ".gitignore"), "notes.txt\n");
  gitIn(f.origin, "add", ".gitignore");
  gitIn(f.origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "B: ignore notes");
  const b = gitIn(f.origin, "rev-parse", "HEAD");
  gitIn(f.root, "fetch", "-q", "origin", "main");
  gitIn(f.root, "merge", "-q", "--ff-only", b);
  writeFileSync(join(f.root, ".git", "controlrod-update.json"), JSON.stringify({ pending: b, from: a }));
  writeFileSync(join(f.root, "notes.txt"), "my notes\n");
  f.deps.build = () => false;
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.equal(readFileSync(join(f.root, "notes.txt"), "utf8"), "my notes\n");
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), b);
  assert.match(f.logs(), /Not going back automatically.*notes\.txt/s);
});

test("going back never turns a kept file into a folder the old version needs", async () => {
  const f = fixture();
  mkdirSync(join(f.origin, "config"));
  commit(f.origin, "config/item", "x\n", "A: config/item");
  await update(f.root, {}, { ...f.deps, stop: async () => ({ wasRunning: false }) });
  const a = gitIn(f.root, "rev-parse", "HEAD");
  gitIn(f.origin, "rm", "-q", "-r", "config");
  gitIn(f.origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "B: no config");
  const b = gitIn(f.origin, "rev-parse", "HEAD");
  gitIn(f.root, "fetch", "-q", "origin", "main");
  gitIn(f.root, "merge", "-q", "--ff-only", b);
  writeFileSync(join(f.root, ".git", "controlrod-update.json"), JSON.stringify({ pending: b, from: a }));
  writeFileSync(join(f.root, "config"), "my file\n");
  f.deps.build = () => false;
  assert.equal(await update(f.root, {}, f.deps), 1);
  assert.equal(readFileSync(join(f.root, "config"), "utf8"), "my file\n");
  assert.match(f.logs(), /Not going back automatically.*config/s);
});

test("going back over a tracked folder that replaced a tracked file is not blocked", async () => {
  const f = fixture();
  commit(f.origin, "config", "file\n", "A: config file");
  await update(f.root, {}, { ...f.deps, stop: async () => ({ wasRunning: false }) });
  const a = gitIn(f.root, "rev-parse", "HEAD");
  gitIn(f.origin, "rm", "-q", "config");
  mkdirSync(join(f.origin, "config"));
  commit(f.origin, "config/item", "x\n", "B: config folder");
  f.deps.build = () => false;
  assert.equal(await update(f.root, {}, { ...f.deps, stop: async () => ({ wasRunning: false }) }), 1);
  assert.equal(gitIn(f.root, "rev-parse", "HEAD"), a);
  assert.equal(readFileSync(join(f.root, "config"), "utf8"), "file\n");
});

test("going back never removes an ignored file inside a folder that turns back into a file", async () => {
  const f = fixture();
  commit(f.origin, "config", "file\n", "A: config file");
  await update(f.root, {}, { ...f.deps, stop: async () => ({ wasRunning: false }) });
  gitIn(f.origin, "rm", "-q", "config");
  mkdirSync(join(f.origin, "config"));
  writeFileSync(join(f.origin, "config", "item"), "x\n");
  commit(f.origin, ".gitignore", "config/local.env\n", "B: config folder, local.env ignored");
  gitIn(f.origin, "add", "config/item");
  gitIn(f.origin, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--amend", "--no-edit");
  f.deps.build = () => false;
  const run = update(f.root, {}, { ...f.deps, stop: async () => ({ wasRunning: false }), install: () => {
    writeFileSync(join(f.root, "config", "local.env"), "SECRET=mine\n");
    return true;
  } });
  assert.equal(await run, 1);
  assert.equal(readFileSync(join(f.root, "config", "local.env"), "utf8"), "SECRET=mine\n");
  assert.match(f.logs(), /Not going back automatically.*config\/local\.env/s);
});

test("offline, an unfinished update of the checkout as it stands is finished", async () => {
  const f = fixture();
  writeFileSync(join(f.root, ".git", "controlrod-update.json"), JSON.stringify({ pending: f.first, from: f.first }));
  gitIn(f.root, "remote", "set-url", "origin", join(tmp("gone"), "nowhere"));
  f.deps.stop = async () => ({ wasRunning: false });
  assert.equal(await update(f.root, {}, f.deps), 0);
  assert.deepEqual(f.steps(), ["hold", "install", "build"]);
});

test("a restart in this terminal happens after the update lock is released", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  let lockAtRestart;
  f.deps.restart = async () => ((lockAtRestart = existsSync(join(f.root, ".git", "controlrod-update.lock"))), 0);
  assert.equal(await update(f.root, {}, f.deps), 0);
  assert.equal(lockAtRestart, false);
});

test("update --check never moves the ref a running update installs", async () => {
  const f = fixture();
  commit(f.origin, "a.txt", "two\n", "new");
  await update(f.root, { check: true }, f.deps);
  const r = spawnSync("git", ["rev-parse", "--verify", "-q", "refs/controlrod/update-target"], { cwd: f.root, env: gitEnv });
  assert.notEqual(r.status, 0);
});

// ---------- running instance ----------

const fakeLauncher = (name = "scripts") => {
  const dir = join(tmp("fake"), name);
  mkdirSync(dir, { recursive: true });
  const fake = join(dir, name === "scripts" ? "cr.mjs" : "notcr.mjs");
  writeFileSync(fake, "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 300)); setInterval(() => {}, 1000);\n");
  return spawn(process.execPath, [fake, "start"], { stdio: "ignore" });
};
const settle = () => new Promise((r) => setTimeout(r, 300));

test("finds the running launcher from its record and stops it with a signal", async () => {
  const home = tmp("home");
  const child = fakeLauncher();
  await settle();
  writeRecord(home, { pid: child.pid, mode: "background", started: startedOf(child.pid) });
  const found = await findRunning(home, 1);
  assert.equal(found?.pid, child.pid);
  assert.equal(found.mode, "background");
  assert.equal(await stopLauncher(child.pid, { timeoutMs: 5000, started: found.started }), true);
  clearRecord(home, child.pid);
  assert.equal(readRecord(home), null);
});

test("a stale record is dropped and never signalled: not a launcher, a look-alike name, or a reused pid", async () => {
  const home = tmp("home");
  const sleeper = spawn("sleep", ["30"], { stdio: "ignore" });
  const lookalike = fakeLauncher("tools");
  const real = fakeLauncher();
  await settle();
  writeRecord(home, { pid: sleeper.pid, mode: "foreground", started: startedOf(sleeper.pid) });
  assert.equal(await findRunning(home, 1), null, "a process that is not a launcher is not ours");
  assert.equal(readRecord(home), null);
  writeRecord(home, { pid: lookalike.pid, mode: "foreground", started: startedOf(lookalike.pid) });
  assert.equal(await findRunning(home, 1), null, "notcr.mjs is not cr.mjs");
  writeRecord(home, { pid: real.pid, mode: "foreground", started: "Mon Jan  1 00:00:00 2001" });
  assert.equal(await findRunning(home, 1), null, "same pid, other start time: a reused pid");
  assert.equal(await stopLauncher(real.pid, { started: "Mon Jan  1 00:00:00 2001" }), true);
  await settle();
  assert.equal(real.exitCode, null, "the reused pid got no signal");
  for (const p of [sleeper, lookalike, real]) p.kill("SIGKILL");
});

test("only one launcher can claim this machine's Control Rod; the claim is released for the next", async () => {
  const home = tmp("home");
  assert.equal(await claimRecord(home, { mode: "foreground" }), true);
  assert.equal(readRecord(home).pid, process.pid);
  // A second claimant (here a child process) is refused while the claim is held.
  const probe = `import { claimRecord } from ${JSON.stringify(join(repoRoot, "scripts", "lib", "instance.mjs"))}; process.exit((await claimRecord(${JSON.stringify(home)}, {})) ? 0 : 3);`;
  const held = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8" });
  assert.equal(held.status, 3, held.stderr);
  await releaseClaim();
  clearRecord(home);
  const free = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8" });
  assert.equal(free.status, 0, free.stderr);
});

test("a stale claim is not taken while the launcher it names still runs", async () => {
  const home = tmp("home");
  const busy = fakeLauncher();
  await settle();
  // A launcher stuck in a long build: its lock went stale but it is alive and its record is current.
  writeRecord(home, { pid: busy.pid, mode: "foreground", started: startedOf(busy.pid) });
  mkdirSync(join(home, "launcher.lock"));
  const old = new Date(Date.now() - 60000);
  utimesSync(join(home, "launcher.lock"), old, old);
  assert.equal(await claimRecord(home, { mode: "foreground" }), false);
  assert.equal(readRecord(home).pid, busy.pid);
  busy.kill("SIGKILL");
  await settle();
  assert.equal(await claimRecord(home, { mode: "foreground" }), true, "once it is gone, the claim is taken");
  await releaseClaim();
  clearRecord(home);
});

test("dead PostgreSQL shared memory is found by header, with the live and the foreign left alone", () => {
  // Real `ipcs -ma` output from macOS 26 (owner renamed), trimmed.
  const text = `IPC status from <running system> as of Tue Nov 24 14:13:30 EST 2026
T     ID     KEY        MODE       OWNER    GROUP  CREATOR   CGROUP NATTCH  SEGSZ  CPID  LPID   ATIME    DTIME    CTIME
Shared Memory:
m 196608 0x511239e0 --rw------- me    staff me    staff      1      1   6955   6955 20:08:09 20:08:09 20:08:09
m 131073 0x5112bd9c --rw------- me    staff me    staff      0      1  25584  25584  6:26:06 15:45:08  6:26:06
m 36306947 0x00a97dd3 --rw------- me    staff me    staff      0     56  85178      0 no-entry no-entry 16:55:47
m 38797316 0x00a97dd6 --rw------- me    staff me    staff      0     56  85176      0 no-entry no-entry 16:55:47
m 30212101 0x00a97dd1 --rw------- other staff other staff      0     56  85177      0 no-entry no-entry 16:55:47
m 24576006 0x00a97ddc --rw------- me    staff me    staff      0     56  4242      0 no-entry no-entry 16:55:47
m 24576007 0x00a97ddd --rw------- me    staff me    staff      1     56  85180  85180 no-entry no-entry 16:55:47
`;
  const living = new Set([6955, 4242]);
  const found = parseSegments(text, "me", (pid) => living.has(pid));
  assert.deepEqual(found.map((s) => s.id), ["36306947", "38797316"]);
  assert.deepEqual(parseSegments("no header here", "me", () => false), []);
});

test("the controlrod help lists the everyday commands and typos get a suggestion", () => {
  const env = { ...process.env, CONTROLROD_CLI: "1" };
  const help = spawnSync(process.execPath, [join(repoRoot, "scripts", "cr.mjs")], { encoding: "utf8", env });
  assert.equal(help.status, 0);
  for (const c of ["start", "stop", "restart", "status", "open", "logs", "update", "doctor", "agents update"]) assert.match(help.stdout, new RegExp(`\\b${c}\\b`));
  assert.match(help.stdout, /^Usage: controlrod/);
  const typo = spawnSync(process.execPath, [join(repoRoot, "scripts", "cr.mjs"), "stpo"], { encoding: "utf8", env });
  assert.notEqual(typo.status, 0);
  assert.match(typo.stderr, /Did you mean stop\?/);
});


