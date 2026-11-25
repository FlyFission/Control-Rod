# Trace: A guided first run on the board

| Need | Code | Test |
| --- | --- | --- |
| Five steps ticked from state | `apps/web/src/features/board/FirstRunGuide.tsx` guideSteps | `first-run-guide.test.tsx` "lists the five steps" |
| One primary button, next step only | FirstRunGuide | `first-run-guide.test.tsx` "offers one primary button", "asks for a change", "opens the waiting card" |
| Closes when done or hidden | guideOpen, useGuideHidden | `first-run-guide.test.tsx` "closes once", "can be hidden"; `board.test.tsx` "guides a first run" |
| Plain empty-board copy | `features/board/BoardView.tsx` | `board.test.tsx` "guides a first run" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new person on the board sees five steps from choosing agents to an accepted change, each ticked from real state, with one primary button for the next step only; the guide closes when a change is accepted or the person hides it. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
