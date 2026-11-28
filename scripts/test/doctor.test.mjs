// `pnpm cr doctor` and `controlrod doctor`, run for real on a made-up machine. The PATH holds only
// stand-in programs, so the test decides what is installed; fixtures/doctor-system.mjs sets the
// platform and the user id. The checks look at the exit code and at the lines a person reads.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cr = join(repoRoot, "scripts", "cr.mjs");
const system = join(repoRoot, "scripts", "test", "fixtures", "doctor-system.mjs");
const realWhich = spawnSync("sh", ["-c", "command -v which"], { encoding: "utf8" }).stdout.trim();

const programs = {
  node: 'echo "${CR_TEST_NODE:-v22.12.0}"',
  pnpm: "echo 10.28.0",
  go: 'if [ "$1" = version ]; then echo "go version go1.24.7 linux/amd64"; else exit 1; fi',
  bwrap: 'exit "${BWRAP_STATUS:-0}"',
  socat: "echo socat 1.8",
  "sandbox-exec": "exit 0",
};

/** A folder of stand-in programs: every one in `programs` unless named in `without`. */
function machine({ without = [], extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cr-doctor-bin-"));
  symlinkSync(realWhich, join(dir, "which"));
  symlinkSync(realWhich, join(dir, "where"));
  for (const [name, body] of Object.entries({ ...programs, ...extra })) {
    if (without.includes(name)) continue;
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  }
  return dir;
}

function doctor({ platform = "linux", uid = 1000, without, extra, env = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), "cr-doctor-home-"));
  const r = spawnSync(process.execPath, ["--import", system, cr, "doctor"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30000,
    env: {
      PATH: machine({ without, extra }),
      HOME: home,
      CONTROLROD_HOME: join(home, ".controlrod"),
      CR_TEST_PLATFORM: platform,
      CR_TEST_UID: String(uid),
      CR_TEST_NODE: "v22.12.0",
      ...env,
    },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const PLACEHOLDER = /\$\{[^}]*\}/;

test("as root without a database of your own, doctor stops at once and exits 1", () => {
  const r = doctor({ uid: 0 });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /MISSING {2}ordinary user: you are running as root/);
  assert.doesNotMatch(r.out, /pnpm/, "no other checks run after the root check");
});

test("as root with CONTROLROD_DATABASE_URL, doctor goes on to the other checks", () => {
  const r = doctor({ uid: 0, env: { CONTROLROD_DATABASE_URL: "postgres://postgres@127.0.0.1:5432/postgres" } });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /ordinary user/);
  assert.match(r.out, /ok {4}database: using CONTROLROD_DATABASE_URL/);
});

test("on Linux with everything installed, doctor exits 0 and says agent runs can start", () => {
  const r = doctor();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok {4}node 22\.12\+: v22\.12\.0/);
  assert.match(r.out, /ok {4}pnpm: 10\.28\.0/);
  assert.match(r.out, /ok {4}go: go version go1\.24\.7/);
  assert.match(r.out, /ok {4}agent runs: the sandbox can start on this platform/);
});

test("a missing required tool is MISSING and the exit code is 1", () => {
  for (const tool of ["pnpm", "go"]) {
    const r = doctor({ without: [tool] });
    assert.equal(r.code, 1, `${tool}: ${r.out}`);
    assert.match(r.out, new RegExp(`MISSING {2}${tool}`));
  }
});

test("a Node older than 22.12 is named with the version found", () => {
  const r = doctor({ env: { CR_TEST_NODE: "v22.11.0" } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /MISSING {2}node 22\.12\+: found v22\.11\.0, need >= v22\.12\.0/);
});

test("optional agent CLIs that are missing are marked optional, not MISSING", () => {
  const r = doctor();
  assert.match(r.out, /-- {4}claude \(Claude Code, your login\)/);
  assert.match(r.out, /-- {4}codex/);
  assert.match(r.out, /Install Claude Code and sign in/);
});

test("on Linux without bubblewrap or socat, doctor says how to install each", () => {
  const r = doctor({ without: ["bwrap", "socat"] });
  assert.match(r.out, /agent runs: bubblewrap is missing: sudo apt install bubblewrap/);
  assert.match(r.out, /agent runs: socat is missing \(Claude Code needs it\): sudo apt install socat/);
  assert.match(r.out, /The daemon will not start an\s+agent until the sandbox can hold/);
});

test("when bubblewrap cannot make a sandbox, doctor points to the Linux setup notes", () => {
  const r = doctor({ env: { BWRAP_STATUS: "1" } });
  assert.match(r.out, /bubblewrap cannot create a sandbox here/);
  assert.match(r.out, /"Linux setup" in docs\/daemon\.md/);
});

test("on macOS, doctor checks Seatbelt and the database memory", () => {
  const ok = doctor({ platform: "darwin" });
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /ok {4}agent runs: the sandbox can start on this platform/);
  assert.match(ok.out, /ok {4}database memory: no shared memory left behind/);
  const missing = doctor({ platform: "darwin", without: ["sandbox-exec"] });
  assert.match(missing.out, /agent runs: Seatbelt \(sandbox-exec\) was not found on PATH/);
});

test("on native Windows, doctor says agent runs need WSL2", () => {
  const r = doctor({ platform: "win32" });
  assert.match(r.out, /agent runs: agent runs are not qualified on win32 yet; use WSL2 on Windows/);
});

test("doctor never prints a template placeholder such as ${me}", () => {
  for (const r of [doctor(), doctor({ uid: 0 }), doctor({ platform: "darwin" }), doctor({ without: ["bwrap", "socat", "pnpm"] })]) {
    assert.doesNotMatch(r.out, PLACEHOLDER, r.out);
  }
});
