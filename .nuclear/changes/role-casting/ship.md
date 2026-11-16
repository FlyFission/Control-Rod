# Ship: role casting design spec

Release decision: **design spec and proposed ADR for owner review; no implementation authorized by this record.**

- **Proposed:** merge the spec, ADR 0023 as Proposed, the pattern note and this packet as documentation only.
- **Not claimed:** any implemented behavior; that any model is better than another at any duty (the spec's model suggestions are hypotheses for trials); that casting makes checks independent; that any Capital Projects role is ready; that the spec has had an independent review.
- **Owner decisions requested:**
  1. Approve the spec and ADR 0023, or return them with changes.
  2. Answer C-1 to C-8 in spec section 15, starting with C-1 (does a signed casting sheet with reported trials fit the plan's cut of a strengths matrix and learning loop).
  3. Say whether to run a cross-vendor review of the spec (Codex, agy, local Qwen, as for the multi-provider plan) before approval.

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: each milestone opens its own change record; watch for any slice that changes a cast without a signed sheet, lets a sheet override separation, or ships a Capital Projects role before its prerequisites.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
