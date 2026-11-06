# Plan: a sign-in page drawn from an out-of-date session

1. Write tests for the signed-in, set-up and unrelated-refusal cases ([basis](basis.md)).
2. Reload the session on the four stale-page refusals in `SignIn.tsx`.
3. Remove the fix and record the tests failing; restore it and run the web suite.
4. Guard the recovery read in `SignIn.tsx` with the session generation, and add a delayed-response test for it.
5. Add delayed-response tests for the preparation save, the preparation reload and the criteria save; remove each guard in turn and record the failures (`evidence/mutation.log`).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
