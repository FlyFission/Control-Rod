# Risk: one SCRAM button with a beacon lamp

- **Mode:** Quick
- Decision owner: Ben Huffer. Web UI only. No kernel decision function, policy, red-team fixture, workflow or spec file is edited.
- Scope: `apps/web/src/components/`, `apps/web/src/styles.css`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The copy promises a pause or a free resume that SCRAM does not give. | Copy written from `Scram.tsx`: stops, holds, restart after review. | Any copy that says pause or anytime. |
| R-02 | An unknown SCRAM status reads as clear once the "No SCRAM" words go. | The lamp is hatched for unknown and its accessible name says the status could not be read. | An unknown read drawn as a dark lamp. |
| R-03 | The flashing lamp ignores reduced motion or runs in a hidden tab. | Animations off under prefers-reduced-motion (lamp stays lit, steady) and paused in a hidden tab; checked in Chromium. | Computed animation not "none" under reduced motion. |
| R-04 | SCRAM becomes harder to reach. | The SCRAM link is unchanged (to the Plant's SCRAM control) and never locked; tests assert it on desktop and phone. | A test that cannot find the SCRAM link. |

## Selected mode

- **Mode:** Quick
- Basis: presentation change on the top bar; SCRAM behaviour unchanged.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
