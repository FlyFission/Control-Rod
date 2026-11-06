# Plan: review panel design spec

1. Gather cross-model review research ([evidence](evidence/08-cross-model-review.md)).
2. Record owner decisions P1 and P2.
3. Write the design spec and this change record. Owner reviews the spec.
4. After approval, implement one slice per pull request, each with its own change record:

| Slice | Delivers | Depends on |
|---|---|---|
| R1 Reviewer run | Daemon review run mode with Codex and Claude Code profiles, read-only snapshot, outcomes, write canary, fixture tests with fake CLIs | none |
| R2 Review subject and brief | Review subject record and migration, folder and branch targets, lane gate, brief builder, `controlrod review` for folder and branch | R1 |
| R3 Findings and Stage 1 | Finding schema and validator, Stage 1 anchoring, unverifiable list | R2 |
| R4 Report | Merge and agreement badges, quorum and empty seats, report record, terminal output of the report | R3 |
| R5 Report on the board | Report view with dispositions; Accept creates a card | R4, board M1 |
| R6 Pull requests | PR target by commit | R2 |
| R7 More seats | Grok, then Antigravity, then Gemini profiles, each after ADR 0021 qualification | R1 |
| R8 On a card | Request review on a card; pre-check seat through the existing path | R4, board M5 |
| R9 Refutation | Stage 2 refutation and the precedents store | R4 |

5. Live qualification of each runtime under ADR 0021 gates the matching seat in R7.

Only steps 1 to 3 are in this change. Steps 4 and 5 are authorized only by later records. Slices R1 (profile table), R2 (migration) and R4 (additive `spec/` models) each touch a gate named in spec section 7.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its research evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the review panel is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
