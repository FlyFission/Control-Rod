One remaining defect in the whole PR:

- **P2 — Recovery advice is discarded** at [CommandForm.tsx:112](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/CommandForm.tsx:112). Rendering only `run.error.message` omits `ApiError.change`. For example, a refused qualification replacement loses the instruction to grant another active member both administrator and policy authority. **Fix:** render the existing `explain()` helper and add a test asserting that the server’s recovery advice appears.

The seven latest-commit fixes look correct: bootstrap enforcement, current-policy hardware eligibility, delegation projection and contract, policy reset, overlay replacement/clearing, license arity validation, and hard-cap checks.

Validation: 15 focused web tests passed; web and API type checks passed; both diffs passed whitespace checks. API integration and browser suites were not rerun.

REVISE