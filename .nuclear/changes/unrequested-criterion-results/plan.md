# Plan: A check counts even when the checker writes criterion results nobody asked for

1. `criterionResultsRequested` in `daemon/internal/runner/checker.go`: true only when inputs/schemas/CriterionResultSubmission.json is present. The server stages it with a prepared check, and only then.
2. In `settleChecker`, when it is not requested, a non-empty criterion-results.json records a policy event and is not sent. Otherwise the existing validation applies.
3. Test: the shared checker fixture carries the schema (prepared). A new test removes it and expects the check to count, with no criterion results sent.
4. `scripts/lib/cards.mjs`: map PackageStatus to the board's words, and always put two spaces before the id.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A pre-check whose inputs carry no criterion results schema settles on its verdict alone. A criterion-results.json it writes anyway is noted and not sent, and never voids the check. A prepared check is unchanged. `controlrod cards` columns read in the board's words with a space before the id. Go vet, the runner tests that run without bubblewrap, and the scripts tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
