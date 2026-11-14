# Risk: adapter seam for the run daemon

- **Mode:** Standard
- Execution owner: implementing agent under the Milestone 1 brief (adapter seam, no behavior change).
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow, spec major version, or generated contract.
- Scope: `daemon/`, `docs/daemon.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A launch flag, settings document, argument order or environment value changes while the call sites move. | Golden fixtures captured from `Command` and `LaunchFor` before the move; `sandbox-args` saved before and after; existing launch and sandbox tests left unchanged. | Any golden or `sandbox-args` byte mismatch, or any edit to an existing assertion. |
| R-02 | Probe or preflight wording, or which runtime is offered, changes. | Adapters call the existing probe path; existing probe and runner tests left unchanged; registry test locks order and the fake gate. | A different sentence, a fake runtime offered without `CONTROLROD_ALLOW_FAKE=1`, or a dropped CLI. |
| R-03 | Stream events or end-of-turn detection change. | Adapters call `Normalize` and `TurnEnd`; golden stream test compares adapter results to those functions on the existing Claude fixture and the Codex cases from `events_test.go`. | A differing event or `TurnEnd` result. |
| R-04 | `Capabilities` or a new branch starts deciding sandbox, network or model behavior. | Nothing in this change reads `Capabilities` to choose a path. The moved branches call the same helpers as before. | A decision that reads `Capabilities`, or a helper whose arguments changed. |
| R-05 | The environment allowlist is widened or narrowed while proving it drops provider variables. | The guard records a failure as a skipped subtest and a finding. This change does not edit `agentEnvKeys`. | An edit to the allowlist in this pull request. |

## Selected mode

- **Mode:** Standard
- Basis: the daemon's launch path is restructured, and a mistake would change what an agent process is allowed to do. The change claims no new behavior, and the controls are byte comparisons plus the existing tests.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The registry is the only dispatch for `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe`. Golden launch output and `sandbox-args` output match the pre-refactor bytes. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
