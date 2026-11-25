# Trace: Plain names on the board, one way to add work, a shorter Setup

| Need | Code | Test |
| --- | --- | --- |
| Plain column names | `apps/web/src/lib/mode.ts`, `features/board/BoardListView.tsx` | `board.test.tsx` column headings |
| One way to add work | `features/board/BoardView.tsx`, `QuickAdd.tsx` | `quick-add.test.tsx`, `board.test.tsx`, live `flows.ts` |
| Shorter Setup | `components/AgentList.tsx` | `setup.test.tsx` "names the agents it cannot run yet in one line" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The Software board names its columns in plain words; the board offers one New change button and a secondary Quick add; Setup lists the agents Control Rod can run, found or not, with their install commands visible, and names the ones coming later in one line. Web tests, typecheck and the live lifecycle pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
