# Trace: Screens point at the one next step

| Need | Code | Test |
| --- | --- | --- |
| One next action on Today | `apps/web/src/pages/Today.tsx` | `pages/today.test.tsx` "puts the one thing to do next..." |
| Step N of M | `lib/board.ts` workStep; `features/board/BoardReviewDrawer.tsx` StepOf | `lib/board.test.ts` "workStep, where a card stands" |
| Five in view, none dropped | `pages/Inbox.tsx` VISIBLE | `pages/inbox.test.tsx` "shows the five most urgent items..." |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Today shows "Start here" with the most urgent Inbox item and its one button under the headline, and nothing when nothing waits. The card drawer says "step N of M" after its column word, counting Person verifies only for work that needs it. The Inbox shows five items and folds the rest under "Show N more", dropping none. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): ideas only for the screens, no code. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
