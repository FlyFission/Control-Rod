# Ship: A card, the Inbox and Today say what happened in plain words

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer chose "Merge 225" on the merge decision card in the project thread, 2026-11-25 22:13 UTC.

- Rollback: revert the merge. Web only; no data, route or migration change.
- Monitoring after merge: on the owner's Inbox, the failed checks read "Did not finish" with a plain sentence and one Open button.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that did not finish reads "Did not finish" with a plain sentence on the Inbox and Today, never "Dispute"; the runner's own text, the digest and what signing binds sit under Details. The card drawer names its column as the board does, counts files without "2 of 1", says "Did not finish" rather than "Not run yet" after a failed check, names the agents that write and check, and counts versions from 1. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
