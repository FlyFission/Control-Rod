1. **Medium — Issuer-protection refusal gives ineffective recovery advice.** [admin.ts:100](/home/flyfission/worktrees/control-rod-p5records/services/api/src/admin.ts:100) reuses `last-administrator` when removing the last combined administrator-and-policy authority. Its catalog entry at [refusals.ts:74](/home/flyfission/worktrees/control-rod-p5records/services/api/src/refusals.ts:74) tells callers to give another member only administrator authority. Following that advice still leaves the operation refused. The HTTP error handler includes this incorrect advice in `change`. **Fix:** introduce a distinct issuer-protection code with guidance to grant both authorities to another active member, and assert the HTTP response’s recovery advice in the regression test.

No further defects found in the four former helper callers, concurrency under the existing organization lock, lines initialization, appended reasons, initial policy formats, membership wording against `endAccess`, withheld-passkey wording, or ledger row 5.4.

Validation: all 12 focused web tests passed; `git diff --check fa4b895..HEAD` passed. API and browser suites were not rerun.

REVISE