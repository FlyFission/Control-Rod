# Risk: first macOS install fixes

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Qualifying a Codex feature lets an agent action reach further. | Each of the nine is classified from its upstream doc comment as transport, rendering, budget or TUI behavior; none adds a tool; the reasoning is recorded per feature. The refusal for anything else is unchanged. | A qualified feature found to add a tool, a network path or a host process. |
| R-02 | Doctor's agent check changes the host. | `controlrod runtimes` runs only the probe and preflight the daemon runs at start; it installs, writes and starts nothing. | Any write or launch from `controlrod runtimes`. |
| R-03 | A quieter log hides a real refusal. | Only runtimes that are detected but never started (awaiting confinement) are folded into one info line; every other refusal is still a warning. | A refusal of a supported runtime logged below warning. |

## Selected mode

- **Mode:** Standard
- Basis: daemon feature allowlist and diagnostics; reversible; no wire, spec or trust-surface change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

MI-01 to MI-03 are implemented; MI-01 fails first on the captured Codex 0.171.0 feature list, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
