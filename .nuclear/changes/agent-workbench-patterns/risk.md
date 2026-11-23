# Risk: agent workbench pattern note

- **Mode:** Standard
- Execution owner: Claude Code in Orchestrator.inc worker session control-rod-16, under D1 in [basis](basis.md).
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow or `spec/` major version is edited.
- Scope: `docs/patterns/agent-workbenches.md`, `docs/patterns/README.md` and this packet. The web changes (AW1 to AW4) moved to #159 and its record `board-attention`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-07 | The note copies wording or code from a source. | Ideas only; a six-word overlap check, with matches reworded (E-03). | A copied sentence, code or configuration found in review. |

## Selected mode

- **Mode:** Standard
- Basis: a documentation note; reversible by revert; no protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 ship in #159 under its own record (`board-attention`). Before merge, a person who did not write the note checks it against its sources for copied wording, and the result is recorded in [ship](ship.md). No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
