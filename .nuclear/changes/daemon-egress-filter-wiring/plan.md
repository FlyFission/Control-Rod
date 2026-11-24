# Plan: Daemon author egress filter wiring

1. `daemon/internal/runner/daemon.go`: add `runtimeProviderHosts`, `authorEgressHosts`, `setProxyEnv`, `wireAuthorEgressFilter`, and `startEgressFilter` (defaulting to `StartEgressFilter`), and call `wireAuthorEgressFilter(runtime, cmd, ws, sandbox)` in `execute()` right after `VerifyLaunch` / `preflightedArtifact`, deferring `ef.Close()` when non-nil and preserving all existing `main` behavior (`TokenFile`, `SubscriptionFromStatuses`, checker mounting, admission, and attestation).
   - Behavior when `cmd != nil && !ws.Checker && os.Getenv("CONTROLROD_EGRESS_FILTER") == "1"`.
     - If `sandbox != nil`, combine `sandbox.AllowedHosts` with the runtime's own model-provider hosts from `DefaultModels()` (`models.json`) without mutating `sandbox.AllowedHosts` (appending `:443` when no port is present and deduplicating; an empty `AllowedHosts` permits only the runtime's provider hosts, or denies all outbound connections when the runtime has none).
     - If `sandbox == nil`, allow `127.0.0.1:11434` and `localhost:11434` alongside any runtime provider hosts.
     - Start `StartEgressFilter(hosts)`, defer `ef.Close()`, strip case-insensitive `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` from `cmd.Env`, and inject both uppercase and lowercase `HTTP_PROXY`, `http_proxy`, `HTTPS_PROXY`, `https_proxy` (`"http://" + ef.Addr()`).
2. `daemon/internal/runner/egress_proxy.go`: add standard plain `http://` forward-proxy support (`serveHTTPForward`, `stripHopByHop`, and `transport.CloseIdleConnections()` in `Close()`) against the exact same `allowlist` (defaulting missing port to `:80` for `http://` and returning `403 Forbidden` with `X-ControlRod-Egress: blocked` for non-allowlisted targets).
3. `daemon/internal/runner/daemon_egress_test.go` & `egress_proxy_test.go`: add unit and integration tests covering:
   - `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun`: end-to-end `Daemon.Execute` author run with `CONTROLROD_EGRESS_FILTER=1`, verifying uppercase/lowercase proxy env injection, case-insensitive `NO_PROXY` stripping, live proxy 403 blocking during the run, and proxy teardown after completion.
   - `TestWireAuthorEgressFilterPoliciesAndCheckerSkip`: unit tests for disabled env, `ws.Checker == true` skip, literal empty `sandbox.AllowedHosts` with/without runtime provider hosts (ensuring `sandbox.AllowedHosts` is never mutated), provider + tool host combining/deduplication, and case-insensitive `NO_PROXY`/proxy env replacement.
   - `TestCheckerExecuteNeverStartsAuthorEgressProxy`: `Daemon.Execute` on a sandboxed `pre-check` job with `CONTROLROD_EGRESS_FILTER=1` verifying `startEgressFilter` is never invoked.
   - `TestEgressFilterPlainHTTPForwardingAllowsAndBlocks`: verifies plain `http://` requests through `HTTP_PROXY` succeed for allowlisted hosts and return `403` without contacting blocked upstreams.
4. Evidence & validation: run `gofmt -l .`, `go vet ./...`, `go test`, and `ng.py validate --strict-custody`, storing logs under `evidence/`.

## Interfaces as built

- `runtimeProviderHosts(runtime string) []string`
- `authorEgressHosts(runtime string, sandbox *SandboxPolicy) []string`
- `setProxyEnv(env []string, proxyURL string) []string`
- `wireAuthorEgressFilter(runtime string, cmd *exec.Cmd, ws *Workspace, sandbox *SandboxPolicy) (*EgressFilter, error)`
- `var startEgressFilter = StartEgressFilter` (package test hook matching `resolveArtifact`, `platformCheck`, `sandboxCheck`)
- `EgressFilter.serveHTTPForward(w http.ResponseWriter, r *http.Request)`

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Prior egress proxy slice: [wave2-multi-cli-adapters](../wave2-multi-cli-adapters/basis.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md).

## Exit criteria

Author runs with `CONTROLROD_EGRESS_FILTER=1` start the local HTTP/CONNECT proxy for the policy's `AllowedHosts` plus the runtime's model-provider hosts (or local Ollama defaults when `sandbox == nil`), strip `NO_PROXY`/`no_proxy` and inject `HTTP_PROXY`/`http_proxy` and `HTTPS_PROXY`/`https_proxy` into `cmd.Env`, and close the proxy when `execute()` returns; checker runs (`ws.Checker == true`) never start the author egress proxy; tests and verification evidence are retained in this packet; and the owner retains the merge decision. Nothing here claims that every child process honors `HTTP_PROXY`/`HTTPS_PROXY` or that network namespaces block direct IP connections outside the proxy.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
