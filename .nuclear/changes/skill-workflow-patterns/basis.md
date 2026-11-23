# Basis: skill workflow pattern note (Superpowers, Matt Pocock's skills, hybrid)

**Change slug:** `skill-workflow-patterns`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-22
**Decision this basis supports:** whether `docs/patterns/skill-workflows.md` is accepted as design input for porting the Superpowers and Matt Pocock workflows, and a hybrid of them, as per-card workflows. Documentation only.

## Mission / need

The Nuclear-grade skills were ported with a per-card toggle. The owner wants two widely used software workflows available the same way and kept current with their upstreams, and asked whether their sequences are regular enough to give each stage its own agent. They are, once three things are moved: sub-agents inside a session become separate role runs, live interviews move into guided preparation, and the agent's own merge, push and publish steps are dropped.

## Scope

In scope: the pattern note, one line in `docs/patterns/README.md`, this record. Out of scope: any pack, generator, composer, contract or UI change; each build step in the note gets its own record.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Port the two workflows and keep them current. | "I'm thinking we could port in two other standard workflows (Matt Pocock's) and Obra superpowers.  As those evolve, we'll make sure ours is updated (maybe biweekly)." | 2026-11-22, Orchestrator.inc worker session control-rod-16, second question of the session | Plan the port and a sync every two weeks or so. | Building anything; how the sync is scheduled. |
| D2 | One workflow per card; never stacked. | "I agree they dont stack, it would be one or the other between them." | 2026-11-22, same session, in reply to the proposal to keep the workflows from stacking | A card runs one workflow at a time. | Whether a workflow combines with the Nuclear-grade discipline (see D4). |
| D3 | Separate workflows or a hybrid are both acceptable. | "I'd be fine with separating pocock and superpowers or make a fun hybrid" | 2026-11-22, same message, which names the hybrid "Pocock Superpowers" | The note offers both packs and a hybrid built from their stages; the hybrid's working name is the owner's. | The shipped display name. |
| D4 | The workflow is a separate axis from the Nuclear-grade discipline. | "which is of course different than my Nuclear grade." | 2026-11-22, same message | A card has a workflow and a context profile; Safety and Material still lock Nuclear. | How the two appear in the UI. |
| D5 | Offer all three (two packs and the hybrid), with the hybrid referencing the packs rather than copying them. | none: authoring agent's choice, open to the owner | 2026-11-22, same session | Keeps the sync per upstream and costs the hybrid no sync work. | Which to build first. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Both upstreams are MIT at the pins. | GitHub license metadata for obra/superpowers and mattpocock/skills. | A file to be ported carries another license. |
| The stage maps match the skills at the pins. | Source-level reading; skill inventory and handoff map in `evidence/skill-graph.txt`. | A reviewer finds a skill whose role differs from the note. |
| Pull request #117 keeps its per-role wiring of pack skills. | Its description and file list on 2026-11-22. | #117 merges with a different mechanism; the note's stage maps then follow that one. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/skill-workflows.md` maps every Superpowers skill and every Matt Pocock engineering and productivity skill at the pins to a Control Rod stage or a stated skip, defines the hybrid stage by stage, names the conflicts with ADR 0020, ADR 0023 and G-04 and how each is ported, and gives a build plan whose gated steps name their gate. No code, contract or pack changes in this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
