# Plan: instruction checks and owner words

1. Write the instruction-check runner, its judge tests and the first cases.
2. Run every case once against the real CLI and record the results.
3. Investigate any failure before calling it a finding about the text.
4. Write the owner-decision rule and its checker; convert this pull request's records.
5. Update the pattern note and the checks table in `docs/getting-started.md`.
6. Later, each in its own change: cases for the review brief and reviewer profiles; repetitions before any case gates a change; a decision on the daemon comment that the probe contradicts.

Steps 1 to 5 are in this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The instruction-check harness and its first cases run against the real CLI with results recorded, the owner-decision rule is in `docs/collaboration.md` with a passing checker, this pull request's records use it, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
