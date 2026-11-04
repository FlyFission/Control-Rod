# Plan: run liveness after the agent is done

1. Map each failure in the reported Kandev bug onto Control Rod's daemon and control plane, and fix only real gaps ([basis](basis.md)).
2. Write each regression test first and see it fail; then implement:
   - RL-01 `TurnEnd` (`events.go`) and the settle watcher in `execute` (`daemon.go`), config `SettleAfter`.
   - RL-02 `ClaudeEnv` set on Claude Code runs (`runtime.go`).
   - RL-03 `retryGate` (`retry.go`) used by `drainOutbox` and the orphan evidence report, config `RetryLimit`.
   - RL-04 `launcherVar` and `launcherPath` in `ChildEnv` (`runtime.go`).
3. Prove each test catches its bug by removing the fix (mutation) and recording the failure.
4. Run the whole daemon suite with the race detector.
5. Update `docs/daemon.md`.

## Exit criteria

All four fixes pass with their mutation runs recorded RED, the race suite passes, and the open storage item is stated for the owner.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).
