# Ship: Runs that stall or fail silently now fail loudly, with the reason

Release decision: **pending**. The merge is the owner's decision.

- Rollback: revert the merge. No data or migration. A daemon built from this change still works against an API without it (the extra claim field is ignored there), and an older daemon works against this API.
- Monitoring after merge: a run whose agent hits its usage limit reads "The agent's usage limit is reached. Wait for it to reset..." with the agent's words; a broken queued run reads "Not started: ..." while other runs start; a pull request never stays at "opening" past 15 minutes.
- Limits: the vendor reasons are matched from text the CLIs print today and may need new patterns when a CLI changes its wording; an unmatched failure still shows the agent's own words. Tests use the fake runtime and recorded CLI lines, not a real used-up subscription. Group members are reached by pidfd on Linux only; on macOS the leader is signalled as before, and processes left there are reported after 3 tries.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that cannot start, cannot be read, waits, or fails says why in plain words, and none of them stops other work: one broken queued run fails with its reason while the claim hands out the next; a daemon that cannot read a job fails that run at once and an outdated daemon is told to restart; a failed turn names the vendor's reason (usage limit, sign-in, refusal, context window) with what to do; a pull request attempt always ends with an outcome; leftover processes are stopped through the whole group or reported; a worktree a run is using is not removed; and shutdown ends in seconds, at once on a second Ctrl-C. API typecheck, the touched API tests, and the daemon's vet and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
