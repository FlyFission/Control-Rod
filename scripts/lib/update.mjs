// `controlrod update`: bring this checkout to the latest main and rebuild, safely.
//
// Order: look (git, branch, what is new) before touching anything; stop a running Control Rod the
// way Ctrl+C does; set local edits aside; fast-forward; install and build with the NEW code's own
// setup; on any failure go back to the commit it started from and rebuild that, so the person is
// never left with a half-updated copy. Records in ~/.controlrod are never touched.
//
// Patterns taken, no code copied: fetch plus `git merge --ff-only` and the old..new change list
// from Oh My Zsh's tools/upgrade.sh (MIT); stashing uncommitted edits under a fixed identity, so it
// works where git has no user.name, and telling the person how to get them back rather than popping
// them, from Homebrew's `brew update` (BSD-2-Clause); ignoring Ctrl+C while the checkout is changing,
// also from `brew update`.
import { spawnSync } from "node:child_process";
import { linkSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const BRANCH = "main";

// Variables that make git act on another repository than the one in cwd. An update never honours
// them: it changes exactly the checkout it runs from.
const GIT_LOCATION_VARS = [
  "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_PREFIX", "GIT_CEILING_DIRECTORIES", "GIT_DISCOVERY_ACROSS_FILESYSTEM",
];
export function cleanEnv(env = process.env) {
  const out = { ...env };
  for (const k of GIT_LOCATION_VARS) delete out[k];
  return out;
}

export function gitRunner(root) {
  return (args, opts = {}) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8", ...opts, env: cleanEnv(opts.env ?? process.env) });
    return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim(), missing: r.error?.code === "ENOENT" };
  };
}

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
};

/**
 * One update per checkout at a time. The lock file is written whole, then hard-linked into place,
 * so it never exists without its owner's pid; a lock whose owner died is taken over by renaming it
 * aside first, so two contenders cannot both remove it. Release removes it only while it is ours.
 */
function takeLock(path) {
  const mine = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const tmp = `${path}.${process.pid}`;
  writeFileSync(tmp, mine, { mode: 0o600 });
  try {
    for (let i = 0; i < 3; i++) {
      try {
        linkSync(tmp, path);
        return () => {
          try {
            if (readFileSync(path, "utf8") === mine) rmSync(path, { force: true });
          } catch {
            /* already gone */
          }
        };
      } catch (e) {
        if (e?.code !== "EEXIST") throw e;
        let held = "";
        try {
          held = readFileSync(path, "utf8");
        } catch {
          continue;
        }
        const owner = Number(held.split(":")[0]);
        if (Number.isInteger(owner) && owner > 1 && isAlive(owner)) return null;
        const aside = `${path}.stale.${process.pid}`;
        try {
          renameSync(path, aside);
        } catch {
          continue;
        }
        if (readFileSync(aside, "utf8") !== held) {
          // Someone else took it over in between: theirs goes back, and this one gives way.
          try {
            linkSync(aside, path);
          } catch {
            /* a third one holds it */
          }
          rmSync(aside, { force: true });
          return null;
        }
        rmSync(aside, { force: true });
      }
    }
    return null;
  } finally {
    rmSync(tmp, { force: true });
  }
}

export class UpdateError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/**
 * deps: { git, install(): boolean, build(): boolean, stop(): Promise<{wasRunning, mode} | null>,
 *         restart({mode}): Promise<number|void>, log }. stop resolves null when a running copy
 * could not be stopped (nothing has changed then). Returns an exit code.
 */
