# Ship: the controlrod command

Release decision: **pending** a Codex blind check and the owner's yes.

- **Proposed:** merge to main.
- **Not claimed:** no compliance claim; macOS behaviour beyond parsing is untested here (see verification).

Monitoring after merge: reports of a failed or half-finished update, a stop that hits the wrong process, or a start that still fails on the database.

Rollback: revert the commit. `~/.local/bin/controlrod` then points at a `cr.mjs` without the new commands; `pnpm cr unlink` (before reverting) or deleting that file removes it. `~/.controlrod/launcher.json` is ignored by older launchers.

## Review history

| Round | Head reviewed | Outcome | Fixed in |
|---|---|---|---|
| 1 | f443ba9 | Codex HOLD: 5 P1, 7 P2, 1 P3 | the next commit, except as noted below |

Round 1 dispositions:
- P1 process identity: fixed with pid plus start time plus an exact `scripts/cr.mjs start` command line, and no second signal to a pid whose start time changed. A separate authenticated shutdown channel was not added: the same signal as Ctrl+C keeps one stop path.
- P1 shared memory: narrowed rather than removed. `start` frees only when segments are about to run out (within 2 of `kern.sysv.shmmni`), and only same-user, 56-byte, unattached segments whose creator is gone. `doctor` reports them and `doctor --fix` frees them on request. Removing a segment that something attaches to at that moment only marks it for deletion; the attached process keeps it.
- P1 ignored files, git variables, concurrent updates: fixed (`--no-overwrite-ignore`, git location variables removed, lock plus private fetch ref); tests and mutations 5 to 7.
- P2 journal, rebuild, restart, concurrent start, link, PATH line, lock advice; P3 initdb: fixed. Declined: the shim still prefers the `node` on PATH (like pnpm and npx), since the captured path goes stale when a version manager upgrades Node; `doctor` reports an old Node.

## Signature

Pending.

## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
