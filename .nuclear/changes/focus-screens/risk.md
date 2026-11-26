# Risk: Screens point at the one next step

- Folding Inbox items past five hides them one press deeper. The count says how many, the list is still most urgent first, and Today already caps at five.
- "Start here" repeats the first Needs you row; it is the same link.
- Web only; no API, spec or trust-surface change.

## Selected mode

- **Mode:** Standard
- Basis: web layout, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Today shows "Start here" with the most urgent Inbox item and its one button under the headline, and nothing when nothing waits. The card drawer says "step N of M" after its column word, counting Person verifies only for work that needs it. The Inbox shows five items and folds the rest under "Show N more", dropping none. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): ideas only for the screens, no code. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
