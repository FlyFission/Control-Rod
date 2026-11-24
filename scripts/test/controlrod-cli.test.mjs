// The `controlrod` command: link (PATH install), update (git fast-forward with rollback), and the
// running-instance record. Real git and real processes; the install and build steps are stand-ins.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { clearRecord, findRunning, parseSegments, readRecord, stopLauncher, writeRecord } from "../lib/instance.mjs";
import { link, MARK, unlink } from "../lib/link.mjs";
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
  writeFileSync(path, `#!/bin/sh\n${MARK}\n`);
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

// ---------- running instance ----------

test("finds the running launcher from its record and stops it with a signal", async () => {
  const home = tmp("home");
  const dir = tmp("fake");
  const fake = join(dir, "cr.mjs");
  writeFileSync(fake, "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 300)); setInterval(() => {}, 1000);\n");
  const child = spawn(process.execPath, [fake, "start"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 300));
  writeRecord(home, { pid: child.pid, mode: "background" });
  const found = await findRunning(home, 1);
  assert.equal(found?.pid, child.pid);
  assert.equal(found.mode, "background");
  assert.equal(await stopLauncher(child.pid, { timeoutMs: 5000 }), true);
  clearRecord(home, child.pid);
  assert.equal(readRecord(home), null);
});

test("a stale record (dead or reused pid) is dropped, never signalled", async () => {
  const home = tmp("home");
  const sleeper = spawn("sleep", ["30"], { stdio: "ignore" });
  writeRecord(home, { pid: sleeper.pid, mode: "foreground" });
  assert.equal(await findRunning(home, 1), null, "a process that is not a launcher is not ours");
  assert.equal(readRecord(home), null);
  sleeper.kill();
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


