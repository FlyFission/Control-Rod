# Risk: agent update prompt

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-22 request.
- Decision owner: Ben Huffer. Spec change: additive (minor) changes to `spec/api.tsp`, made after the owner chose it on 2026-11-22; no spec major version, kernel decision function, policy, red-team fixture or workflow is touched. No database migration (settings rows only).
- Scope: `daemon/internal/agentupdate/`, `daemon/cmd/controlrod/`, `daemon/internal/runner/updates.go` and the claim loop, `spec/api.tsp` and its generated files, `services/api/src/agent-updates.ts` with the claim, runtimes and admin wiring, `apps/web/src/components/AgentUpdates.tsx` in the shell, with their tests.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Software is installed without the person's consent. | Startup only logs. `agents update` shows each command and needs a yes, or `--yes`; without a terminal and without `--yes` it refuses (tests; confirmation removal fails a test, `evidence/mutation.log`). | Any install without a yes or `--yes`. |
| R-02 | A registry answer injects arguments into the install command. | The version must match a strict x.y.z[-pre] pattern before it reaches a command, and the command runs without a shell (test; guard removal fails it). | A command built from a value that is not a strict version. |
| R-03 | The update replaces a CLI installed by another tool, leaving two copies. | A command is offered only when the executable lies in `node_modules/<package>/`; otherwise the path is shown and nothing runs (test). | A command offered for a non-npm install. |
| R-04 | An updated runtime is run unchecked. | The daemon already probes every 5 minutes and preflights a new artifact before launch; a pinned runtime refuses the new digest until it is pinned again, and `agents update` says so for Claude Code and Codex. | A run launched on an artifact no probe saw. |
| R-05 | The check slows startup or runs on a schedule. | It runs once, in a goroutine, bounded by 8 seconds; there is no timer. It can be turned off. | Any repeated check without a person's action. |
| R-07 | Someone without authority installs software on the daemon's host from the browser. | `runtime.update` is a Direct command: a passkey signature over the exact agent names and administrator authority (test: unsigned refused; panel disables the buttons with the reason). | An update requested without a verified signature. |
| R-08 | The control plane (or anyone who can write to it) makes the daemon run a command. | Only agent names cross to the daemon; it runs the command it computed itself and refuses a name it holds no command for (test). The API also refuses an agent without a command (test; check removal fails it). | Any command text accepted from the control plane. |
| R-09 | An update replaces a CLI a run is using. | The daemon takes requests only while no run is active, and claims nothing while a command runs (test; guard removal fails it). | An update started while a run is active. |
| R-06 | The check sends data to a third party. | One GET per package to the npm registry (or the configured mirror) for the package's latest tag; no identifiers beyond what an HTTP request carries. | Any other outbound call. |

## Selected mode

- **Mode:** Standard
- Basis: a daemon CLI that can install software on the host when asked; reversible; no server, wire or trust-surface change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-07 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
