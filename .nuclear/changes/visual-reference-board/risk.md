# Risk: visual reference board

- **Mode:** Quick
- Decision owner: Ben Huffer. Documentation only. No kernel decision function, policy, red-team fixture, workflow or spec file is edited.
- Scope: `design/references/`, one line in `AGENTS.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | An agent copies a reference's art or layout instead of the idea. | The board says to borrow the move, never the art, and commits no third-party images. The originality check runs on the text. | A visual change whose assets or layout reproduce a reference. |
| R-02 | An award claim is wrong. | Every claim links to the page it was read from, and each reference states the strength of its evidence. | A cited page that does not state the claim. |
| R-03 | The bar is treated as optional and code review stays the finish line. | AGENTS.md points to the board; the board says a code review pass is not a visual pass. | A visual PR merged without screenshots checked against the bar. |

## Selected mode

- **Mode:** Quick
- Basis: documentation only, no behaviour change and no protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
