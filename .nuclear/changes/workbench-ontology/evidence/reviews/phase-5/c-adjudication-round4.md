# Budgets (5.2), Codex round 4 and review threads: adjudication

Reviewed 6e41a51..58a8fd8. Both findings accepted.

| Finding | Disposition |
|---|---|
| Codex: a complete report discarded at exactly the event limit | Fixed. Loss is a `dropped` event or any event past `MAX_RUN_EVENTS` (`seq >`), since a run that ends at the limit kept every event. Test: a run with exactly the limit keeps its report; one past it records none. |
| Thread: Claude's step usage added to its cumulative result | Fixed. The daemon marks the result's usage `cumulative` (NormalizedEvent gains optional `cumulative`); the control plane takes the last cumulative event as the run's total and adds no step to it, and sums steps only where no cumulative event exists (Codex `turn.completed`). The case story says "In all, used" for a cumulative event and no longer shows a missing count as zero. Tests: Go `TestClaudeResultUsageIsCumulative`; API "takes a runtime's cumulative usage as the run's total". |

## Round 5

Codex round 5 on 58a8fd8..20ee77d: MERGE, no defects. One later review thread, accepted: a hard cap set while scoped runs were already in flight did not count their reservations, which belonged to other budgets. Fixed: a minute budget counts each unmeasured run in its scope once, at its open (or settled in full) reservation, whichever budget holds it. Test: a cap set after a run was dispatched counts that run and holds the next. The test helper that stops earlier runs now records their finish and settles them, as a real stop and sweep would, since the new rule correctly charges a stopped run's reservation in full until it is settled.

## Round 6

Codex round 6 on 20ee77d..cap-in-flight fix: MERGE, no defects. One later thread, accepted: cap admission compared floating point sums, so a reservation exactly filling a cap could be held. Fixed: admission compares whole hundredths of a minute (the ledger's precision), with the limit floored to hundredths. Test: three reservations exactly filling a cap are all admitted.

## Round 7

One later thread, accepted: runs dispatched before any minute budget existed had no reservation, so a cap created afterwards could not count them. Fixed: every run records `reserve_minutes` (its ceiling plus margins, rounded up) whenever the daemon reported a ceiling, budget or not; a minute budget counts an unreserved, unmeasured run in its scope at that size; a running run with neither a reservation nor a recorded size makes a hard cap in its scope hold further dispatch, with a teaching reason. Test: a run dispatched with no budget counts once a budget exists, and a run of unknown size in flight holds the next dispatch under a cap.

Codex round 7 on that change: REVISE, two findings, both accepted. (1) The unsized hold ended when the run finished or was lost, before anything accounted for it: it now lasts until the run is measured or reconciled. (2) An unreserved lost run's charge fell out of the window by its loss time: it now counts however old while its outcome is unknown, and once reconciled counts in the window it was reconciled in, matching real reservations. Test: an unreserved run lost two days ago still counts in a one day window, an unsized lost run holds a cap until reconciled, and reconciling releases it.
