# Ship: Wave 2 multi-CLI adapters

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge `feat/wave2-multi-cli-assurance` with the four new runtimes listed but refused.
- **Not claimed:** that Grok CLI, OpenCode, Antigravity or Ollama can do or check work; that the launch forms are right; that the egress filter is in use (wave 4 wires it).
- **Owner decisions requested:** approve or return the branch.

Rollback: revert the merge. No schema or wire change; no stored data is touched.

Monitoring after merge: the daemon's runtime list shows the four as not ready with their reason. Watch that no change removes `ConfinementGap` without its own change record.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Grok CLI, OpenCode, Antigravity and Ollama are registered and can be detected and probed, but every path that would start one refuses it with the reason it cannot yet be confined; none is pinnable; Ollama is not treated as local; a runtime with no fixed vendor never counts as a distinct checker family; the evidence is retained in this packet; and the owner has made the merge decision. Nothing here claims any of the four can do or check work.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
