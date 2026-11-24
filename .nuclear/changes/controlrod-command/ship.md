# Ship: the controlrod command

Release decision: **pending** a Codex blind check and the owner's yes.

- **Proposed:** merge to main.
- **Not claimed:** no compliance claim; macOS behaviour beyond parsing is untested here (see verification).

Monitoring after merge: reports of a failed or half-finished update, a stop that hits the wrong process, or a start that still fails on the database.

Rollback: revert the commit. `~/.local/bin/controlrod` then points at a `cr.mjs` without the new commands; `pnpm cr unlink` (before reverting) or deleting that file removes it. `~/.controlrod/launcher.json` is ignored by older launchers.

## Signature

Pending.

## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
