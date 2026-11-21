# Risk: anchored notes and plan approval

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-18 instruction to start PL3 and PL4.
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture, workflow or `spec/` major version changes. `spec/` gains additive models.
- Scope: the files listed in `basis.md`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | An anchor path escapes the snapshot when a later caller reads files. | The contract pattern and the check both refuse absolute paths, backslashes and `.` or `..` segments; tests cover each. The check itself reads nothing. | A caller that reads a path the check did not accept. |
| R-02 | A finding that cites code not there is shown as real. | Quote, range, side and change checks for each type; any failure returns `anchored: false` with a reason; five planted faults each fail a test (E-02). | A fabricated anchor that passes in a fixture or in use. |
| R-03 | The spike is read as qualification of a planning invocation. | The design and this record say one run each, one version, one platform, this session's login; ADR 0021 qualification is a gate in the design. | Any planning mode enabled on the strength of this spike alone. |
| R-04 | A hook with authority to allow tools is added without the owner gate. | The design keeps hook approval (option B) for later, behind its own spike and the agent-authority gate; nothing here changes the daemon. | A daemon change that answers a permission request without that gate. |
| R-05 | The new spec models break generated code or existing schema loading. | Regeneration shows no drift; the strict validator loads every schema, and the contract test runs through it (E-02); OpenAPI is unchanged. | A CI failure in contract drift or schema loading. |

## Selected mode

- **Mode:** Standard
- Basis: additive contracts and a pure check, a spike in a scratch folder, and a design; no gated surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The anchor contract regenerates with no drift, the anchor check passes its tests and fails each planted fault, the print-mode hook spike is recorded, the plan approval design is written, and the owner has reviewed all three.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
