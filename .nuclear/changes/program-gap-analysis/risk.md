# Risk: program gap analysis

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-08 instruction to find the gaps in the repository and the program for the end user, with a SWOT and a gap analysis against the agent-board field.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version.
- Scope: `docs/superpowers/specs/2026-11-08-program-gap-analysis.md`, `docs/superpowers/specs/2026-11-08-adoption-and-retention-analysis.md`, the regenerated `docs/commands/inventory.md`, `docs/status.md`, `docs/README.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A competitor is described as having or lacking a capability it does not. | Every competitor cell cites a README read on 2026-11-08 or a dated research file; cells are labeled as vendor claims, not tests; section 9 says so. | A capability claim with no dated source. |
| R-02 | The analysis recommends a feature that would make a screen overclaim (steering, cost, autopilot, agent-to-agent messaging). | Section 7 lists the features refused and why; every gap row carries a trust constraint; parked items stay parked unless named as an owner decision. | A recommendation without its constraint, or one that bypasses a parked owner decision. |
| R-03 | The ranking is taken as validated when it is inference. | P-01 names the missing user validation as the first program gap; section 9 states the ranking is the author's judgment. | Any slice ordered by this document without the owner's decision. |
| R-04 | The regenerated command inventory misstates a command. | `tools/generate_command_inventory.py` reads `services/api/src`; `--check` is clean after regeneration; the API `command-boundary` test checks the catalog against executed commands. | `--check` reports drift. |

## Selected mode

- **Mode:** Standard
- Basis: a planning document with no code behavior change; it influences what is built next and what the project says about other products.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The analysis documents are complete, the sources it rests on are cited with their dates, the owner has read it and answered or deferred its four requested decisions. No product code is part of this change beyond the command inventory regeneration and the status page; no claim is made about any competitor beyond what its public README or the cited research said on the date given.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
