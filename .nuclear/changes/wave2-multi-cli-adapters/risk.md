# Risk: Wave 2 multi-CLI adapters

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 instructions ("Take care of everything"; "Work towards clean merges across the board").
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec change.
- Scope: see [basis](basis.md).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A Grok CLI, OpenCode, Antigravity or Ollama run starts with no sandbox and reaches the whole machine. | Each implements `AwaitingConfinement`; `PreflightHost` and `Command` refuse it, so it shows as not ready with the gap as the reason. Tested for all four. | Any of the four returning a command. |
| R-02 | A capability record claims a sandbox the runtime does not have. | `NativeSandbox` is `none` for all four; tested. | Any claim other than `none` before confinement lands. |
| R-03 | An organization pins a runtime that can never start. | `PINNABLE` is `claude` and `codex` only. | A pin accepted for any other runtime. |
| R-04 | Proprietary or stricter work goes to a hosted model through Ollama. | Ollama is removed from the local runtimes; a lane above internal admits only `fake`. Tested. | Ollama admitted on any lane. |
| R-05 | An OpenCode or Ollama checker counts as independent of an author from the same vendor. | Neither has a family; `distinctFamily` fails closed when either side has none. Tested. | `distinctFamily` true for a runtime with no family. |
| R-07 | An open egress tunnel outlives the filter, or the filter allows a static provider list wider than the run's policy. | `Close` closes every tracked tunnel; the static `AllowedEgressForLane` list is removed. Tested. | Traffic through a tunnel after `Close`. |
| R-08 | A pre-check on an unqualified runtime is judged as counted and fails as an unregistered model, or a helper suggests endpoint enforcement exists. | `countedProvider` stays Claude and Codex; the unused `verifyQualifiedAttestation` is removed. | A counted pre-check on a runtime with no registered model. |
| R-06 | The unverified launch forms (`grok -p … --sandbox`, `agy run --brain-dir`) are taken as working. | They cannot run while refused; each gap says the form has not been checked against a pinned version. | Removing the gate without a launch golden test against a pinned CLI. |

## Selected mode

- **Mode:** Standard
- Basis: a daemon security gate that only refuses more; no contract or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Grok CLI, OpenCode, Antigravity and Ollama are registered and can be detected and probed, but every path that would start one refuses it with the reason it cannot yet be confined; none is pinnable; Ollama is not treated as local; a runtime with no fixed vendor never counts as a distinct checker family; the evidence is retained in this packet; and the owner has made the merge decision. Nothing here claims any of the four can do or check work.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
