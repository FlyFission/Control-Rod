# Phase 2 part 1 review adjudication (PR #24, supervision)

Reviewer: Codex CLI, static read only review against `origin/buildout/controlled-preparation-20261023`.

## Round 1 (supervision-codex-round1.md): 9 findings, all accepted

| ID | Disposition | Fix and evidence |
|---|---|---|
| S1-01 | Fixed by redesign | Permission bits are gone. A stop freezes the run's whole cgroup (`cgroup.freeze`), snapshots `out/` while frozen, and that snapshot is the run's only output; nothing written after write authority ended counts, through any descriptor or chmod. Test: `TestStopFreezesTheRunAndOnlyTheSnapshotCounts` writes through an open descriptor after the stop. |
| S1-02 | Fixed by redesign | Each run gets its own systemd user scope (`contain.go`, `contain_linux.go`); the run is over only when the cgroup reports empty. Processes the leader leaves behind are ended before the run completes. Tests: `TestCgroupStopEndsChildrenThatEscapeTheGroupAndIgnoreSignals` (setsid, ignores HUP and TERM, drops the pipes) and `TestExecuteEndsProcessesTheLeaderLeftBehind`. |
| S1-03 | Fixed | Kills go through `cgroup.kill` (atomic, no ids); single signals use a pidfd that pins the process and is checked against the cgroup before signalling. The leader is reaped by the daemon itself, so no numeric fallback runs after reaping. The process group fallback (no user systemd) keeps a documented limit: a group id reused after the group emptied. |
| S1-04 | Fixed | During an apparent outage each lapsed run gets one recovery lease; a run that lapses again after it is a fact, and becomes lost with an unknown outcome that a person can reconcile. Test extended in "treats most active runs looking dead in one pass as an outage". |
| S1-05 | Fixed | Heartbeats and completions honor the same grace as the sweep (`leaseGrace`): a lease this controller never issued, or a lapse while the controller was absent. Test: "honors a heartbeat that reaches a lease from before a restart ahead of the first sweep". |
| S1-06 | Fixed | A late completion that reaches a still running, lapsed run retires it and settles the hold in the same transaction. Test: "retires and settles a run whose late completion beats the sweep". |
| S1-07 | Fixed | The receipt stays until the completion is synced into the outbox; the run stays active (skipped by the orphan sweep) until then; a sweep that finds a completion waiting in the outbox only retires the receipt. Outbox writes are now synced. |
| S1-08 | Fixed | A receipt that cannot be written durably fails the run closed: it is killed at once (`TestExecuteFailsClosedWhenTheRunCannotBeOwned`). Receipt files and their directory are synced. The window between spawn and receipt is closed in cgroup mode by deterministic scope names: the sweep ends `controlrod-run-*` scopes that have no receipt. |
| S1-09 | Fixed | A zombie leader is not running (`processStart` reads the state), and the process group check reads process states on Linux because a zombie still counts to kill(2). Test: `TestAZombieDoesNotCountAsRunning`. |
