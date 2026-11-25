# Ship: Add and watch cards from a terminal

Release decision: **pending owner decision.**

- Rollback: revert the merge; delete `~/.controlrod/cli.token`. No migration.
- Monitoring after merge: `controlrod card add` on a real install prints "Added C-..." and the card appears on the board.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`controlrod card add` adds a card the way quick add does and `controlrod cards` lists cards by column, with no browser or passkey. The command-line token opens only the listed card routes, acts as the installation's first member, and is refused everywhere else. API, scripts tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
