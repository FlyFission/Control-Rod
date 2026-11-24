# Ship: the controlrod command

Release decision: **pending** a Codex blind check and the owner's yes.

- **Proposed:** merge to main.
- **Not claimed:** no compliance claim; macOS behaviour beyond parsing is untested here (see verification).

Monitoring after merge: reports of a failed or half-finished update, a stop that hits the wrong process, or a start that still fails on the database.

Rollback: revert the commit. `~/.local/bin/controlrod` then points at a `cr.mjs` without the new commands; `pnpm cr unlink` (before reverting) or deleting that file removes it. `~/.controlrod/launcher.json` is ignored by older launchers.

## Review history

| Round | Head reviewed | Outcome | Fixed in |
|---|---|---|---|
| 1 | f443ba9 | Codex HOLD: 5 P1, 7 P2, 1 P3 | 72e86c4, 7fa9ba1, except as noted below |
| 2 | 1e36fd9 | Codex HOLD: 4 P1, 9 P2, 1 P3 | cdc8d5a, except as noted below |
| 3 | 829ddec | Codex HOLD: 2 P1, 3 P2, 2 P3 | e0f47ac, except as noted below |
| 4 | e0f47ac | Codex HOLD: 2 P1, 4 P2, 1 P3 | e6954cb, except as noted below |
| 5 | e6954cb | Codex HOLD: 1 P1, 2 P2, 1 P3 | 67ac266 |
| 6 | 67ac266 | Codex HOLD: 0 P1, 3 P2, 1 P3 | the round 6 commit |

Round 1 dispositions:
- P1 process identity: fixed with pid plus start time plus an exact `scripts/cr.mjs start` command line, and no second signal to a pid whose start time changed. A separate authenticated shutdown channel was not added: the same signal as Ctrl+C keeps one stop path.
- P1 shared memory: narrowed rather than removed. `start` frees only when segments are about to run out (within 2 of `kern.sysv.shmmni`), and only same-user, 56-byte, unattached segments whose creator is gone. `doctor` reports them and `doctor --fix` frees them on request. Removing a segment that something attaches to at that moment only marks it for deletion; the attached process keeps it.
- P1 ignored files, git variables, concurrent updates: fixed (`--no-overwrite-ignore`, git location variables removed, lock plus private fetch ref); tests and mutations 5 to 7.
- P2 journal, rebuild, restart, concurrent start, link, PATH line, lock advice; P3 initdb: fixed. Declined: the shim still prefers the `node` on PATH (like pnpm and npx), since the captured path goes stale when a version manager upgrades Node; `doctor` reports an old Node.

