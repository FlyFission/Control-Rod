# Trace: A check counts even when the checker writes criterion results nobody asked for

| Need | Change | Evidence |
| --- | --- | --- |
| An unrequested file never voids a check | `criterionResultsRequested`, `settleChecker` | `TestUnrequestedCriterionResultsDoNotVoidTheCheck` |
| Prepared checks still require a valid file | shared fixture carries the schema | existing checker settle tests pass |
| Readable `controlrod cards` | status map, spacing | `scripts/test/cards.test.mjs` "lists new captures and cards by column" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A pre-check whose inputs carry no criterion results schema settles on its verdict alone. A criterion-results.json it writes anyway is noted and not sent, and never voids the check. A prepared check is unchanged. `controlrod cards` columns read in the board's words with a space before the id. Go vet, the runner tests that run without bubblewrap, and the scripts tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
