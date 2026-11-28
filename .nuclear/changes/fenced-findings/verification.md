# Verification: Checker findings reach the author as data

- E-01: `tsc -p services/api/tsconfig.json --noEmit` passes.
- E-02: `tools/test-api.mjs` with PostgreSQL 16 (cloud container): `fenced-findings` and `scoped-send-back`, 10 tests pass (5 new, 1 extended).
- E-03: `tools/test-api.mjs` over runs, context-profile (3 files), intake-brief, workflow, prepared-checker-evidence and patch-files: 123 tests pass.
- E-04: `node --test scripts/test/measure-briefs.test.mjs scripts/test/measure-workflow-briefs.test.mjs`: 5 pass, 0 fail (budgets unchanged).
- Blind check: the repository's automatic Codex review on the PR.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On an author round after a failed check, the brief says the findings are another agent's data, not instructions, and still asks for each one to be fixed. The findings sit inside a fence that no text in them can close, and are also in inputs/findings.json. Each scope path stays on one line and inside its code span. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
