# Trace: role casting design spec

| Requirement | Milestone | Tests (planned) | Disposition |
|---|---|---|---|
| RC-1 Each pack has a role catalog; each role has one duty and a domain agent spec (`AgentRole` contract added). | C1, C8 | A role file without a duty fails a test; existing launch goldens unchanged | designed, not implemented |
| RC-2 A signed, versioned casting sheet orders candidates per role, grade and lane; the run uses the version fixed at queue time; budget and quota hold, never walk; version zero reproduces today. | C2 | Golden test over every current `pickRuntime` and `pickChecker` case, including pins, the owner override, unavailable candidates, budget holds and held runs | designed, not implemented |
| RC-3 The cast model is launched through the attested flag and recorded; provenance needs positive evidence for every run that feeds a check. | C3 | Run cast with model X reporting model Y, or nothing, is refused as a check; a check of an author run with unknown provenance is held | designed, not implemented |
| RC-4 Trial scores come only from an approved scorer in a separate process, bound to the trial run's attestation; trials are a job kind that cannot count. | C4, C4b | Score reproduced by rerunning the scoring script on stored outputs; model-written score rejected by the record format | designed, not implemented |
| RC-5 Nothing changes a cast without a newly signed, script-generated sheet; acceptance signals never count against a checker. | C2, C7 | Production signals report cannot write a sheet | designed, not implemented |
| RC-6 Casting never overrides separation (by lineage), tier floors (from the registry) or the local-model rule; review panel seats stay as confirmed. | C2, C6 | Sheet listing a non-separate checker first: that candidate refused at claim | designed, not implemented |
| RC-7 Specialists compose between runs, never as subagents. | C3 and flows | Subagent use in `observed_models` makes provenance unknown | designed, not implemented |
| RC-8 Capital Projects roles drive tools; parameters by reference to controlled inputs; numbers trace to tool runs or cited sources; methods never chosen by a model. | C8 | Per role, deliverable numbers traced to tool outputs | designed, not implemented |
| RC-9 Under any sheet other than version zero, for check and refute roles, a pin mismatch holds; the claiming machine cannot choose the checker; a recheck goes to the checker that failed it (D-1 to D-3). | C3 | Pin mismatch on a checker runtime holds the run; a daemon missing a higher-ranked candidate cannot claim; a recheck after a fail is offered only to the failing checker | designed, not implemented |
| Owner decisions C-1 to C-9 and D-1 to D-6 (spec section 15) | C0 | none | recorded 2026-11-18; open: C-7's discipline, D-4, D-5, and ADR 0023 acceptance |

Requirement IDs RC-1 to RC-9 summarise ADR 0023 decisions 1 to 5 and conditions.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
