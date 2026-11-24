# Ship: Daemon author egress filter wiring

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge `feat/daemon-egress-wiring` into `main` to wire `StartEgressFilter` for opt-in (`CONTROLROD_EGRESS_FILTER=1`) author runs while leaving checker runs untouched.
- **Not claimed:** that proxy environment variables prevent direct non-proxy TCP connections by processes that ignore `HTTP_PROXY`/`HTTPS_PROXY`; that the locally installed Codex CLI (`TestInstalledCodexLeavesOnlyQualifiedFeatures`, a pre-existing local machine environment failure unrelated to this change) passes on this workstation.
- **Owner decisions requested:** approve or return the branch.

Rollback: revert the merge commit on `main`. No schema, API, wire contract, or stored data changes.

Monitoring after merge: when `CONTROLROD_EGRESS_FILTER=1` is enabled for author runs, verify proxy startup errors are surfaced as failed run completions (`start author egress filter: ...`) and confirm checker runs continue without proxy injection.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Prior egress proxy slice: [wave2-multi-cli-adapters](../wave2-multi-cli-adapters/basis.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md).

## Exit criteria

Author runs with `CONTROLROD_EGRESS_FILTER=1` start the local CONNECT proxy for the policy's `AllowedHosts` (or local Ollama defaults when `sandbox == nil`), inject `HTTP_PROXY` and `HTTPS_PROXY` into `cmd.Env`, and close the proxy when `execute()` returns; checker runs (`ws.Checker == true`) never start the author egress proxy; tests and verification evidence are retained in this packet; and the owner retains the merge decision. Nothing here claims that every child process honors `HTTP_PROXY`/`HTTPS_PROXY` or that network namespaces block direct IP connections outside the proxy.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
