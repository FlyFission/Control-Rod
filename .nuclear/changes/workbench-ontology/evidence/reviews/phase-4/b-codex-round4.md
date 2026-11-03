No blocker or major defects found in `HEAD~1..HEAD`.

- `services/api/src/figures.ts:164` matches the dependency gate in `services/api/src/work.ts:828–830`: author role **and** released package.
- `services/api/test/figures.test.ts:136` verifies that a queued pre-check with an unaccepted dependency waits at the bench. The existing assertion at line 134 preserves the blocked-author case. This proves the reported regression, though it does not independently test each predicate.

Source review only; tests were not run in the read-only environment.

MERGE