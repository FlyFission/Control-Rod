# Budgets (5.2), Codex round 2 and review threads: adjudication

Reviewed head 84888be. Every finding accepted; fixes in the next commit.

| Finding | Disposition |
|---|---|
| 1 Ceiling sweep overwrites a committed completion | Fixed. The ceiling sweep selects `for update skip locked`, so a run being completed or heartbeating is passed by and rechecked next sweep, and writes only the stop fields (`body || stop`). Test: a run held by another transaction is not stopped until that transaction commits. |
| 2 Reservation does not bound the accounting interval | Fixed. A reserved run's measured interval is bounded by its reservation: the daemon enforces its ceiling, so a finish recorded later (a completion accepted on recovery after an outage) is controller delay and settles at the reservation. Test: a finish two hours after start settles at exactly the reservation. Stated limit: a run claimed with no reported ceiling (track and alert only) has no deadline. |
| 3 Concurrent sweeps duplicate usage | Fixed at the root twice over: the sweep takes the budget lock first (same order as claims), `settleEnded` takes it before selecting, and migration 017 adds a unique index on (run, source). Tests: two racing settlements make one record; a direct duplicate insert is refused by the index. |
| 4 Unreserved minutes read as zero | Fixed. Minute use is the measured time of every run in scope, plus open and settled-in-full reservations for runs nothing measured, with no double counting. Test: a track budget with an unreserved run counts its measured minutes. |
| 5 Unreconciled runs starve settlement | Fixed. Eligibility is in the query before the limit. Test: a batch of one passes the unknown run and settles the next. |
| 6 Over-limit partial totals shown as exact | Fixed. Lens, card and Usage say "at least" from `unreported_runs`, whatever the state. Test: an over-limit token budget with unreported runs. |
| 7 Completion records overclaim | Accepted. Ledger row 5.2 now reads partial, naming the turn ceiling; the acceptance wording matches what the code now does. |
| 8 Presenting cause_key carries the budget id | Fixed. A budget hold groups under `hold:budget` while presenting, on every viewer path (the key is built once for all paths). |
| Thread: suspended budgets drive figures | Fixed. Figures use active budgets only; Usage still lists suspended ones. Test added. |
| Thread: crossing once per window regardless of state | Declined, by design: near and over are two different alerts (spec 26 alerts at the near line and at the limit), so each is recorded once per window; a budget that goes near then over alerts twice, once each. |
| Thread: digest spend line crosses organizations | Already fixed in 84888be (digest takes the caller's organization; usage and crossings scoped). |
