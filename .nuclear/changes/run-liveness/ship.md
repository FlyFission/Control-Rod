# Ship: run liveness after the agent is done

Release decision: **draft pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to the buildout branch as a draft pull request for owner review.
- **Not claimed:** real-runtime behaviour on the owner's Mac (E-07); a cap on raw run logs (R-04).
- **Owner decisions requested:**
  1. Whether to cap each run's raw log (and how: a line or byte limit with one marker line, as the event cap does), given that the raw log is the full record behind the 20000-event cap.
  2. Whether 30 seconds of settle and 15 minutes of maximum retry wait suit a laptop.
- **Before relying on RL-02 for a new Claude Code pin:** confirm the pinned version still reads `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` (the ADR 0021 per-version qualification is the natural place).

Rollback: revert the commit. No schema, migration or wire change is involved, so an older daemon runs against the same control plane and outbox unchanged.

Monitoring after merge: the daemon log line "runtime did not exit after reporting the end of its turn" and the matching run notice show how often settle ends a run; "completion upload failed; kept in the outbox" with its attempt count shows stuck deliveries. A settle on most runs of one runtime means that runtime lingers by design and the window should be reviewed.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RL-01 to RL-04 are implemented with failed-first regression evidence and a green race suite; the open storage item and real-runtime gap are stated for the owner. No fake-runtime result is presented as real-runtime proof.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
