# Risk: control room redesign

- **Mode:** Quick, while the change is a plan. If the owner approves the additive `AgentFigure.runtime` field, the spec edit carries his recorded yes as CODEOWNERS signature (AGENTS.md rule 2).
- Decision owner: Ben Huffer. No policy, red-team fixture, workflow or kernel decision function is edited.
- Scope: `apps/web`, `design/`, new checks under `tools/`, and this packet; `spec/` only with the owner's yes.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The art is not good enough and the round plateaus again. | Key frames before code; owner picks; two rounds at most. | Owner rejects two key frame rounds. |
| R-02 | Assets drift in style or projection. | Blockout registration and per-asset acceptance tests. | An asset fails its acceptance test. |
| R-03 | A state is drawn that the data cannot support. | Every binding names its source line; unsupported rows are deferred. | A screen shows a state no API field records. |
| R-04 | Generated art carries terms that block shipping. | Provider terms recorded in `design/art/PROVENANCE.md` before use. | Terms that do not allow shipping the output. |
| R-05 | Accessibility or performance regresses. | axe, contrast, reduced-motion and frame-time checks scripted. | Any scripted check fails. |

## Selected mode

- **Mode:** Quick
- Basis: plan only at opening; no protected surface touched.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
