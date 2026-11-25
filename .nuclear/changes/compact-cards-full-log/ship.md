# Ship: Compact cards, a full-screen run log, and splits explained

Release decision: **pending the owner's yes.**

## Signature

| Decision | Question | Answer (owner's words) | Given | Where | Recorded by |
|---|---|---|---|---|---|
| Merge PR #198, including the kernel decision function `kernel/src/transition.rs` | "Merge PR #198 (signing settings, compact cards, full log, one-press SCRAM), including its kernel/src/transition.rs change?" | Yes, merge #198 (option chosen on a decision card) | 2026-11-25T11:09:55Z | Project thread "Make cards finish without Ben stepping in", decision cmsg_01JQf1P5cs98pyQ9mZyGHPrK4MGqoc5V4qgJcUhNthTsxQ | Claude (project thread) |

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: Compact shows one line per card; Open full log fills the screen; a split request's cards say "Card N of M from one request".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A compact card is one line: a status mark and its name. A run log opens full screen with every line, a filter and copy. A card drafted from a request that became several cards says "Card N of M from one request" with the request. Intake keeps one card unless the work truly splits. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
