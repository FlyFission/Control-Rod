import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandOf, procCommand, procCwd, procListener, procParent, procStarted, startedOf } from "../lib/instance.mjs";

// A small stand-in for /proc: one launcher (pid 4242) listening on port 7300 (0x1C84).
function fakeProc() {
  const proc = mkdtempSync(join(tmpdir(), "cr-proc-"));
  const p = join(proc, "4242");
  mkdirSync(join(p, "fd"), { recursive: true });
  writeFileSync(join(p, "cmdline"), "node\0/home/me/control-rod/scripts/cr.mjs\0start\0");
  // The command name holds a space and a parenthesis, which a naive split would miscount.
  const rest = ["S", "4100", ...Array.from({ length: 17 }, (_, i) => String(i)), "987654", "0"];
  writeFileSync(join(p, "stat"), `4242 (node (cr) x) ${rest.join(" ")}\n`);
  symlinkSync("/home/me/control-rod", join(p, "cwd"));
  symlinkSync("socket:[55501]", join(p, "fd", "7"));
  symlinkSync("/dev/null", join(p, "fd", "0"));
  mkdirSync(join(proc, "sys", "kernel", "random"), { recursive: true });
  writeFileSync(join(proc, "sys", "kernel", "random", "boot_id"), "b00t-1d\n");
  mkdirSync(join(proc, "net"));
  const header = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n";
  writeFileSync(
    join(proc, "net", "tcp"),
    header +
      "   0: 0100007F:1C84 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 55501 1 0 100 0 0 10 0\n" +
      "   1: 0100007F:1C85 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 55502 1 0 100 0 0 10 0\n" +
      "   2: 0100007F:1C86 0100007F:9C40 01 00000000:00000000 00:00000000 00000000  1000        0 55503 1 0 100 0 0 10 0\n",
  );
  return proc;
}

test("reads a process from /proc when ps and lsof are missing (CLI-10)", () => {
  const proc = fakeProc();
  assert.equal(procCommand(4242, proc), "node /home/me/control-rod/scripts/cr.mjs start");
  assert.equal(procParent(4242, proc), 4100);
  assert.equal(procStarted(4242, proc), "boot b00t-1d tick 987654");
  assert.equal(procCwd(4242, proc), "/home/me/control-rod");
  assert.equal(procListener(7300, proc), 4242);
});

test("a port nobody holds, a socket that is not listening, and a gone process read as null", () => {
  const proc = fakeProc();
  assert.equal(procListener(7301, proc), null, "listening, but no process holds that socket");
  assert.equal(procListener(7302, proc), null, "established, not listening");
  assert.equal(procListener(9999, proc), null);
  assert.equal(procCommand(1, proc), null);
  assert.equal(procStarted(1, proc), null);
  assert.equal(procParent(1, proc), null);
});

test("with ps off PATH, this process is still found on Linux", () => {
  const path = process.env.PATH;
  process.env.PATH = "";
  try {
    if (process.platform === "linux") {
      assert.match(commandOf(process.pid), /node/);
      assert.match(startedOf(process.pid), /^boot \S+ tick \d+$/);
    } else {
      // Elsewhere ps ships with the system; without it nothing is guessed.
      assert.equal(commandOf(process.pid), null);
    }
  } finally {
    process.env.PATH = path;
  }
});
