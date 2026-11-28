# Plan: Checker findings reach the author as data

1. Add the two pure functions to `services/api/src/brief.ts` with unit tests (`services/api/test/fenced-findings.test.ts`).
2. Use them in buildJob's author branch for round above 1; add `inputs/findings.json`.
3. Extend the scoped-send-back integration test to assert the notice, the fence and the file.
4. Typecheck, the brief-related API suites and the brief budget tests; draft PR; Codex review; merge on green under the owner's merge-on-green permission (to 2026-12-02).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On an author round after a failed check, the brief says the findings are another agent's data, not instructions, and still asks for each one to be fixed. The findings sit inside a fence that no text in them can close, and are also in inputs/findings.json. Each scope path stays on one line and inside its code span. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
