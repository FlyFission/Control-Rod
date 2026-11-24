# Ship: live stack cleanup and software domain pack

Release decision: **proposed merge after owner review; the owner retains the merge decision.**

- **Proposed:** merge `feat/live-stack-and-software-pack` after owner review.
- **Not claimed:** live Playwright e2e browser execution of `apps/web/e2e/live/` against a built stack, live daemon subprocess launches against external CLIs, or full `services/api` Postgres-backed integration suite execution in this isolated verification pass (only `test/software-pack.test.ts`, package typechecks, `stack.ts` typecheck, repo hygiene checks, and `ng.py validate --strict-custody` ran here).
- **Owner decisions requested:** review and approve `packs/software/` role/playbook prompts and merge `feat/live-stack-and-software-pack`.

Rollback: revert the merge commit on `feat/live-stack-and-software-pack`. No database migrations, wire contracts, kernel code, or policy files were modified.

Monitoring after merge: confirm live e2e CI runs leave no leaked `/tmp/cr-live-*` directories on startup failure and that `packs/software/` intake guides appear in intake runs cleanly.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Evidence retained under `evidence/` and change record validated with `ng.py validate --strict-custody`; merge awaits owner decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
