# Risk: skill workflow pattern note

- **Mode:** Standard
- Execution owner: Claude Code in Orchestrator.inc worker session control-rod-16, under D1 to D4 in [basis](basis.md).
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow or `spec/` major version is edited.
- Scope: `docs/patterns/skill-workflows.md`, `docs/patterns/README.md` and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Upstream wording or code is copied into the note. | Own words; six-word overlap check against all 117 source files (E-01). | A copied sentence or code found in review. |
| R-02 | A port runs sub-agents inside a counted run. | Conflict C1 in the note and build step 5 put dispatch in the control plane. | A design that spawns sub-agents inside a run. |
| R-03 | An upstream bump changes agent instructions without a person reading it. | The sync plan opens a pull request per bump and forbids automatic merge. | A bump merged without review. |
| R-04 | A shipped label implies an endorsement by the upstream authors. | The note keeps "Pocock Superpowers" a working name until both authors are asked. | The name in shipped UI without that check. |
| R-05 | A step that needs a gate is built without it. | Each gated step names its gate (contract signature, package dependencies, G-04). | A step merged without its record or gate. |

## Selected mode

- **Mode:** Standard
- Basis: documentation only; it proposes later trust-surface work (`spec/`).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/skill-workflows.md` maps every Superpowers skill and every Matt Pocock engineering and productivity skill at the pins to a Control Rod stage or a stated skip, defines the hybrid stage by stage, names the conflicts with ADR 0020, ADR 0023 and G-04 and how each is ported, and gives a build plan whose gated steps name their gate. No code, contract or pack changes in this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
