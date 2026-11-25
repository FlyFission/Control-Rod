# Trace: Checkers get a filled-in criterion results file to complete

| Need | Change | Evidence |
| --- | --- | --- |
| A checker gets the exact shape, ids and basis | `criterionResultsTemplate`, `preparedJobInputs` | `prepared-checker-paths.test.ts` "is schema-valid and lists every criterion and mapped check with the released basis" |
| The brief says how to use it | Controlled criterion results section in `work.ts` | preparation test files pass unchanged |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every prepared pre-check receives inputs/criterion-results.template.json, which is schema-valid and lists the exact package, revision, manifest digest and every current criterion and mapped check, and the brief tells the checker to copy and fill it. The server's validation is unchanged. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
