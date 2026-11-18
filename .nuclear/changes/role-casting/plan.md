# Plan: role casting design spec

1. Read the multi-provider plan, its handoff, the review panel and domain deliverables specs, ADRs 0015, 0020 and 0021, and today's `pickRuntime`, `pickChecker` and runtime pins.
2. Record the ideas from the talk in a pattern note, ideas only.
3. Write the design spec, ADR 0023 as Proposed, and this change record. Owner reviews.
4. After approval, build one milestone per pull request, each with its own change record:

| Milestone | Delivers | Depends on |
|---|---|---|
| C0 | Owner decisions C-1 to C-9 and D-1 to D-6 (recorded 2026-11-18 except C-7's discipline, D-4, D-5); ADR 0023 accepted or returned | none |
| C1 | `AgentRole` contract and role catalog as pack data, with duty | C0 |
| C2 | Casting sheet contract and version zero reproducing today's choices; parity only | C1 |
| C3 | Probed models and modalities; model per cast (effort once a counted flag exists); trace records sheet version; positive provenance for every run that feeds a check | C2, M4 |
| C4 | Trial runner, separate scorer, checker canaries (trial job kind only) | C3, M9, review panel R3, trial terms finding, D-4, D-5 |
| C4b | Originate and refute trial sets; sheet proposal script | C4, review panel R9 |
| C5 | First software trials; owner signs sheet version one (author, intake, pre-check entries) | C4b, M6, M9, M7 or M8 |
| C6 | Lineage, duty-based and flow-wide separation in the kernel (protected) | C5, M6 |
| C7 | Production signals report | C5 |
| C8 | Capital Projects roles, one per pull request | C6, and each role's prerequisites in spec section 7 |

Only steps 1 to 3 are in this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
