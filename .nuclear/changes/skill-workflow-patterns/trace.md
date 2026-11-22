# Trace: skill workflow pattern note

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| SW-01 Every skill in scope at the pins is mapped to a stage or listed as skipped. | `docs/patterns/skill-workflows.md` stage maps | coverage script run in this session: no skill uncovered (E-02) | written |
| SW-02 The note says how each conflict with ADR 0020, ADR 0023, G-04, pre-check independence and the brief-only rule is ported. | conflicts C1 to C5 | owner review | written; review open |
| SW-03 The hybrid names its source for each stage and why. | hybrid table H1 to H7 | owner review | written; review open |
| SW-04 The note is in our own words. | whole note | six-word overlap check (E-01) | pass with one kept run |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/skill-workflows.md` maps every Superpowers skill and every Matt Pocock engineering and productivity skill at the pins to a Control Rod stage or a stated skip, defines the hybrid stage by stage, names the conflicts with ADR 0020, ADR 0023 and G-04 and how each is ported, and gives a build plan whose gated steps name their gate. No code, contract or pack changes in this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
