# Plan: role casting design spec

1. Read the multi-provider plan, its handoff, the review panel and domain deliverables specs, ADRs 0015, 0020 and 0021, and today's `pickRuntime`, `pickChecker` and runtime pins.
2. Record the ideas from the talk in a pattern note, ideas only.
3. Write the design spec, ADR 0023 as Proposed, and this change record. Owner reviews.
4. After approval, build one milestone per pull request, each with its own change record:

| Milestone | Delivers | Depends on |
|---|---|---|
| C0 | Owner decisions C-1 to C-8; ADR 0023 accepted or returned | none |
| C1 | Role catalog as pack data, with duty | C0 |
| C2 | Casting sheet contract and version zero reproducing today's choices | C1 |
| C3 | Model and effort per cast; trace records sheet version; observed models checked | C2, M4 |
| C4 | Role trial runner and scoring scripts; checker canaries first | C3, review panel R3 |
| C5 | First software trials; owner signs sheet version one | C4, M7 or M8 |
| C6 | Duty-based and flow-wide separation in the kernel (protected) | C5, M6 |
| C7 | Production signals report | C5 |
| C8 | Capital Projects roles, after their domain deliverables prerequisites | C5, DN-01 to DN-06 |

Only steps 1 to 3 are in this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
