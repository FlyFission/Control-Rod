- **P2 — Complete token reports discarded at the event limit.** [budgets.ts:267](/home/flyfission/worktrees/control-rod-p5budgets/services/api/src/budgets.ts:267) treats `seq >= MAX_RUN_EVENTS` as evidence of loss. Ingestion retains events through that sequence; overflow starts afterward. A run ending exactly at the limit therefore loses its complete token report and becomes “unreported,” potentially suppressing a crossing alert. A source probe reproduced this with no lost events. **Fix:** use `seq > MAX_RUN_EVENTS`, retaining the explicit `dropped` check. Test both the exact limit and overflow.

No other introduced defects found in the requested scope, including nullable-field consumers, circular-import initialization, suspended crossings, and organization scoping.

API/web typechecks and whitespace checks passed. PostgreSQL tests were blocked by the read-only filesystem; Go was unavailable.

REVISE