export async function update(root, opts, deps) {
  const { check = false, restart = true } = opts;
  const { git, log } = deps;
  const short = (sha) => sha.slice(0, 7);

  // 1. Look before touching anything.
  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.missing) throw new UpdateError("git is not installed. Install git, then run `controlrod update` again.");
  const top = git(["rev-parse", "--show-toplevel"]);
  const notClone = () =>
    new UpdateError(`${root} is not a git clone, so it cannot be updated in place. Download it again with:\n  git clone https://github.com/FlyFission/Control-Rod.git`);
  if (!inside.ok || inside.out !== "true" || !top.ok) throw notClone();
  let same = false;
  try {
    same = realpathSync(top.out) === realpathSync(root);
  } catch {
    same = false;
  }
  if (!same) throw notClone();
  const gd = git(["rev-parse", "--absolute-git-dir"]).out;
  const gitDir = gd && isAbsolute(gd) ? gd : resolve(root, ".git");
  const statePath = join(gitDir, "controlrod-update.json");
  const readState = () => {
    try {
      return JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
      return null;
    }
  };
  const writeState = (st) => {
    const tmp = `${statePath}.tmp.${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(st)}\n`);
    renameSync(tmp, statePath);
  };
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok || branch.out !== BRANCH) {
    throw new UpdateError(
      `This copy is on ${branch.ok ? `branch "${branch.out}"` : "a detached commit"}, not ${BRANCH}. Updates follow ${BRANCH}.\n` +
        `Switch with \`git -C ${root} switch ${BRANCH}\`, then run \`controlrod update\` again.`,
    );
  }
  const release = check ? () => undefined : takeLock(join(gitDir, "controlrod-update.lock"));
  if (!release) throw new UpdateError("Another `controlrod update` is running for this copy. Let it finish, then try again.");
  // The restart happens after the lock is released: a restart in this terminal runs until the
  // person stops it, and must not hold up the next update.
  let after;
  try {
    after = await run();
  } finally {
    release();
  }
  if (typeof after === "number") return after;
  const code = await deps.restart({ mode: after.mode });
  if (after.updated && typeof code === "number" && code !== 0) {
    // The new version stays: once it has started, its database may already be upgraded.
    log("\nThe new version is installed but did not start. See `controlrod logs` and `controlrod doctor`.");
  }
  return after.failed ? 1 : typeof code === "number" ? code : 0;

  async function run() {
    log(`Checking for updates (${root})...`);
    // A private ref, so another git command's FETCH_HEAD cannot change what this update installs.
    const ref = check ? "refs/controlrod/check-target" : "refs/controlrod/update-target";
    const fetched = git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${BRANCH}:${ref}`]);
    if (!fetched.ok) {
      throw new UpdateError(`Could not reach GitHub to check for updates. Check your connection and try again.\n  ${fetched.err.split("\n")[0]}`);
    }
    const old = git(["rev-parse", "HEAD"]).out;
    const target = git(["rev-parse", ref]).out;
    const state = readState();
    // The last version known to build: an unfinished earlier update keeps the one it started from.
    const good = state?.from && git(["merge-base", "--is-ancestor", state.from, old]).ok ? state.from : old;
    // A checkout left unbuilt by an interrupted or failed update is finished even when it is current.
    const resume = old === target && state?.pending === old;
    if (old === target && !resume) {
      log(`Control Rod is up to date (${short(old)}).`);
      return 0;
    }
    if (!resume && !git(["merge-base", "--is-ancestor", old, target]).ok) {
      throw new UpdateError(
        `This copy has commits of its own that are not on ${BRANCH}, so it cannot simply move forward. Nothing was changed.\n` +
          `See them with \`git -C ${root} log origin/${BRANCH}..HEAD\`. To keep them and any edits, move them to a branch:\n` +
          `  cd ${root} && git stash && git branch my-work && git reset --keep origin/${BRANCH} && git stash pop\n` +
          `then run \`controlrod setup\` to rebuild.`,
      );
    }
    const changes = resume ? [] : git(["log", "--oneline", "--no-decorate", `${old}..${target}`]).out.split("\n").filter(Boolean);
    if (check) {
      log(resume ? "The last update did not finish; `controlrod update` finishes it." : `${changes.length} new change${changes.length === 1 ? "" : "s"} on ${BRANCH}:`);
      for (const c of changes.slice(0, 15)) log(`  ${c}`);
      if (changes.length > 15) log(`  ...and ${changes.length - 15} more`);
      if (changes.length) log("Run `controlrod update` to install them.");
      return 0;
    }
    const dirty = git(["status", "--porcelain", "--untracked-files=no"]).out;
    let stashed = false;

    // The journal is written before anything stops, so an interruption from here on is finished
    // (or undone) by the next update.
    const hadState = state !== null;
    writeState({ pending: target, from: good });
    const abandon = () => {
      if (!hadState) rmSync(statePath, { force: true });
    };

    // 2. Stop the running copy, the same way Ctrl+C does.
    let running;
    try {
      running = await deps.stop();
    } catch (e) {
      abandon();
      throw e;
    }
    if (running === null) {
      abandon();
      throw new UpdateError("Control Rod is still finishing its running work. Nothing was changed; try again in a minute.");
    }
    // From here the checkout changes: a Ctrl+C now would stop pnpm or the build halfway, and the
    // rollback below needs to run to the end. Children still get the terminal's Ctrl+C and fail,
    // which leads to that rollback.
    deps.holdInterrupts?.();
    if (dirty) {
      const files = dirty.split("\n").map((l) => l.slice(3));
      const s = git([
        "-c", "user.name=controlrod update", "-c", "user.email=controlrod-update@localhost",
        "stash", "push", "--message", `controlrod update ${new Date().toISOString()}`,
      ]);
      if (!s.ok) {
        abandon();
        log(
          `Could not set your edits to ${files.length} file${files.length === 1 ? "" : "s"} aside (git said: ${s.err.split("\n")[0]}).\n` +
            `Nothing was changed. Save them yourself, or undo them with \`git -C ${root} restore .\`, then try again.`,
        );
        return running.wasRunning && restart ? { mode: running.mode, failed: true } : 1;
      }
      stashed = true;
      log(`Set your edits to ${files.length} file${files.length === 1 ? "" : "s"} aside (${files.slice(0, 3).join(", ")}${files.length > 3 ? ", ..." : ""}).`);
    }

    const backOnGood = async (step) => {
      log(`\nThe update failed while ${step}. Going back to the version you had (${short(good)})...`);
      const head = git(["rev-parse", "HEAD"]).out;
      // Going back must not write over a file the person keeps that git now ignores.
      if (head !== good) {
        const paths = git(["diff", "--name-only", "-z", head, good]).out.split("\0").filter(Boolean);
        const kept = paths.length
          ? git(["ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--", ...paths]).out.split("\0").filter(Boolean)
          : [];
        if (kept.length) {
          writeState({ pending: head, from: good });
          log(
            `Not going back automatically: that would replace files you keep here that git ignores:\n` +
              kept.slice(0, 10).map((f) => `  ${f}`).join("\n") +
              `\nMove them somewhere safe, then run \`controlrod update\` again.`,
          );
          return 1;
        }
      }
      const reset = head === good ? { ok: true } : git(["reset", "--keep", good]);
      if (!reset.ok) log(reset.err);
      const rebuilt = reset.ok && deps.install() && deps.build();
      if (!rebuilt) {
        writeState({ pending: git(["rev-parse", "HEAD"]).out, from: good });
        log(
          `Could not rebuild the earlier version either. Your records in ~/.controlrod are untouched.\n` +
            `Run \`controlrod update\` again once the problem above is fixed.`,
        );
        return 1;
      }
      rmSync(statePath, { force: true });
      log(`Back on ${short(good)}, as before.${stashed ? ` Your edits are set aside; to get them back: cd ${root} && git stash pop` : ""}`);
      return running.wasRunning && restart ? { mode: running.mode, failed: true } : 1;
    };

    // 3. Move forward, then install and build with the new code.
    if (!resume) {
      // --no-overwrite-ignore: a file the person keeps that git ignores is never replaced.
      const ff = git(["merge", "--ff-only", "--no-overwrite-ignore", "--quiet", target]);
      if (!ff.ok) {
        log(ff.err);
        return backOnGood(`moving to the new version (git said: ${ff.err.split("\n")[0]})`);
      }
    }
    log(`\nInstalling dependencies...`);
    if (!deps.install()) return backOnGood("installing dependencies");
    log(`\nBuilding...`);
    if (!deps.build()) return backOnGood("building");
    rmSync(statePath, { force: true });
    git(["config", "controlrod.lastVersion", good]);

    log(`\nUpdated Control Rod ${short(good)} -> ${short(target)}.`);
    for (const c of changes.slice(0, 15)) log(`  ${c}`);
    if (changes.length > 15) log(`  ...and ${changes.length - 15} more`);
    if (stashed) log(`Your edits are set aside. To get them back: cd ${root} && git stash pop`);
    if (running.wasRunning && restart) return { mode: running.mode, updated: true };
    log(running.wasRunning ? "Start it again with `controlrod start`." : "Start it with `controlrod start`.");
    return 0;
  }
}
