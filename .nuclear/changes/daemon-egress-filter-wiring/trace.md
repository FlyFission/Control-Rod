# Trace: Daemon author egress filter wiring

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | When `CONTROLROD_EGRESS_FILTER=1` on an author run, `StartEgressFilter` starts, `HTTP_PROXY`/`http_proxy`/`HTTPS_PROXY`/`https_proxy` are injected into `cmd.Env`, and case-insensitive `NO_PROXY` is stripped. | `daemon_egress_test.go` `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun`, `TestWireAuthorEgressFilterPoliciesAndCheckerSkip` | implemented and tested |
| T-02 | The egress filter supports `CONNECT` and plain `http://` forwarding for allowlisted hosts, blocks disallowed targets with `403`, and closes once `execute()` returns. | `daemon_egress_test.go` `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun`; `egress_proxy_test.go` `TestEgressFilterBlocksAndAllowsConnect`, `TestEgressFilterCloseEndsOpenTunnels`, `TestEgressFilterPlainHTTPForwardingAllowsAndBlocks` | implemented and tested |
| T-03 | When `CONTROLROD_EGRESS_FILTER` is unset or not `"1"`, no egress filter is started and no proxy env vars are injected. | `daemon_egress_test.go` `TestWireAuthorEgressFilterPoliciesAndCheckerSkip/disabled_when_env_unset` | implemented and tested |
| T-04 | Checker runs (`ws.Checker == true`) never start the author egress proxy or receive proxy env vars from it, even when `CONTROLROD_EGRESS_FILTER=1`. | `daemon_egress_test.go` `TestWireAuthorEgressFilterPoliciesAndCheckerSkip/checker_workspace_skips_proxy_even_when_enabled`, `TestCheckerExecuteNeverStartsAuthorEgressProxy` | implemented and tested |
| T-05 | Non-nil `SandboxPolicy.AllowedHosts` is respected without mutation and combined with runtime model-provider hosts from `models.json` (`:443` default, explicit ports preserved, deduplicated). | `daemon_egress_test.go` `TestWireAuthorEgressFilterPoliciesAndCheckerSkip` | implemented and tested |
| T-06 | `main`'s `TokenFile` and `SubscriptionFromStatuses` wiring in `daemon.go` remain intact and `daemon` compiles and passes vet/fmt. | `go vet ./...`, `gofmt -l .`, `daemon` test suite | verified |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Prior egress proxy slice: [wave2-multi-cli-adapters](../wave2-multi-cli-adapters/basis.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md).

## Exit criteria

Author runs with `CONTROLROD_EGRESS_FILTER=1` start the local CONNECT proxy for the policy's `AllowedHosts` (or local Ollama defaults when `sandbox == nil`), inject `HTTP_PROXY` and `HTTPS_PROXY` into `cmd.Env`, and close the proxy when `execute()` returns; checker runs (`ws.Checker == true`) never start the author egress proxy; tests and verification evidence are retained in this packet; and the owner retains the merge decision. Nothing here claims that every child process honors `HTTP_PROXY`/`HTTPS_PROXY` or that network namespaces block direct IP connections outside the proxy.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
