# Risk: Runs that stall or fail silently now fail loudly, with the reason

- R-01: a run failed by the claim that could have run. Only an error thrown while building that one run's job does it; connection, lock, serialization and resource faults (SQLSTATE 08, 40, 53, 55P03, 57, 58, XX) still fail the whole claim, so a passing database problem never fails runs. At most 10 runs per claim.
- R-02: a daemon refused that could have worked. An absent `claim_protocol` reads as 1, so today's daemons work unchanged. The refusal names the fix (restart Control Rod).
- R-03: a wrong reason on a failed turn. The reason only explains a failure the daemon already found; it never decides one. Arbitrary stderr is never used, only a line that matches a known reason, and only after an error exit.
- R-04: a process outside the run is signalled. Members are signalled only through their own pidfd, after their group and start time are checked again, and only while the leader is proven alive in the group, so the group number cannot have been reused. With no leader, nothing is signalled. This changes one test's expectation on Linux, deliberately (`TestAnOrphanGroupIsNeverSignalledByNumber`); a new test keeps the leaderless rule.
- R-05: log lines dropped. Only the oldest lines beyond 4,999, with a marker; run events are all kept.
- R-06: an intake with one bad card file makes no cards. The person runs the request again; nothing half-made is left.
- R-07: a pull request marked not opened that later opens. A late success is still recorded, so the card shows the pull request.
- R-08: a worktree removal refused after its run ended. The check reads queued and running runs only.
- Trust surface: `spec/api.tsp` gains one optional field and one enum value, not a major version. No `.github/`, `kernel/`, `policies/`, `tests/redteam/` or `docs/adr/` file changes.

## Selected mode

- **Mode:** Standard
- Basis: failure paths that now report a reason; reversible by revert; no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that cannot start, cannot be read, waits, or fails says why in plain words, and none of them stops other work: one broken queued run fails with its reason while the claim hands out the next; a daemon that cannot read a job fails that run at once and an outdated daemon is told to restart; a failed turn names the vendor's reason (usage limit, sign-in, refusal, context window) with what to do; a pull request attempt always ends with an outcome; leftover processes are stopped through the whole group or reported; a worktree a run is using is not removed; and shutdown ends in seconds, at once on a second Ctrl-C. API typecheck, the touched API tests, and the daemon's vet and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
