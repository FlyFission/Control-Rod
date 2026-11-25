# Risk: Grok CLI as a confined seat

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-25 instruction and his standing direction to make the calls and ship (project memory, 2026-11-24).
- Decision owner: Ben Huffer. No protected surface is touched.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A command or a file tool reads a login, the home folder or another run, or reaches the network. | Every delegated command and file access runs under the bridge's command profile: the policy's denied folders and the run home unreadable, network denied, the Keychain service and `security`, `osascript`, `open`, `launchctl`, `sudo` refused. | Any probe in the live qualification succeeding. |
| R-02 | A command or a file tool writes outside where the role may write. | The command profile allows writes only to the workspace (an author) or the verdict files and `scratch/evidence` (a pre-check); the Grok process may not write the workspace at all. | The qualification's write-outside, touch-outside or checker probe succeeding. |
| R-03 | A built-in Grok tool (list, grep, web, MCP, subagents) acts outside the fence. | Agent-profile allowlist of the four delegated tools, confirmed from Grok's log before the prompt (the run stops otherwise); the bridge's hook refuses every other tool; the Grok process itself is under a Seatbelt profile and a host-allowlist proxy. | A built-in tool reaching a canary. |
| R-04 | The Grok process, which must read `auth.json`, leaks the token. | It cannot write the workspace, its network goes only to Grok's own hosts, its tools are limited as in R-03, and commands cannot read `~/.grok`. | A credential pattern in any qualification log or workspace. |
| R-05 | User configuration reaches a run. | A per-run `HOME`; only named files in `GROK_HOME` readable (no hooks, skills, personas or memory); a launch is refused when a folder Grok can read holds `AGENTS.md`, `CLAUDE.md` or `.grok`. | A user customization observed in a run. |
| R-06 | A launch without the verified program runs `grok` directly with the bridge's arguments, which Grok would read as a headless prompt. | The bridge is the process the daemon starts; launch by digest writes the verified path into the bridge's arguments, and the bridge refuses a program that is not an absolute path or a command that is not `agent ... stdio`. | An unverified launch starting. |
| R-07 | A refused or failed turn reads as success. | The bridge reports the turn from Grok's `stopReason`; any error, a missing result and a non-Grok model fail the run. | A failed turn read as success. |
| R-08 | A Grok upgrade changes a tool id, the hook method or the log line. | Only 1.0.92 is seated, at probe and before each launch. | A new version seated without a qualification. |
| R-09 | Checkout or network work is sent to Grok and fails. | The API offers neither to Grok; the daemon refuses both. | A checkout or named-host run claimed by `grok`. |

## Selected mode

- **Mode:** Standard
- Basis: new runtime adapter behind existing seat and counting gates, macOS only, qualified live on a Mac, reversible by revert; no trust surface edited.

## Residual

- The Grok process can read the user's Grok login, because it must. Its own built-in tools are the path a model would use to read it, and they are held by the allowlist, the hook and the process profile together; commands cannot read it.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Grok CLI runs author (outside a checkout), intake and pre-check work on macOS through Control Rod's ACP bridge: Grok under a Seatbelt profile and a host-allowlist proxy, its session limited to the four delegated tools by an allowlist it confirms and a hook the bridge answers, and every command and file access under a second profile derived from the run's policy. It stays refused on every other platform, for checkout authoring and for network work; its pre-checks count with the Grok models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
