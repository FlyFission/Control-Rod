# Plan: Runs that stall or fail silently now fail loudly, with the reason

1. API claim: per-run attempt with `BadQueuedRun`, `failBadQueuedRun` under the new catalog command `run.claim-failed`, at most 10 bad runs per claim; bookkeeping kept apart (`keep`).
2. Claim protocol in `client.go`, `work.ts` and `spec/api.tsp`; `pnpm spec`; undecodable jobs reported by the daemon; digest-pinning test.
3. Daemon: `turnerror.go`, `pumpLines`, `heartbeatWhile`, `report` with `completionContext`, `signalOrphan`, sweep backoff with `processes-remain`, `shutdownContext` in main.go.
4. API: `withoutNul` and the log bound; intake JSON check; pull request outcome on throw, timeout and lapsed claim; `checkoutsHeld` and the worktree refusal.
5. Tests for each (daemon Go tests; API tests on PostgreSQL), typecheck, gates, change-record validation.
6. Branch `claude/runs-fail-loudly` handed to the owner for review. The merge is the owner's decision.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that cannot start, cannot be read, waits, or fails says why in plain words, and none of them stops other work: one broken queued run fails with its reason while the claim hands out the next; a daemon that cannot read a job fails that run at once and an outdated daemon is told to restart; a failed turn names the vendor's reason (usage limit, sign-in, refusal, context window) with what to do; a pull request attempt always ends with an outcome; leftover processes are stopped through the whole group or reported; a worktree a run is using is not removed; and shutdown ends in seconds, at once on a second Ctrl-C. API typecheck, the touched API tests, and the daemon's vet and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
