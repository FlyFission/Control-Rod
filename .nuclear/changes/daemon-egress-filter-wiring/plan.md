# Plan: Daemon author egress filter wiring

1. `daemon/internal/runner/daemon.go`: add `authorEgressHosts`, `wireAuthorEgressFilter`, and `startEgressFilter` (defaulting to `StartEgressFilter`), and call `wireAuthorEgressFilter(cmd, ws, sandbox)` in `execute()` right after `VerifyLaunch` / `preflightedArtifact`, deferring `ef.Close()` when non-nil and preserving all existing `main` behavior (`TokenFile`, `SubscriptionFromStatuses`, checker mounting, admission, and attestation).
   - Behavior when `cmd != nil && !ws.Checker && os.Getenv("CONTROLROD_EGRESS_FILTER") == "1"`.
     - If `sandbox != nil`, build the allowlist literally from `sandbox.AllowedHosts` (appending `:443` when no port is present; an empty slice yields an empty allowlist denying all outbound `CONNECT`).
     - If `sandbox == nil`, allow `127.0.0.1:11434` and `localhost:11434`.
     - Start `StartEgressFilter(hosts)`, defer `ef.Close()`, and inject `HTTP_PROXY` and `HTTPS_PROXY` (`"http://" + ef.Addr()`) via `withEnv` so any prior value in non-sandboxed `ChildEnv` is replaced cleanly without duplicates.
2. `daemon/internal/runner/daemon_egress_test.go`: add unit and integration tests covering:
   - `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun`: end-to-end `Daemon.Execute` author run with `CONTROLROD_EGRESS_FILTER=1`, verifying `HTTP_PROXY` and `HTTPS_PROXY` injection (replacing stale env entries), live proxy 403 blocking during the run, and proxy teardown after completion.
   - `TestWireAuthorEgressFilterPoliciesAndCheckerSkip`: unit tests for disabled env, `ws.Checker == true` skip, literal empty `sandbox.AllowedHosts` denial, and port `:443` normalization vs explicit port preservation.
   - `TestCheckerExecuteNeverStartsAuthorEgressProxy`: `Daemon.Execute` on a sandboxed `pre-check` job with `CONTROLROD_EGRESS_FILTER=1` verifying `startEgressFilter` is never invoked.
3. Evidence & validation: run `gofmt -l .`, `go vet ./...`, `go test`, and `ng.py validate --strict-custody`, storing logs under `evidence/`.

## Interfaces as built

- `authorEgressHosts(sandbox *SandboxPolicy) []string`
- `wireAuthorEgressFilter(cmd *exec.Cmd, ws *Workspace, sandbox *SandboxPolicy) (*EgressFilter, error)`
- `var startEgressFilter = StartEgressFilter` (package test hook matching `resolveArtifact`, `platformCheck`, `sandboxCheck`)

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Prior egress proxy slice: [wave2-multi-cli-adapters](../wave2-multi-cli-adapters/basis.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md).

## Exit criteria

Author runs with `CONTROLROD_EGRESS_FILTER=1` start the local CONNECT proxy for the policy's `AllowedHosts` (or local Ollama defaults when `sandbox == nil`), inject `HTTP_PROXY` and `HTTPS_PROXY` into `cmd.Env`, and close the proxy when `execute()` returns; checker runs (`ws.Checker == true`) never start the author egress proxy; tests and verification evidence are retained in this packet; and the owner retains the merge decision. Nothing here claims that every child process honors `HTTP_PROXY`/`HTTPS_PROXY` or that network namespaces block direct IP connections outside the proxy.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
