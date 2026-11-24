# Trace: Fewer steps on a new card

| Need | Code | Test |
| --- | --- | --- |
| One-step add in the project lane | `features/board/QuickAdd.tsx`, `components/LanePicker.tsx` defaultLaneFor | `quick-add.test.tsx` "standard lane", "project's default data lane" |
| Set the default once | `features/board/BoardView.tsx` project bar | `board.test.tsx` "data lane" case |
| Optional per-card raise | `features/board/CaptureDrawer.tsx` | `quick-add.test.tsx` "CaptureDrawer data lane" |
| No false Needs you | `lib/next.ts` ESCAPE_HATCHES | `next.test.ts`, `board.test.tsx` Safety card |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Adding a card is one step: it takes the project's default data lane with no Classify step; the project bar sets that default; a card's drawer says what its lane means and can raise it; a card in work no longer reads "Needs you: Return for revision" when nothing is asked; web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification.
