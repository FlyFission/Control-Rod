# Trace: Add and watch cards from a terminal

| Need | Change | Evidence |
| --- | --- | --- |
| Add and list cards without a browser | `CLI_ROUTES`, `isCli`, `cliUser`, `card add`, `cards` | `cli-token.test.ts` "adds and lists cards as the installation's owner"; `cards.test.mjs` |
| Nothing else opens | route allow-list checked in the origin hook and `person()` | `cli-token.test.ts` "opens no other route", "is refused when wrong" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`controlrod card add` adds a card the way quick add does and `controlrod cards` lists cards by column, with no browser or passkey. The command-line token opens only the listed card routes, acts as the installation's first member, and is refused everywhere else. API, scripts tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
