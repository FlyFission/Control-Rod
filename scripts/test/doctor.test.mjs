import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAUDE_NATIVE_INSTALL, agentCliRows, agentRunProblems, checkMachine } from "../lib/doctor.mjs";

const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const SCRIPT = Buffer.from("#!/u");

// A stand-in machine: a platform, a user id and the commands on PATH (with what --version says).
function fake({ os = "linux", uid = 1000, env = {}, path = {}, bwrapWorks = true, heads = {} } = {}) {
  const ran = [];
  return {
    ran,
    platform: () => os,
    getuid: () => uid,
    env,
    node: "22.12.0",
    which: (cmd) => (cmd in path ? `/usr/bin/${cmd}` : null),
    version: (cmd) => (cmd in path ? path[cmd] : null),
    run: (cmd, args) => {
      ran.push([cmd, ...args]);
      return { status: bwrapWorks ? 0 : 1 };
    },
    realpath: (p) => p,
    head: (p) => heads[p] ?? ELF,
  };
}

const tools = { node: "v22.12.0", pnpm: "10.0.0", go: "go1.24", python3: "Python 3.13" };
const linuxReady = { ...tools, bwrap: "0.9", socat: "1.8", claude: "2.1.0" };

test("as root, doctor says so in one row and still checks the rest (CLI-7)", () => {
  const r = checkMachine(fake({ uid: 0, path: linuxReady }));
  assert.equal(r.ok, false);
  assert.match(r.lines[0], /^MISSING {2}ordinary user: you are running as root/);
  assert.ok(r.lines.some((l) => l.startsWith("ok    pnpm")), "the other tools are still checked");
  assert.ok(r.agentLines.some((l) => l.startsWith("ok    agent runs")));
});

test("as root with a database of your own, there is no root row", () => {
  const r = checkMachine(fake({ uid: 0, env: { CONTROLROD_DATABASE_URL: "postgres://x" }, path: linuxReady }));
  assert.equal(r.ok, true);
  assert.ok(!r.lines.some((l) => l.includes("root")));
});

test("a machine that can run agents passes doctor --strict", () => {
  const r = checkMachine(fake({ path: linuxReady }));
  assert.equal(r.ok, true);
  assert.equal(r.agentsOk, true);
  assert.equal(r.blocking, false);
  assert.deepEqual(r.notes, []);
});

test("missing bubblewrap and socat are agent problems: the app can start, --strict fails (CLI-6)", () => {
  const r = checkMachine(fake({ path: { ...tools, claude: "2.1.0" } }), { me: "controlrod" });
  assert.equal(r.ok, true, "the app still starts");
  assert.equal(r.agentsOk, false);
  assert.ok(r.agentLines.some((l) => l.includes("bubblewrap is missing: sudo apt install bubblewrap")));
  assert.ok(r.agentLines.some((l) => l.includes("socat is missing")));
  assert.ok(r.notes.some((n) => n.includes("`controlrod doctor --strict` exits 1")));
});

test("a bubblewrap that cannot make a sandbox points to the Linux setup", () => {
  const d = fake({ path: linuxReady, bwrapWorks: false });
  const problems = agentRunProblems(d);
  assert.equal(problems.length, 1);
  assert.match(problems[0].text, /Linux setup/);
  assert.equal(d.ran[0][0], "bwrap");
});

test("native Windows is a MISSING row that points to WSL2 (CLI-6)", () => {
  const r = checkMachine(fake({ os: "win32", uid: undefined, path: { ...tools, claude: "2.1.0" } }));
  assert.equal(r.blocking, true);
  assert.equal(r.agentsOk, false);
  const row = r.agentLines.find((l) => l.includes("agent runs"));
  assert.match(row, /^MISSING {2}agent runs: native Windows can't run agents\. Install WSL2/);
});

test("no agent CLI at all fails --strict and says how to install Claude Code natively", () => {
  const r = checkMachine(fake({ path: { ...tools, bwrap: "0.9", socat: "1.8" } }));
  assert.equal(r.agentsOk, false);
  assert.ok(r.agentLines.some((l) => l.includes("claude (Claude Code): not installed") && l.includes(CLAUDE_NATIVE_INSTALL)));
});

test("a Claude Code that starts through a script gets the native install command (DMN-3, RM-6)", () => {
  const rows = agentCliRows(fake({ path: linuxReady, heads: { "/usr/bin/claude": SCRIPT } }));
  const row = rows.find((l) => l.includes("claude (Claude Code)"));
  assert.match(row, /^-- {4}claude \(Claude Code\): starts through a script/);
  assert.ok(row.includes(CLAUDE_NATIVE_INSTALL));
});

test("a native Claude Code is ok with its version", () => {
  const rows = agentCliRows(fake({ path: linuxReady }));
  assert.ok(rows.includes("ok    claude (Claude Code, your login): 2.1.0"));
});

test("Antigravity and Grok CLI found on Linux say they run on macOS only (RM-6)", () => {
  const d = fake({ path: { ...linuxReady, agy: "1.0", grok: "0.5" } });
  const rows = agentCliRows(d);
  assert.ok(rows.includes("--    agy (Antigravity): found, but Control Rod runs it on macOS only (its sandbox is checked there alone)"));
  assert.ok(rows.some((l) => l.startsWith("--    grok (Grok CLI): found, but")));
  // Found but not startable here, so they do not count as an agent that can run.
  const only = checkMachine(fake({ path: { ...tools, bwrap: "0.9", socat: "1.8", agy: "1.0" } }));
  assert.equal(only.agentsOk, false);
});

test("on macOS, Antigravity counts as an agent that can run", () => {
  const r = checkMachine(fake({ os: "darwin", path: { ...tools, "sandbox-exec": "", agy: "1.0" } }));
  assert.equal(r.agentsOk, true);
  assert.ok(r.agentLines.includes("ok    agy (Antigravity): 1.0"));
});

test("an old node is MISSING with what was found", () => {
  const d = fake({ path: { ...linuxReady, node: "v20.1.0" } });
  d.node = "20.1.0";
  const r = checkMachine(d);
  assert.equal(r.ok, false);
  assert.ok(r.lines.includes("MISSING  node 22.12+: found v20.1.0, need >= v22.12.0"));
});
