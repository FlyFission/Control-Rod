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

## Round 2 (supervision-codex-round2.md): closed S1-06, S1-09; eleven findings, all accepted

| ID | Disposition | Fix and evidence |
|---|---|---|
| S1-10 | Fixed | The snapshot goes to fresh custody under the daemon home (`custody/snapshot-*`), outside the run's write authority; `Snapshot` refuses an existing destination and any symlink, and the structured attachments are read from the snapshot too. Test: `TestSnapshotTakesOnlyAFreshDestinationAndRefusesSymlinks`. |
| S1-11 | Fixed | Freezing returns an error unless the kernel confirms the cgroup frozen (or, in the fallback, every member stopped); an unconfirmed freeze kills first and snapshots after. `populated` counts anything but a missing cgroup or `populated 0` as populated. Test: `TestUnreadableCgroupStateCountsAsAlive`. |
| S1-12 | Fixed | `StopGracefully` results propagate: `Execute` returns `ErrUncontained`, the daemon then keeps the receipt and sends no completion, so the lease lapses into an unknown outcome and the orphan sweep keeps trying. Test: `TestExecuteReportsUncontainedWhenTheUnitWillNotEmpty`. |
| S1-13 | Fixed | Nothing reaps the leader before the receipt step; on Linux its exit is observed with `waitid(WNOWAIT)` and it is reaped only after the unit is handled, so its id and group stay the run's. The fallback signals a group only while the leader matches or is held unreaped by this daemon. Test: `TestFallbackSignalsNothingOnAStaleReceiptEvenWhileItsGroupNumberExists`. |
| S1-14 | Fixed | Process group evidence is recorded (`run.evidence`) but never settles an unknown outcome: only a cgroup proves the whole run gone. Server test "records process group evidence but leaves the outcome unknown for a person". |
| S1-15 | Fixed | One daemon per home (`LockHome`, an exclusive lock); scope names carry the home's namespace and a sweep touches only its own. Tests: `TestOneDaemonPerHome`, and the orphan test leaves another namespace's scope running. |
| S1-16 | Fixed | A receipt that cannot be written returns the located unit with the error and the whole unit is stopped. Test: `TestAReceiptWriteFailureEndsTheWholeUnitIncludingEscapedChildren` (setsid child). |
| S1-17 | Fixed | Directory sync failures are returned by both stores (`syncDir`); a failed outbox write keeps the receipt. |
| S1-18 | Fixed | Heartbeats and completions that reach a lapsed lease consider the outage too, and an outage once seen lasts a lease so runs returning one by one all count. Test: "honors heartbeats that return from an outage before the sweep sees it". |
| S1-19 | Fixed | Lease bookkeeping in memory changes only after commit (`afterCommit`, run by the transaction after commit and dropped on rollback). |
| S1-20 | Fixed | Renewals without a heartbeat are counted on the run (`grace_renewals`, at most one until a heartbeat proves it alive), so restarts and sleeps cannot keep a dead run running. Test: "grants no second renewal without a heartbeat, even to a controller that never saw the run". |
