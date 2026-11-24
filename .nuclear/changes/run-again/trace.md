# Trace: A failed run says what happened and offers Run again

| Need | Code | Test |
| --- | --- | --- |
| Plain words for a run that ended without a result | `apps/web/src/lib/next.ts` stalledRun, stalledLine | `lib/next.test.ts` "a run that ended without a result" |
| One button to run it again | `features/board/CardActions.tsx`, `useBoardData.ts` requeueRunId | `move.test.tsx` "Run again on a card..." |
| Unknown outcome goes to the run log first | same, settleRunId | `next.test.ts`, `move.test.tsx` "a run whose outcome is unknown" |
| The error, short | `features/board/Card.tsx` bd-next-detail | `next.test.ts` "keeps a long runner error short" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card whose newest author or pre-check run failed, was stopped or was lost says so in plain words, shows the runner's error, and offers one button: Run again, or Open run log when the outcome is unknown. It no longer reads "Needs you: Return for revision" for a check that never ran. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
