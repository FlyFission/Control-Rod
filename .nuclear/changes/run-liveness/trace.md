# Trace: run liveness after the agent is done

| Requirement | Code | Tests (`daemon/internal/runner/settle_test.go`) | Disposition |
|---|---|---|---|
| RL-01 A runtime's end-of-turn report ends the run after `SettleAfter`; it completes on what was reported. | `events.go` `TurnEnd`; `daemon.go` settle watcher, `errSettled`, completion mapping | `TestARunThatReportedItsResultButDidNotExitEndsOnItsResult`, `TestAFailedResultThatDidNotExitEndsFailed`, `TestACodexTurnThatCompletedButDidNotExitEndsOnItsResult`, `TestARunThatExitsAfterItsResultIsUntouched`, `TestTurnEndReadsOnlyTheRuntimesFinalReport` | implemented and tested |
| RL-02 No background work outlives a run. | `runtime.go` `ClaudeEnv`, `withEnv`; existing containment | `TestClaudeRunsCannotStartBackgroundTasks`, `TestBackgroundWorkLeftByAFinishedRunIsEnded` | implemented and tested |
| RL-03 Failing deliveries back off; nothing leaves custody for failing. | `retry.go`; `daemon.go` `drainOutbox`, `deliver`, `sweepOrphans` | `TestRetryGateDoublesTheWaitUpToItsLimitAndForgetsOnSuccess`, `TestACompletionTheControlPlaneKeepsFailingIsRetriedLessOftenAndKept`; existing refusal and retry tests | implemented and tested |
| RL-04 Agents do not inherit the launcher's package-manager environment. | `runtime.go` `ChildEnv`, `launcherVar`, `launcherPath` | `TestChildEnvDropsWhatThePackageManagerLauncherSet`; existing `TestTokenFromFileAndChildEnv` | implemented and tested |
| Storage cap on the raw log | none | none | open: owner decision (risk R-04) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RL-01 to RL-04 are implemented with failed-first regression evidence and a green race suite; the open storage item and real-runtime gap are stated for the owner. No fake-runtime result is presented as real-runtime proof.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
