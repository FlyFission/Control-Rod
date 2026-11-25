# Risk: Antigravity CLI as a confined seat

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-25 instruction and his standing direction to make the calls and ship (project memory, 2026-11-24).
- Decision owner: Ben Huffer. No protected surface is touched.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | An agent command reads a login or reaches the network. | Antigravity's own terminal sandbox, always on in print mode (measured); `security`, network clients, other agent CLIs and pushes denied by rule. | Any probe in the live qualification succeeding. |
| R-02 | A file tool reads or writes outside the workspace. | Workspace outside the home folder; every sibling on its path and every policy denial denied by `read_file`; `inputs/` denied for writes. Refused when a denial would hold the workspace. | The qualification's view or write-outside probe succeeding. |
| R-03 | User configuration (MCP, hooks, plugins, grants) reaches a confined run. | A per-run empty home with only the Keychain linked, outside the workspace and denied to the file tools. | A user customization observed in a run. |
| R-04 | A checker changes the work it checks. | Plan mode, scratch the only writable folder for file tools, writing commands denied, and the deliverable tree and workspace hashed before and after: any change voids the check. | A check that counts after a deliverable changed. |
| R-05 | Antigravity serves a Claude or GPT model and is counted as an independent Google checker. | Only Gemini models are registered for the `agy` harness; a counted check refuses any other model. | A counted check on a non-Gemini model. |
| R-06 | A stopped or refused run reads as success. | The result's status and finish reason decide, not the exit code. Tested on captured lines. | A failed result read as success. |
| R-07 | A checkout run is sent to Antigravity and fails. | The API offers only checkout-capable runtimes to checkout authors; the daemon refuses it too. | A checkout author run claimed by `agy`. |

## Residual

- The file tools can create a new file directly in `/private/var/tmp` (a world temporary folder on the workspace path, which cannot be denied without denying the workspace). They cannot change existing files there, and a checker in plan mode cannot do it at all (the run ends). Recorded in [ship](ship.md).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Antigravity CLI runs author (outside a checkout), intake and pre-check work on macOS under its own terminal sandbox, with file-tool rules, a per-run home and plan-mode checks that Control Rod derives from the run's policy; it stays refused on every other platform and for checkout authoring; its pre-checks count with the Gemini models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
