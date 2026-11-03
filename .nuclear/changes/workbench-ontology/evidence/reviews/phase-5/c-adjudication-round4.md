# Budgets (5.2), Codex round 4 and review threads: adjudication

Reviewed 6e41a51..58a8fd8. Both findings accepted.

| Finding | Disposition |
|---|---|
| Codex: a complete report discarded at exactly the event limit | Fixed. Loss is a `dropped` event or any event past `MAX_RUN_EVENTS` (`seq >`), since a run that ends at the limit kept every event. Test: a run with exactly the limit keeps its report; one past it records none. |
| Thread: Claude's step usage added to its cumulative result | Fixed. The daemon marks the result's usage `cumulative` (NormalizedEvent gains optional `cumulative`); the control plane takes the last cumulative event as the run's total and adds no step to it, and sums steps only where no cumulative event exists (Codex `turn.completed`). The case story says "In all, used" for a cumulative event and no longer shows a missing count as zero. Tests: Go `TestClaudeResultUsageIsCumulative`; API "takes a runtime's cumulative usage as the run's total". |
