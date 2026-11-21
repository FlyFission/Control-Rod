# Trace: Wave 2 multi-CLI adapters

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | The four new runtimes are refused by `PreflightHost` with their gap as the reason. | `adapter_test.go` `TestAwaitingConfinementIsRefused` | implemented and tested |
| T-02 | `Command` refuses them even with a verified policy. | `TestAwaitingConfinementIsRefused` | implemented and tested |
| T-03 | Claude Code, Codex and the fake runtime are unaffected. | `TestAwaitingConfinementIsRefused`, `TestSandboxedAdaptersRefuseNilPolicyAndUseAgentEnv`, the launch tests | tested |
| T-04 | No refused runtime claims a sandbox. | `TestAwaitingConfinementIsRefused` | implemented and tested |
| T-05 | Ollama is admitted on no lane. | `wave2-assurance.test.ts` "admitsDecidingChecker…" | implemented and tested |
| T-06 | OpenCode, Ollama and unknown runtimes never count as a distinct family. | `wave2-assurance.test.ts` "verifyO6CheckerQuorum…" | implemented and tested |
| T-07 | The egress filter blocks hosts off its allowlist, which the caller builds from the run's policy; the file holds no provider list of its own. | `egress_proxy_test.go` `TestEgressFilterBlocksAndAllowsConnect` | tested (filter not wired on this branch) |
| T-08 | Closing the filter ends tunnels that are already open. | `TestEgressFilterCloseEndsOpenTunnels` | implemented and tested |
| T-09 | A pre-check on one of the four new runtimes does not count. | `wave2-assurance.test.ts` "harnessName names the Wave 2 runtimes…" | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Grok CLI, OpenCode, Antigravity and Ollama are registered and can be detected and probed, but every path that would start one refuses it with the reason it cannot yet be confined; none is pinnable; Ollama is not treated as local; a runtime with no fixed vendor never counts as a distinct checker family; the evidence is retained in this packet; and the owner has made the merge decision. Nothing here claims any of the four can do or check work.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
