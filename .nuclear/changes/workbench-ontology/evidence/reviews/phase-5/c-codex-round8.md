- **P1 — Completed, unmeasured runs can still lose their fallback charge.** [budgets.ts:165–166](/home/flyfission/worktrees/control-rod-p5budgets/services/api/src/budgets.ts:165): A normally completed, unreserved run has neither `running` status nor `outcome_unknown`, so its charge still expires by `finished_at` before measurement. After a delayed sweep or settlement backlog, a hard cap can admit work against understated usage. This also contradicts the ledger’s new “stays counted until it is measured” wording. **Fix:** count every eligible unmeasured, unreconciled run regardless of age; apply the rolling window only after reconciliation. Add coverage for an old completed run before measurement and verify measurement replaces its fallback charge exactly once.

The unsized hold now persists until measurement or reconciliation and clears for measured runs. No additional double-counting defect found.

Static review of `HEAD~1..HEAD`; database tests were not run in the read-only environment.

REVISE