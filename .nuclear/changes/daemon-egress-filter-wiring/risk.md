# Risk: Daemon author egress filter wiring

- **Mode:** Standard
- Execution owner: subagent porting Wave 4 daemon egress wiring onto `main` in isolated worktree `control-rod-daemon-egress`.
- Decision owner: Ben Huffer. No protected/trust surface is touched: no kernel decision function, policy verifier, red-team fixture, checker mount/seccomp/admission gate, attestation builder, workflow, or spec change.
- Scope: `daemon/internal/runner/daemon.go`, `daemon/internal/runner/egress_proxy.go`, `daemon/internal/runner/egress_proxy_test.go`, `daemon/internal/runner/daemon_egress_test.go`, and `.nuclear/changes/daemon-egress-filter-wiring/`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A checker run (`ws.Checker == true`) starts the author egress proxy or receives `HTTP_PROXY`/`HTTPS_PROXY` pointing to a local daemon listener. | `wireAuthorEgressFilter` returns `(nil, nil)` immediately when `ws.Checker` is true; tested both in unit tests and in `Daemon.Execute` (`TestCheckerExecuteNeverStartsAuthorEgressProxy`). | Any checker run invoking `startEgressFilter` or receiving proxy env vars from it. |
| R-02 | An author policy with empty `AllowedHosts` (`[]string{}`) either silently falls back to local defaults or blocks the CLI's own model provider. | `authorEgressHosts` derives provider hosts separately from `DefaultModels()` without mutating `sandbox.AllowedHosts`; empty `AllowedHosts` permits only the runtime's provider hosts (or denies all `CONNECT` when none exist); tested in `TestWireAuthorEgressFilterPoliciesAndCheckerSkip`. | `sandbox != nil && len(sandbox.AllowedHosts) == 0` permitting `127.0.0.1:11434`, mutating `sandbox.AllowedHosts`, or blocking the runtime's own provider. |
| R-03 | Stale `http_proxy`/`https_proxy` or `NO_PROXY`/`no_proxy` inherited by non-sandboxed `ChildEnv` causes duplicates or bypasses the egress filter, or plain `http://` URLs via `HTTP_PROXY` fail with 405. | `setProxyEnv` strips case-insensitive `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` and sets both uppercase and lowercase proxy vars; `serveHTTPForward` handles plain `http://` requests against the same allowlist; tested in `daemon_egress_test.go` and `egress_proxy_test.go`. | Duplicate proxy keys, surviving `NO_PROXY`/`no_proxy`, or 405 on allowlisted plain `http://` proxy requests. |
| R-04 | An open egress proxy listener or tunnel outlives the author run. | `execute()` defers `ef.Close()` immediately after `wireAuthorEgressFilter` succeeds; `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun` verifies dialing the proxy address fails after `Execute` returns. | Proxy port still accepting connections after `execute()` returns. |
| R-05 | Rebase accidentally drops recent `main` changes in `daemon.go` (`TokenFile`, `SubscriptionFromStatuses` signature). | Surgical edit on `main`'s `daemon.go` only; `TokenFile` and `SubscriptionFromStatuses` verified unchanged in git diff and `go test`. | Any unrelated diff in `daemon.go`. |

## Selected mode

- **Mode:** Standard
- Basis: opt-in (`CONTROLROD_EGRESS_FILTER=1`) daemon execution wiring for author runs; no contract, schema, kernel, or trust-surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Prior egress proxy slice: [wave2-multi-cli-adapters](../wave2-multi-cli-adapters/basis.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md).

## Exit criteria

Author runs with `CONTROLROD_EGRESS_FILTER=1` start the local CONNECT proxy for the policy's `AllowedHosts` (or local Ollama defaults when `sandbox == nil`), inject `HTTP_PROXY` and `HTTPS_PROXY` into `cmd.Env`, and close the proxy when `execute()` returns; checker runs (`ws.Checker == true`) never start the author egress proxy; tests and verification evidence are retained in this packet; and the owner retains the merge decision. Nothing here claims that every child process honors `HTTP_PROXY`/`HTTPS_PROXY` or that network namespaces block direct IP connections outside the proxy.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
