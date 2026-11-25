# Plan: Grok CLI as a confined seat

1. `adapter_grok.go`: the launch is the daemon's own `grok-bridge` command with the bridge's settings inline and the `grok agent ... stdio` argv after `--`; refusals (checkout, network, missing tools, another vendor's model, loaded instruction files); version pin, login and model probe; stream parser; self-confined checker.
2. `grok_bridge.go`, `grok_bridge_unix.go`: the ACP client, the two Seatbelt profiles, the host-allowlist proxy, the allowlist check, the hook and permission answers, delegated terminals and file access under the command profile.
3. `artifact.go`: launch by digest puts the verified path in a bridge command's argv.
4. `cmd/controlrod`: hidden `grok-bridge` command.
5. `models.json`: the Grok models.
6. API: `grok` pinnable, counted, runnable, a checker choice, listed on subscriptions, never offered checkout or named-host work.
7. Tests, including a scripted ACP agent, and the live qualification `TestGrokQualification` (darwin, opt-in) on a Mac.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Grok CLI runs author (outside a checkout), intake and pre-check work on macOS through Control Rod's ACP bridge: Grok under a Seatbelt profile and a host-allowlist proxy, its session limited to the four delegated tools by an allowlist it confirms and a hook the bridge answers, and every command and file access under a second profile derived from the run's policy. It stays refused on every other platform, for checkout authoring and for network work; its pre-checks count with the Grok models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
