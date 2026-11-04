# Ship: run liveness after the agent is done

- **Proposed:** merge to the buildout branch as a draft pull request for owner review.
- **Not claimed:** real-runtime behaviour on the owner's Mac (E-07); a cap on raw run logs (R-04).
- **Owner decisions requested:**
  1. Whether to cap each run's raw log (and how: a line or byte limit with one marker line, as the event cap does), given that the raw log is the full record behind the 20000-event cap.
  2. Whether 30 seconds of settle and 15 minutes of maximum retry wait suit a laptop.
- **Before relying on RL-02 for a new Claude Code pin:** confirm the pinned version still reads `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` (the ADR 0021 per-version qualification is the natural place).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).
