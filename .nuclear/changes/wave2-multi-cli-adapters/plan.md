# Plan: Wave 2 multi-CLI adapters

1. `adapter.go`: an `AwaitingConfinement` interface (`ConfinementGap() string`) and `confinementRefusal`.
2. `sandbox.go` `PreflightHost` and `runtime.go` `Command` refuse an adapter awaiting confinement, after the policy check.
3. The four adapters implement `ConfinementGap` with the reason each cannot run, and report `NativeSandbox: "none"`.
4. API: `PINNABLE` back to `claude` and `codex`; Ollama out of `LOCAL_RUNTIMES`; `RUNTIME_FAMILIES` without OpenCode and Ollama; `distinctFamily` fails closed.
5. Egress filter: drop the static `AllowedEgressForLane` list; track hijacked tunnels and close them in `Close`.
6. Attestation: `countedProvider` stays Claude and Codex; remove `verifyQualifiedAttestation`.
7. Tests: `TestAwaitingConfinementIsRefused`; `TestSandboxedAdaptersRefuseNilPolicyAndUseAgentEnv` skips the launch check for refused adapters; `wave2-assurance.test.ts` updated.

Each runtime leaves `AwaitingConfinement` in its own change, with its confinement, a launch golden test against a pinned CLI, and qualification. The design doc's order is an ACP client for Antigravity, OpenCode, Grok Build and Codex, and Control Rod's own harness for local models.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Grok CLI, OpenCode, Antigravity and Ollama are registered and can be detected and probed, but every path that would start one refuses it with the reason it cannot yet be confined; none is pinnable; Ollama is not treated as local; a runtime with no fixed vendor never counts as a distinct checker family; the evidence is retained in this packet; and the owner has made the merge decision. Nothing here claims any of the four can do or check work.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
