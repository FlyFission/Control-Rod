# Plan: skill workflow pattern note

1. Clone both upstreams at pinned commits into scratch space; read every `SKILL.md` in scope and the Superpowers implementer and reviewer templates; map which skill hands to which (`evidence/skill-graph.txt`).
2. Compare with ADR 0020, ADR 0023, gap G-04, the software and general roles, the Nuclear-pack generator, and open pull requests #117, #126 (issue) and #138.
3. Write the note with a stage map per workflow, the hybrid table, the sync plan and a build plan; list it in `docs/patterns/README.md`.
4. Check coverage (every skill mapped or skipped) and wording; owner review. Build steps follow in their own records.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/skill-workflows.md` maps every Superpowers skill and every Matt Pocock engineering and productivity skill at the pins to a Control Rod stage or a stated skip, defines the hybrid stage by stage, names the conflicts with ADR 0020, ADR 0023 and G-04 and how each is ported, and gives a build plan whose gated steps name their gate. No code, contract or pack changes in this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
