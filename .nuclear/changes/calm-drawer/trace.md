# Trace: A calm card drawer

| Need | Code | Test |
| --- | --- | --- |
| Title, one sentence, one step; the rest folded | `features/board/BoardReviewDrawer.tsx` drawerStep, NextStep, DrawerDetails | `cockpit.test.tsx` "leads with the title...", "opens one detail at a time"; `e2e/live/drawer.spec.ts` |
| Plain errors, raw behind a toggle | `lib/plainError.ts`, NextStep | `plainError.test.ts`; `cockpit.test.tsx` "says a check that could not finish in plain words" |
| Run again from the drawer | NextStep requeue | `cockpit.test.tsx` same; live test presses it and a second check is queued |
| Send back and Reject visibly work | `components/DecisionBar.tsx` useDecisionSigner, ReasonBox | `cockpit.test.tsx` "puts Send back and Reject one click away"; live test: box in viewport, focused, signed return recorded |
| Drawer state resets between cards | CalmBody keyed by package | `board.test.tsx` "resets DecisionBar state..." |
| Switches still work, behind Who and how | DrawerDetails settings row | `board.test.tsx` context profile and workflow suites |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Opening a card shows its title, one plain sentence on where it stands and one primary step, with nothing else above Details. A runner error is said in plain words with the raw text behind a toggle. Send back and Reject open their note box in view and focused, and a signed Send back is recorded. Web tests, typecheck and the live drawer test pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
