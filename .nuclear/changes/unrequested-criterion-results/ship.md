# Ship: A check counts even when the checker writes criterion results nobody asked for

Release decision: **pending owner decision.**

- Rollback: revert the merge. No migration.
- Monitoring after merge: the sandbox card's Grok check counts and the card moves on to accept.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A pre-check whose inputs carry no criterion results schema settles on its verdict alone. A criterion-results.json it writes anyway is noted and not sent, and never voids the check. A prepared check is unchanged. `controlrod cards` columns read in the board's words with a space before the id. Go vet, the runner tests that run without bubblewrap, and the scripts tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
