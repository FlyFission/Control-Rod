No merge-blocking defects found at `dbb9d7ac2034db92e92f6ca9ec322fdcf6497661`.

The latest commit fixes the settlement-ordering blocker in [budgets.ts:286](/home/flyfission/worktrees/control-rod-p5budgets/services/api/src/budgets.ts:286). Known-outcome runs retain their reservations until measured; release and reconciled-unknown settlement remain eligible. The [regression test:549](/home/flyfission/worktrees/control-rod-p5budgets/services/api/test/budgets.test.ts:549) covers opposing batch orders and an old finish.

The full `origin/main...HEAD` review found no additional blockers. API and web TypeScript checks and `git diff --check` passed. Database and daemon tests were not executed in this read-only environment.

MERGE