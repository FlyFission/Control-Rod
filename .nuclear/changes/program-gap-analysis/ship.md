# Ship: program gap analysis

Release decision: **proposed merge as documentation plus the inventory regeneration; the owner retains the decision on every recommendation.**

- **Proposed:** merge the two analyses, the regenerated command inventory and the status and index updates.
- **Not claimed:** that any competitor was tested; that the ranking is validated with users (P-01 is open); any compliance, certification or safety claim; that any parked owner decision is now taken.
- **Owner decisions requested** (section 8 of the analysis): run the owner validation after M3 instead of after M7; where the backlog lives (issues or plans); whether a local-model runtime may be scoped before M6 and M7; whether to tag a first alpha.

Rollback: revert the commit. Documentation and a generated file; no code, schema or wire change.

Monitoring after merge: each slice or feature the roadmap names opens its own change record; this record is updated only if the owner's decisions change the order.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The analysis documents are complete, the sources it rests on are cited with their dates, the owner has read it and answered or deferred its four requested decisions. No product code is part of this change beyond the command inventory regeneration and the status page; no claim is made about any competitor beyond what its public README or the cited research said on the date given.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
