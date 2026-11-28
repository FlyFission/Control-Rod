// The running Control Rod on this machine: a small record the launcher writes while it runs, so
// `controlrod stop`, `status`, `restart` and `update` can find it from any terminal.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import lockfile from "proper-lockfile";
import { join } from "node:path";

export const recordPath = (home) => join(home, "launcher.json");

export function writeRecord(home, record) {
  const path = recordPath(home);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

export function readRecord(home) {
  try {
    const r = JSON.parse(readFileSync(recordPath(home), "utf8"));
    return Number.isInteger(r?.pid) && r.pid > 1 ? r : null;
  } catch {
    return null;
  }
}

/** Removes the record only when it is this process's own, so a second launcher never erases the first's. */
export function clearRecord(home, pid = process.pid) {
  const r = readRecord(home);
  if (r && r.pid === pid) rmSync(recordPath(home), { force: true });
}

export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

// Slim Linux images can lack ps and lsof. There, each lookup below reads /proc instead, so `stop`
// still finds its own launcher. Only a missing command falls back: when ps runs, its answer stands.
const missing = (r) => r.error?.code === "ENOENT" && process.platform === "linux";

/** The process's command line, or null when it is gone. Works on macOS and Linux. */
export function commandOf(pid) {
  const r = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  if (missing(r)) return procCommand(pid);
  return r.status === 0 ? r.stdout.trim() || null : null;
}

/** When the process started, as ps prints it: with the pid, it names one process for good. */
export function startedOf(pid) {
  const r = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
  if (missing(r)) return procStarted(pid);
  return r.status === 0 ? r.stdout.trim() || null : null;
}

/** The arguments in /proc/<pid>/cmdline, joined with spaces as ps prints them. */
export function procCommand(pid, proc = "/proc") {
  try {
    const args = readFileSync(join(proc, String(pid), "cmdline"), "utf8").split("\0");
    if (args.at(-1) === "") args.pop();
    return args.join(" ").trim() || null;
  } catch {
    return null;
  }
}

/** The fields of /proc/<pid>/stat after the command name, which may itself hold spaces and parentheses. */
function procStat(pid, proc) {
  try {
    const stat = readFileSync(join(proc, String(pid), "stat"), "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).trim().split(" ");
  } catch {
    return null;
  }
}

/**
 * The process's start time in clock ticks since boot (stat field 22), with the boot's id, so the
 * pair names one process for good, as ps's start time does.
 */
export function procStarted(pid, proc = "/proc") {
  const f = procStat(pid, proc);
  if (!f || !/^\d+$/.test(f[19] ?? "")) return null;
  let boot = "";
  try {
    boot = readFileSync(join(proc, "sys", "kernel", "random", "boot_id"), "utf8").trim();
  } catch {
    // Without a boot id the tick count alone still tells two processes with one pid apart.
  }
  return `boot ${boot || "unknown"} tick ${f[19]}`;
}

/** The parent pid (stat field 4). */
export function procParent(pid, proc = "/proc") {
  const ppid = Number(procStat(pid, proc)?.[1]);
  return Number.isInteger(ppid) && ppid > 1 ? ppid : null;
}

/** The process that listens on a local TCP port: the socket's inode from /proc/net/tcp, then the process holding it. */
export function procListener(port, proc = "/proc") {
  const inodes = new Set();
  for (const table of ["tcp", "tcp6"]) {
    let text;
    try {
      text = readFileSync(join(proc, "net", table), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n").slice(1)) {
      const f = line.trim().split(/\s+/);
      // f[1] is the local address as HEXADDR:HEXPORT, f[3] the state (0A is LISTEN), f[9] the inode.
      if (f.length < 10 || f[3] !== "0A") continue;
      if (Number.parseInt(f[1].split(":").at(-1), 16) === port && f[9] !== "0") inodes.add(f[9]);
    }
  }
  if (!inodes.size) return null;
  let pids;
  try {
    pids = readdirSync(proc).filter((d) => /^\d+$/.test(d));
  } catch {
    return null;
  }
  for (const p of pids) {
    let fds;
    try {
      fds = readdirSync(join(proc, p, "fd"));
    } catch {
      continue; // another user's process, or gone
    }
    for (const fd of fds) {
      let target;
      try {
        target = readlinkSync(join(proc, p, "fd", fd));
      } catch {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(target);
      if (m && inodes.has(m[1]) && Number(p) > 1) return Number(p);
    }
  }
  return null;
}

/** The working directory, from the /proc/<pid>/cwd link. */
export function procCwd(pid, proc = "/proc") {
  try {
    return readlinkSync(join(proc, String(pid), "cwd"));
  } catch {
    return null;
  }
}

// `node /path/to/scripts/cr.mjs start`, or under pnpm `node scripts/cr.mjs start` (or bare
// `node scripts/cr.mjs`, which starts too).
const LAUNCHER = /(^|[\s/])scripts\/cr\.mjs(\s+start(\s|$)|\s*$)/;
const isLauncher = (pid) => {
  const c = commandOf(pid);
  return c !== null && LAUNCHER.test(c);
};

/** A record names a live launcher only when the pid, its start time and its command line all match. */
export function recordIsLive(r) {
  return Boolean(r && alive(r.pid) && r.started && startedOf(r.pid) === r.started && isLauncher(r.pid));
}

/**
 * Claims this machine's Control Rod for this launcher: false when another live launcher holds it.
 * The claim is a proper-lockfile lock (MIT; the lock npm's own tooling family uses) held for the
 * launcher's whole life and refreshed every few seconds, so a launcher that dies loses it on its
 * own; only the holder then writes the record.
 */
export async function claimRecord(home, record) {
  let release;
  try {
    release = await lockfile.lock(home, {
      lockfilePath: join(home, "launcher.lock"),
      stale: 15000,
      update: 3000,
      retries: 0,
      realpath: false,
      onCompromised: () => undefined,
    });
  } catch (e) {
    if (e?.code === "ELOCKED") return false;
    throw e;
  }
  // A launcher busy in a long build can miss refreshing its claim, so a claim that went stale is
  // only taken when the launcher it named is gone: the record, not the lock's age, is the identity.
  const current = readRecord(home);
  if (current && current.pid !== process.pid && recordIsLive(current)) {
    await release().catch(() => undefined);
    return false;
  }
  writeRecord(home, { ...record, pid: process.pid, started: startedOf(process.pid) });
  heldRelease = release;
  return true;
}
let heldRelease = null;

/** Gives the claim back (the record is cleared separately). */
export async function releaseClaim() {
  const r = heldRelease;
  heldRelease = null;
  await r?.().catch(() => undefined);
}

/** The working directory of a process, via lsof (macOS and Linux). */
function cwdOf(pid) {
  const r = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  if (missing(r)) return procCwd(pid);
  const line = r.status === 0 ? r.stdout.split("\n").find((l) => l.startsWith("n")) : null;
  return line ? line.slice(1) : null;
}

const samePath = (a, b) => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
};

/** The process listening on a local TCP port, via lsof, or /proc on Linux without it. */
function listenerOf(port) {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  if (missing(r)) return procListener(port);
  if (r.status !== 0) return null;
  const pid = Number(r.stdout.trim().split("\n")[0]);
  return Number.isInteger(pid) && pid > 1 ? pid : null;
}

function parentOf(pid) {
  const r = spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" });
  if (missing(r)) return procParent(pid);
  const ppid = Number(r.stdout?.trim());
  return r.status === 0 && Number.isInteger(ppid) && ppid > 1 ? ppid : null;
}

export async function healthy(port, timeoutMs = 1500) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Finds the running launcher. Returns { pid, mode, record } for one this command can stop,
 * { foreign: true } when something answers on the port that is not a Control Rod launcher this
 * user can find, or null when nothing runs. A launcher started before the record existed is found
 * through the control plane listening on the port, whose parent is the launcher.
 */
export async function findRunning(home, port, root = null) {
  const record = readRecord(home);
  if (recordIsLive(record)) return { pid: record.pid, mode: record.mode ?? "foreground", record, started: record.started };
  if (record) clearRecord(home, record.pid);
  const listener = listenerOf(port);
  if (listener) {
    const parent = parentOf(listener);
    // Without a record, only a launcher of this very checkout counts: one whose command names this
    // checkout's cr.mjs, or a `pnpm cr` launcher whose working directory is this checkout.
    const cmd = parent ? commandOf(parent) : null;
    const ours =
      parent && isLauncher(parent) && root &&
      (cmd.includes(`${root}/scripts/cr.mjs`) || (/(^|\s)(\.\/)?scripts\/cr\.mjs/.test(cmd) && samePath(cwdOf(parent) ?? "", root)));
    if (ours) return { pid: parent, mode: "foreground", record: null, started: startedOf(parent) };
    return { foreign: true, pid: listener, command: commandOf(listener) };
  }
  if (await healthy(port)) return { foreign: true, pid: null, command: null };
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Stops a launcher the way Ctrl+C does: running work finishes and is saved first. With now, a
 * second signal a moment later skips that wait (the launcher treats it as a second Ctrl+C).
 * Resolves true once it has exited, false if it is still finishing after timeoutMs.
 */
export async function stopLauncher(pid, { now = false, timeoutMs = 180000, log = console.log, started = startedOf(pid) } = {}) {
  // Every signal goes only to the same process that was found: same pid, same start time.
  const same = () => started !== null && alive(pid) && startedOf(pid) === started;
  if (!same()) return !alive(pid) || startedOf(pid) !== started;
  process.kill(pid, "SIGTERM");
  if (now) {
    await sleep(1200);
    // The launcher treats a second Ctrl+C (SIGINT) as "stop now"; SIGTERM alone never forces.
    if (same()) process.kill(pid, "SIGINT");
  }
  const t0 = Date.now();
  let told = t0;
  while (same()) {
    if (Date.now() - t0 > timeoutMs) return false;
    if (Date.now() - told > 10000) {
      log("  still finishing running work...");
      told = Date.now();
    }
    await sleep(250);
  }
  return true;
}

/**
 * macOS gives PostgreSQL only 32 System V shared memory segments in all. A PostgreSQL that is
 * killed outright leaves its small interlock segment behind, and once they are used up no
 * PostgreSQL can start ("could not create shared memory segment: No space left on device").
 * Lists this user's segments that nothing is attached to and whose creating process is gone:
 * nobody can ever use those again. Only segments of PostgreSQL's interlock size are listed. Returns [{ id, size, cpid }].
 */
// PostgreSQL 17 on macOS keeps its shared memory in mmap and holds only this small System V
// interlock segment (PGShmemHeader). Matching the size keeps other programs' segments out of reach.
export const PG_INTERLOCK_BYTES = 56;

export function orphanedSegments(user = process.env.USER ?? process.env.LOGNAME) {
  const r = spawnSync("ipcs", ["-ma"], { encoding: "utf8" });
  return r.status === 0 && user ? parseSegments(r.stdout, user, alive) : [];
}

/** Reads `ipcs -ma` output by its header, so column order differences between systems do not matter. */
export function parseSegments(text, user, isAlive) {
  const lines = text.split("\n");
  const header = lines.find((l) => /\bNATTCH\b/.test(l) && /\bCPID\b/.test(l));
  if (!header) return [];
  const cols = header.trim().split(/\s+/);
  const [iT, iId, iOwner, iN, iSize, iCpid] = ["T", "ID", "OWNER", "NATTCH", "SEGSZ", "CPID"].map((n) => cols.indexOf(n));
  if ([iT, iId, iOwner, iN, iSize, iCpid].some((i) => i < 0)) return [];
  const out = [];
  for (const line of lines) {
    const f = line.trim().split(/\s+/);
    if (f[iT] !== "m" || f.length !== cols.length) continue;
    if (f[iOwner] !== user || Number(f[iN]) !== 0 || Number(f[iSize]) !== PG_INTERLOCK_BYTES) continue;
    const cpid = Number(f[iCpid]);
    if (!Number.isInteger(cpid) || cpid <= 1 || isAlive(cpid)) continue;
    out.push({ id: f[iId], size: Number(f[iSize]), cpid });
  }
  return out;
}

/**
 * How many System V shared memory segments exist on this Mac, and the most there can be
 * (kern.sysv.shmmni). null when either cannot be read.
 */
export function segmentUse() {
  const lim = spawnSync("sysctl", ["-n", "kern.sysv.shmmni"], { encoding: "utf8" });
  const list = spawnSync("ipcs", ["-m"], { encoding: "utf8" });
  const limit = Number(lim.stdout?.trim());
  if (lim.status !== 0 || list.status !== 0 || !Number.isInteger(limit)) return null;
  const used = list.stdout.split("\n").filter((l) => /^m\s/.test(l.trim())).length;
  return { used, limit };
}

/** Frees orphaned segments (see orphanedSegments). Returns how many were removed. */
export function freeOrphanedSegments(segments = orphanedSegments()) {
  let n = 0;
  for (const s of segments) if (spawnSync("ipcrm", ["-m", s.id]).status === 0) n++;
  return n;
}

