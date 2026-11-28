# Trace: Runs that stall or fail silently now fail loudly, with the reason

| Need | Code | Test |
| --- | --- | --- |
| API-3: one broken queued run fails with its reason; the claim hands out the next | `work.ts` claim, claimOnce, failBadQueuedRun | `runs-fail-loudly.test.ts` "fails with its reason, and the claim hands out the next run" |
| API-20: claim bookkeeping never fails the claim | `app.ts` claim route `keep` | `runs-fail-loudly.test.ts` "never fails the claim when what the daemon reports..." |
| DMN-4: an outdated daemon is refused with what to do | `work.ts` claimProtocolRefusal, `client.go` OutdatedError | `runs-fail-loudly.test.ts` claim protocol; `claim-protocol.test.ts`; `claimdecode_test.go` |
| DMN-4: an undecodable job fails its run at once | `client.go` UndecodableJobError, `daemon.go` undecodableCompletion | `claimdecode_test.go` |
| DMN-4: a Job change raises the protocol | `claim-protocol.test.ts` digest pin | same |
| DMN-13: a failed turn names the vendor's reason and what to do | `turnerror.go`, `daemon.go` turnErrorFor | `turnerror_test.go`, `turnerror_unix_test.go` |
| DMN-7: an over-long line is left out and reading goes on | `runtime.go` pumpLines | `pumplines_test.go` |
| DMN-8: a run waiting for the agent's lock heartbeats | `daemon.go` heartbeatWhile | `waitheartbeat_test.go` |
| DMN-11: shutdown bounds a completion upload | `daemon.go` completionContext, drainOutbox | `report_test.go`; `custody_test.go` outbox tests |
| DMN-12: the log says when the outbox could not keep it | `daemon.go` report | `report_test.go` |
| DMN-10/#178: group members stopped by pidfd; backoff; processes-remain | `contain_linux.go` signalOrphan, `daemon.go` sweepOrphans, `work.ts` runEvidence | `receipt_test.go`, `sweep_uncontained_test.go`, `supervision.test.ts` |
| DMN-20: SIGHUP stops; a second signal exits | `cmd/controlrod/main.go` shutdownContext | `cmd/controlrod/shutdown_test.go` |
| API-10: NUL never fails a heartbeat; the log is bounded | `work.ts` withoutNul, runLog | `runs-fail-loudly.test.ts` run log |
| API-15: a bad intake card file is named | `work.ts` finishIntake | `runs-fail-loudly.test.ts` "makes no card and says which file..." |
| API-5: every pull request attempt ends with an outcome | `work.ts` publishAccepted, publishClaimed, pullRequestOf | `signing-policy.test.ts` "never leaves the pull request at opening..." |
| API-11: a worktree a run uses is not removed | `repos.ts` removeWorktreeSafely, `work.ts` checkoutsHeld | `repos.test.ts` "refuses to remove a worktree while a run is working in it"; `runs-fail-loudly.test.ts` checkouts |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that cannot start, cannot be read, waits, or fails says why in plain words, and none of them stops other work: one broken queued run fails with its reason while the claim hands out the next; a daemon that cannot read a job fails that run at once and an outdated daemon is told to restart; a failed turn names the vendor's reason (usage limit, sign-in, refusal, context window) with what to do; a pull request attempt always ends with an outcome; leftover processes are stopped through the whole group or reported; a worktree a run is using is not removed; and shutdown ends in seconds, at once on a second Ctrl-C. API typecheck, the touched API tests, and the daemon's vet and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
