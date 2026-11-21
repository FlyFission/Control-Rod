# Risk: Daemon author egress filter wiring

- **Mode:** Standard
- Execution owner: subagent porting Wave 4 daemon egress wiring onto `main` in isolated worktree `control-rod-daemon-egress`.
- Decision owner: Ben Huffer. No protected/trust surface is touched: no kernel decision function, policy verifier, red-team fixture, checker mount/seccomp/admission gate, attestation builder, workflow, or spec change.
- Scope: `daemon/internal/runner/daemon.go`, `daemon/internal/runner/daemon_egress_test.go`, and `.nuclear/changes/daemon-egress-filter-wiring/`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A checker run (`ws.Checker == true`) starts the author egress proxy or receives `HTTP_PROXY`/`HTTPS_PROXY` pointing to a local daemon listener. | `wireAuthorEgressFilter` returns `(nil, nil)` immediately when `ws.Checker` is true; tested both in unit tests and in `Daemon.Execute` (`TestCheckerExecuteNeverStartsAuthorEgressProxy`). | Any checker run invoking `startEgressFilter` or receiving proxy env vars from it. |
| R-02 | An author policy with empty `AllowedHosts` (`[]string{}`) silently falls back to local defaults instead of denying all outbound `CONNECT`. | `authorEgressHosts` branches on `sandbox == nil` vs `sandbox != nil`, keeping an empty `AllowedHosts` slice empty; tested in `TestWireAuthorEgressFilterPoliciesAndCheckerSkip`. | `sandbox != nil && len(sandbox.AllowedHosts) == 0` permitting `127.0.0.1:11434` or any host. |
| R-03 | Stale `HTTP_PROXY`/`HTTPS_PROXY` inherited by non-sandboxed `ChildEnv` leaves duplicate env entries when proxy env vars are appended. | `wireAuthorEgressFilter` uses `withEnv` to replace any existing `HTTP_PROXY`/`HTTPS_PROXY` keys; verified by `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun` with stale env set. | Duplicate `HTTP_PROXY=` or `HTTPS_PROXY=` entries in `cmd.Env`. |
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
