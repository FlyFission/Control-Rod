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
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BRANCH = "main";

const statePath = (root) => join(root, ".git", "controlrod-update.json");
const readState = (root) => {
  try {
    return JSON.parse(readFileSync(statePath(root), "utf8"));
  } catch {
    return null;
  }
};
const writeState = (root, state) => writeFileSync(statePath(root), `${JSON.stringify(state)}\n`);

export function gitRunner(root) {
  return (args, opts = {}) => {
    const r = spawnSync("git", args, { cwd: root, encoding: "utf8", ...opts });
    return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim(), missing: r.error?.code === "ENOENT" };
  };
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
  if (!inside.ok || inside.out !== "true" || !existsSync(join(root, ".git"))) {
    throw new UpdateError(
      `${root} is not a git clone, so it cannot be updated in place. Download it again with:\n` +
        "  git clone https://github.com/FlyFission/Control-Rod.git",
    );
  }
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok || branch.out !== BRANCH) {
    throw new UpdateError(
      `This copy is on ${branch.ok ? `branch "${branch.out}"` : "a detached commit"}, not ${BRANCH}. Updates follow ${BRANCH}.\n` +
        `Switch with \`git -C ${root} switch ${BRANCH}\`, then run \`controlrod update\` again.`,
    );
  }
  log(`Checking for updates (${root})...`);
  const fetched = git(["fetch", "--quiet", "origin", BRANCH]);
  if (!fetched.ok) {
    throw new UpdateError(`Could not reach GitHub to check for updates. Check your connection and try again.\n  ${fetched.err.split("\n")[0]}`);
  }
  const old = git(["rev-parse", "HEAD"]).out;
  const target = git(["rev-parse", "FETCH_HEAD"]).out;
  const state = readState(root);
  // A checkout left unbuilt by an interrupted or failed update is finished even when it is current.
  const resume = old === target && state?.pending === old;
  if (old === target && !resume) {
    log(`Control Rod is up to date (${short(old)}).`);
    return 0;
  }
  if (!resume && !git(["merge-base", "--is-ancestor", old, target]).ok) {
    throw new UpdateError(
      `This copy has commits of its own that are not on ${BRANCH}, so it cannot simply move forward.\n` +
        `See them with \`git -C ${root} log origin/${BRANCH}..HEAD\`. Keep them on a branch of your own, then\n` +
        `\`git -C ${root} reset --hard origin/${BRANCH}\` and run \`controlrod update\` again.`,
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

  // 2. Stop the running copy, the same way Ctrl+C does.
  const running = await deps.stop();
  if (running === null) throw new UpdateError("Control Rod is still finishing its running work. Nothing was changed; try again in a minute.");
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
      if (running.wasRunning && restart) await deps.restart({ mode: running.mode });
      throw new UpdateError(
        `Could not set your edits to ${files.length} file${files.length === 1 ? "" : "s"} aside (git said: ${s.err.split("\n")[0]}).\n` +
          `Nothing was changed. Save them yourself, or undo them with \`git -C ${root} restore .\`, then try again.`,
      );
    }
    stashed = true;
    log(`Set your edits to ${files.length} file${files.length === 1 ? "" : "s"} aside (${files.slice(0, 3).join(", ")}${files.length > 3 ? ", ..." : ""}).`);
  }

  const backOnOld = async (step) => {
    log(`\nThe update failed while ${step}. Going back to the version you had (${short(old)})...`);
    const reset = old === git(["rev-parse", "HEAD"]).out ? { ok: true } : git(["reset", "--keep", old]);
    const rebuilt = reset.ok && deps.install() && deps.build();
    rmSync(statePath(root), { force: true });
    if (!rebuilt) {
      log(
        `Could not rebuild the earlier version either. Your records in ~/.controlrod are untouched.\n` +
          `Run \`controlrod update\` again once the problem above is fixed.`,
      );
      writeState(root, { pending: git(["rev-parse", "HEAD"]).out, from: old });
      return 1;
    }
    log(`Back on ${short(old)}, as before.${stashed ? ` Your edits are set aside; to get them back: cd ${root} && git stash pop` : ""}`);
    if (running.wasRunning && restart) await deps.restart({ mode: running.mode });
    return 1;
  };

  // 3. Move forward, then install and build with the new code.
  writeState(root, { pending: target, from: state?.from ?? old });
  if (!resume) {
    const ff = git(["merge", "--ff-only", "--quiet", target]);
    if (!ff.ok) {
      log(ff.err);
      return backOnOld(`moving to the new version (git said: ${ff.err.split("\n")[0]})`);
    }
  }
  log(`\nInstalling dependencies...`);
  if (!deps.install()) return backOnOld("installing dependencies");
  log(`\nBuilding...`);
  if (!deps.build()) return backOnOld("building");
  rmSync(statePath(root), { force: true });
  git(["config", "controlrod.lastVersion", state?.from ?? old]);

  log(`\nUpdated Control Rod ${short(state?.from ?? old)} -> ${short(target)}.`);
  for (const c of changes.slice(0, 15)) log(`  ${c}`);
  if (changes.length > 15) log(`  ...and ${changes.length - 15} more`);
  if (stashed) log(`Your edits are set aside. To get them back: cd ${root} && git stash pop`);
  if (running.wasRunning && restart) {
    const code = await deps.restart({ mode: running.mode });
    return typeof code === "number" ? code : 0;
  }
  log(running.wasRunning ? "Start it again with `controlrod start`." : "Start it with `controlrod start`.");
  return 0;
}
