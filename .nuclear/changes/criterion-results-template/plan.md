# Plan: Checkers get a filled-in criterion results file to complete

1. `criterionResultsTemplate` in `services/api/src/preparation/lifecycle.ts` builds a schema-valid submission from the run and the released snapshot, every outcome "open".
2. `preparedJobInputs` adds it as `inputs/criterion-results.template.json` for pre-check runs.
3. The brief in `work.ts` says to copy that file to the output path, keep its ids and field names, and fill outcomes, finding_refs and evidence_refs.
4. Unit test: the template validates and carries every criterion and check.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every prepared pre-check receives inputs/criterion-results.template.json, which is schema-valid and lists the exact package, revision, manifest digest and every current criterion and mapped check, and the brief tells the checker to copy and fill it. The server's validation is unchanged. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
