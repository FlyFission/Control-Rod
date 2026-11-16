# Ship: Plannotator pattern note

Release decision: **pattern note for owner review; no implementation authorized by this record.**

- **Proposed:** merge the note and this packet as documentation only.
- **Not claimed:** any implemented behavior; any compliance, certification or safety claim; an independent check for copied wording (not yet run); that the PL4 hook works in print-mode runs.
- **Owner decisions requested:**
  1. Accept the note, or return it with changes.
  2. Say who checks it for copied wording, as `docs/patterns/README.md` asks before a pattern file merges.
  3. Pick which items to start. The proposal is PL6 and PL7 first (small, no gate), then PL1 and PL2 on run lease and claim.

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: each item that starts opens its own change record; watch for one that skips the gate its row names.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pattern note `docs/patterns/plannotator.md` is complete, each item has a decision, and the owner has reviewed it. No product code is part of this change; no behavior claim is made about Control Rod.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
