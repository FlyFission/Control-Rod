1. **P3 — Tied-timestamp regression coverage is still missing.** [runtimes.test.ts:136](/home/flyfission/worktrees/control-rod-phase0/services/api/test/runtimes.test.ts:136) signs the displayed target successfully, but never creates competing retired artifacts with equal `recorded_at` values. **Fix:** seed that history, assert the ID tie-break winner, then sign the displayed target and verify restoration. This is nonblocking because both production paths now share deterministic selection.

The three round 2 findings are otherwise addressed:

- [runtimes.ts:116](/home/flyfission/worktrees/control-rod-phase0/services/api/src/runtimes.ts:116) validates every role before writes; tests cover omitted, null, empty, and unsupported roles, checking unchanged pins.
- [roster.ts:43](/home/flyfission/worktrees/control-rod-phase0/services/api/src/roster.ts:43) uses `rollbackTarget`, whose ordering includes the ID tie-breaker.
- [runtimes.test.ts:174](/home/flyfission/worktrees/control-rod-phase0/services/api/test/runtimes.test.ts:174) now asserts HTTP 200 and local records, excludes a foreign policy, and disables only ownership triggers.

No new major or blocking defects found. API typecheck and `git diff --check` passed. Runtime tests could not execute: PostgreSQL fixture setup failed with `EROFS`; all eight tests were skipped.

MERGE