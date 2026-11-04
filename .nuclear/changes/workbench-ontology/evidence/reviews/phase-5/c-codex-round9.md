- **P1 — Settlement can still drop an unmeasured run’s charge.** [budgets.ts:280–290](/home/flyfission/worktrees/control-rod-p5budgets/services/api/src/budgets.ts:280): Measurement selects a batch by `created_at, id`, while reservation settlement independently selects by `run_id`. During a backlog, a completed run can therefore become `settled` before receiving measured usage. If its finish is outside the rolling window, `budgetUse` excludes its full charge at line 160, understating usage and potentially admitting work beyond a hard cap. **Fix:** keep started, known-outcome runs’ reservations open until measured usage exists; allow full settlement without measurement only for reconciled unknown outcomes. Add a regression with `batch = 1`, opposing creation/ID ordering, and an old completed reserved run.

The last commit fixes the reported unreserved-work expiry and reconciliation dating. Its test and ledger wording match those changes, but the whole-PR review found the blocker above.

API and web TypeScript checks and `git diff --check` passed. Database tests were not run in this read-only environment. No additional merge-blocking findings.

REVISE