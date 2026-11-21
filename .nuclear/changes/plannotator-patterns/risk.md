# Risk: Plannotator pattern note

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-16 instruction to write the pattern note.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or `spec/` major version, and no product code.
- Scope: `docs/patterns/plannotator.md`, `docs/patterns/README.md` and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Plannotator code, configuration or wording is copied into the repository. | The note carries ideas only, in the author's own words; short quoted names are file or feature names. | Any copied code, configuration, schema or sentence found in review. |
| R-02 | A later port takes a non-permissive file, such as an icon set with its own license. | The provenance header warns about per-asset licenses; ports go through a PL7 provenance table and the licence gate. | A port without a provenance table or licence check. |
| R-03 | An item is built without the gate the note names (kernel placement, `spec/` additions, workflows, hooks with agent authority). | Each row carries its gate; the plan says each item needs its own change record. | An item merged without its own record or gate. |
| R-04 | PL4 is designed on an untested assumption about hooks in print-mode runs. | Recorded as an open question in PL4 and in `basis.md`. | A PL4 design that assumes the hook fires under `claude -p` without evidence. |
| R-05 | Simulation results from PL1 are presented as proof. | The note says Plannotator's models are simulated, not verified, and that Control Rod use must say the same. | Any record that calls a simulated model a proof. |

## Selected mode

- **Mode:** Standard
- Basis: documentation only, but it proposes later work on trust surfaces.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pattern note `docs/patterns/plannotator.md` is complete, each item has a decision, and the owner has reviewed it. No product code is part of this change; no behavior claim is made about Control Rod.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
