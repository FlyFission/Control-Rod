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

## Signature

Pending.

## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
