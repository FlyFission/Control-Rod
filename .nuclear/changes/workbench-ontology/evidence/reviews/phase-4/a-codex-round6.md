No blocker or major defects found in `040f576..HEAD`.

The change matches both design rules. Admission still requires every mapped check exactly once and retained evidence for executed outcomes. All `criterionResultFlags` callers preserve the gating: required non-pass outcomes and optional fail/inconclusive outcomes block ordinary acceptance. Signed exceptions still cannot waive unfinished mandatory checks.

All 13 tests in `criterion-pass.test.ts` passed. Full API integration tests were not run.

MERGE