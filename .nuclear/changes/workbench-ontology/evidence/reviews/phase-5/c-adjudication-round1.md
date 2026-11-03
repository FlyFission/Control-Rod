# PR 5C (#38): adjudication of Codex round 1

Codex returned REVISE with twelve findings. All are accepted; the accounting was reworked.

| # | Finding | Disposition |
|---|---|---|
| P1 | Unresolved reservations disappeared at window boundaries | Fixed: open reservations count however old; only settled use falls out of the rolling window (attributed to its settlement's usage record, or to the reservation when nothing measured it) |
| P1 | The reservation was not a conservative maximum | Fixed: one accounting interval (claim to the control plane's recorded finish). The daemon reports its run ceiling (timeout plus the graceful stop ladder, rounded up to a whole second, `run_ceiling_seconds`); the reservation adds one heartbeat and one lease and rounds up to the hundredth of a minute; the run records its ceiling and the sweep asks it to stop on the graceful path once it has run that long (specification 26's "stopped by the graceful stop path", which was missing). A completion arriving after the lease makes the run lost, charged in full: stated as a limit |
| P1 | Usage collection required a minute budget | Fixed: every finished run with a known outcome gets a measured usage record and its reported tokens, budget or not; reservations settle separately and idempotently |
| P1 | Presenting exposed spend through hold reasons | Fixed: a budget hold's words are redacted while presenting on every path (the run's own hold, and Inbox items, now tagged with `budget_id` as SCRAM ones carry `scram_id`); test asserts the whole presenting response carries neither the hold wording nor the budget id |
| P1 | Reconciliation became "measured" usage | Fixed: a lost run is never measured; once reconciled its reservations settle charged in full, and the test asserts no measured record and use at least the full reservation |
| P2 | Lock order could deadlock claims | Fixed: every claim takes the budget lock at its start, before any event is written; the reservation is also taken before the package moves (a held run no longer leaves its package claimed). Test: two racing claims under a cap with room for one dispatch exactly one |
| P2 | Missing token telemetry became zero and within | Fixed: token use is the sum of complete reports among measured runs, with the count of runs that reported none; with none reported it is not reported, and with some missing it is "partial", shown as "at least"; a token field some usage events lack is left out, not summed as zero |
| P2 | Month and year windows overflowed | Fixed: calendar stepping held at the shorter month's last day; tests for month ends, leap years and weeks |
| P2 | The digest's spend line crossed organizations | Fixed: the digest takes the caller's organization (now required) and scopes usage records and crossing budgets to it |
| P2 | A budget held figure could say no budget applies | Fixed: a run a budget holds names that budget on its figure; tested |
| P2 | The near threshold had no controlled basis | Fixed: it is the approved policy's `budget_near_percent` (a new policy setting, signed by policy authority); without it nothing is called near and no near crossing is recorded. Test proposes and approves the policy |
| P2 | Acceptance and ledger overclaimed | Fixed: the ledger states the limits (no turn ceiling; late completions charged in full) and the acceptance row says the near line is the organization's to set |
