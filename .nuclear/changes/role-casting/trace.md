# Trace: role casting design spec

| Requirement | Milestone | Tests (planned) | Disposition |
|---|---|---|---|
| RC-1 Each pack has a role catalog; each role has one duty and a domain agent spec. | C1, C8 | A role file without a duty fails a test; existing launch goldens unchanged | designed, not implemented |
| RC-2 A signed, versioned casting sheet orders candidates per role, grade and lane; version zero reproduces today. | C2 | Golden test over every current `pickRuntime` and `pickChecker` case | designed, not implemented |
| RC-3 The cast model and effort are launched and recorded; a mismatch cannot count as a check. | C3 | Run cast with model X reporting model Y is refused as a check | designed, not implemented |
| RC-4 Trial scores come only from scripts with recorded digests. | C4 | Score reproduced by rerunning the scoring script on stored outputs; model-written score rejected by the record format | designed, not implemented |
| RC-5 Nothing changes a cast without a newly signed sheet. | C2, C7 | Production signals report cannot write a sheet | designed, not implemented |
| RC-6 Casting never overrides separation or tier floors. | C2, C6 | Sheet listing a non-separate checker first: that candidate refused at claim | designed, not implemented |
| RC-7 Specialists compose between runs, never as subagents. | C3 and flows | Subagent use in `observed_models` makes provenance unknown | designed, not implemented |
| RC-8 Capital Projects roles drive tools; numbers trace to tool runs or cited sources. | C8 | Per role, deliverable numbers traced to tool outputs | designed, not implemented |
| Open owner decisions C-1 to C-8 (spec section 15) | C0 | none | open: owner decisions |

Requirement IDs RC-1 to RC-8 summarise ADR 0023 decisions 1 to 5 and conditions.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
