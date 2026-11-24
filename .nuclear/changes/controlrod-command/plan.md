# Plan: the controlrod command

1. Print PostgreSQL's own error on a failed start (`pg-start-error.ts`, test).
2. Running-instance record, stop and status; dead shared memory on macOS (`instance.mjs`).
3. `link`/`unlink` (`link.mjs`) and `update` (`update.mjs`), with tests on real git.
4. Commander command set in `cr.mjs`; daemon commands pass through.
5. End-to-end run as an ordinary user: link, background start, status, stop, update with a real install and build, rollback.
6. README and getting-started; Codex blind check.



## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
