# Basis: Checkers get a filled-in criterion results file to complete

On 2026-11-25 a Grok pre-check of a sandbox card passed all four criteria, but its criterion-results.json used its own shape (criterion text, evidence) instead of CriterionResultSubmission, so the daemon refused it and the check could not count. The brief only pointed at the JSON Schema file, and the checker did not find or follow it. Any agent can make the same mistake.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every prepared pre-check receives inputs/criterion-results.template.json, which is schema-valid and lists the exact package, revision, manifest digest and every current criterion and mapped check, and the brief tells the checker to copy and fill it. The server's validation is unchanged. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
