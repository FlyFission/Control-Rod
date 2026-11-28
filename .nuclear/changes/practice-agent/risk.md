# Risk: Practice agent: watch the whole loop on a bundled sample, with no account

- R-01: a practice agent does real work. Mitigation: the claim filters by the project's server-side `practice` mark, `startRun` refuses a practice runtime on any other project, and create, update and capture refuse practice picks elsewhere. Tests cover each.
- R-02: practice independence stands in for real independence. Mitigation: the practice checker is admitted only on the practice project, has no vendor family, is not a counted check, and `controlrod check` refuses it.
- R-03: practice code runs something from a job. Mitigation: no process starts; the routines are compiled Go reading fixed input names and writing fixed outputs; a checkout is refused.
- R-04: practice work reaches GitHub. Mitigation: no checkout can bind to practice work, so the pull request step never starts. A test asserts no pull request event.
- R-05: the fake runtime leaks into production. Mitigation: its gate is unchanged and its tests still pass.
- R-06: a newcomer mistakes the practice result for real work. Mitigation: every run's first event says it is a practice run, the card and capture carry a Practice label, the board shows a note, and the author writes `PRACTICE.md` saying it is not real work.
- Trust surface: none touched. `spec/` gains additive fields only, with no major version. Kernel decision code, `policies/`, `tests/redteam/`, `.github/` and `docs/adr/` are unchanged.

## Selected mode

- **Mode:** Standard
- Basis: new, isolated runtime and project kind behind server-side guards; reversible by revert, with no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a machine with no agent account, Try a practice run in Setup or in the first-run guide makes the practice project (signed with the passkey) and one card. The practice agents plan, author and pre-check it with no model and no process; the person releases and accepts with the passkey, and no pull request opens. The API refuses a practice agent on any other project and never gives one any other project's run. The fake runtime stays test-only. Daemon, API and web tests pass, and `pnpm spec` shows no drift.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
