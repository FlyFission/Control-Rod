# Plan: Screens point at the one next step

1. Pure `workStep` in `lib/board.ts`; Today, drawer and Inbox wiring; CSS from existing tokens.
2. Web tests and typecheck; same PR as `focus-writing`; merge on green under the owner's standing yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Today shows "Start here" with the most urgent Inbox item and its one button under the headline, and nothing when nothing waits. The card drawer says "step N of M" after its column word, counting Person verifies only for work that needs it. The Inbox shows five items and folds the rest under "Show N more", dropping none. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): ideas only for the screens, no code. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