Round 2 dispositions:
- P1 stop of another installation: without a record, only a launcher of this checkout is signalled (its command names this checkout's `cr.mjs`, or its working directory is this checkout).
- P1 shared memory: now never automatic. `start` only warns near the limit; `doctor --fix` frees on the person's request. This replaces the round 1 narrowing.
- P1 rollback over ignored files: rollback stops and lists the files instead (test, mutation 8).
- P1 lock race: the lock and the instance record are written whole and hard-linked into place; a dead holder is taken over by renaming it aside and checking it is still the one judged dead; release removes only our own lock. `--check` fetches to its own ref.
- P2 fixed: graceful-only SIGTERM (a repeated `stop` never forces), `restart` through the canonical `cr.mjs start`, lock released before a restart, sealed shim (edited copies are the person's; mutation 9), skip an old Node on PATH, macOS bash startup file, absolute `CONTROLROD_HOME`, divergence advice that keeps edits and rebuilds, PostgreSQL advice wording.
- P2 declined: recovering an update when the dependency install left Commander missing (the next command reinstalls dependencies first, which is that recovery); recovering offline (an update needs the network anyway); two `start --background` both building at the same moment (only one launcher can claim the record and run; the other reports it running).

Round 3 dispositions:
- P1 stale-lock takeover race: the hand-made locks are replaced with proper-lockfile (MIT), which holds a lock folder created atomically, refreshes it while held and takes over a stale one safely. It holds the update lock and the one-launcher claim; a launcher killed outright loses its claim within 15 seconds, and the start message says so (E-07).
- P1 rollback turning a kept file into a folder: rollback now checks every path it would change and each parent folder against what git tracks, and stops if any is an ignored or untracked file, or if it cannot tell (test).
- P2 offline recovery: an unfinished update of the checkout as it stands now finishes from local files when the fetch fails (test). Commander missing: covered by the existing reinstall before parsing.
- P2 divergence advice: now `git branch my-work && git reset --keep origin/main && controlrod setup`, which never pops an unrelated stash.
- P2 `node ./scripts/cr.mjs`: recognised as this checkout's launcher.
- P3 Linux advice: the shared-memory advice is now per platform; `doctor --fix` is offered only on macOS (test).
- P3 declined: a non-login bash on macOS. Terminal and iTerm open login shells, which read the file `link` edits; writing `.bashrc` too would add a second PATH line for most people.

Round 4 dispositions:
- P1 update lock lost during a long step: the fetch, install and build now run without blocking, so the lock keeps being refreshed (test: an 18 second build keeps the lock against a second update at 17 seconds).
- P1 a second launcher taking a stale claim: a claim is now taken only when the launcher its record names is gone (pid, start time and command), so a launcher busy in a long build keeps it (test).
- P2 divergence advice and staged edits: the advice now says to commit or stash uncommitted edits first.
- P2 dependencies missing after an interrupted update: the command checks its own package.json dependencies before loading anything and installs them first (checked as an ordinary user with proper-lockfile removed).
- P2 Linux shared memory advice: no `ipcrm` advice; it names `ipcs -m` and a restart only.
- P3 tracked folder treated as kept: every folder holding a tracked file counts as git's own (test).
- P2 declined: a lock file left by an earlier updater. Only unreleased versions of this pull request wrote one; main never had an updater.

Round 5 dispositions:
- P1 rollback removing an ignored file inside a folder that turns back into a file: rollback also lists everything git does not track (ignored files included) at or inside each changed path, and stops if there is any (test, mutation 10).
- P2 a slow git hook during the merge: the merge and the rollback reset run without blocking, like the fetch.
- P2 dependency repair during an update: the command does not install while an update holds the lock; it says an update is running.
- P3 half-installed dependencies: each dependency is loaded, not only resolved; a plain install is tried, then a forced reinstall (pnpm trusts a half-installed folder), each in a fresh process (checked as an ordinary user with a transitive dependency removed).

Round 6 dispositions (all fixed, checked as an ordinary Linux user):
- P2 stale lock blocking repair: a lock not refreshed for 15 seconds is taken over, as proper-lockfile does.
- P2 git location variables: the repair's probe drops every `GIT_` variable, like the updater.
- P2 two repairs at once: the repair takes the update lock itself (an atomic folder, kept fresh while pnpm runs), so a second command waits its turn and says so.
- P3 Node flags: the fresh process gets the same Node flags.
- GitHub Codex review of 188ffdc (P2, stale takeover deleting a new repair's lock): takeover renames the stale folder aside and checks it is the same folder (inode) it judged stale, giving back a fresh one; release and refresh touch only the holder's own folder. Four commands started together on a stale lock with a dependency missing ran exactly one repair, twice over.

## Follow-up: one-step start

Built after #177 merged, on a new pull request; review and the owner's yes for that pull request are recorded below the #177 signature.

## Signature

| Decision | Question | Answer, word for word | When | Where | Recorded by |
|---|---|---|---|---|---|
| Merge of pull request #177 | Round 5 fixes pushed (67ac266); Codex round 6 running | "Excellent, merge." | 2026-11-24 4:02 PM America/New_York (UTC-05:00) | Claude project thread for the controlrod command | Recorded by the agent (Claude); not signed for the owner |

The owner approved while Codex round 6 was running; its four findings, all in the startup dependency repair, were fixed before the merge (below). Every finding of rounds 1 to 6 is fixed or declined with its reason above.

## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
