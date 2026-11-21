# Basis: Daemon author egress filter wiring

**Change slug:** `daemon-egress-filter-wiring`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether branch `feat/daemon-egress-wiring` is merged onto `main`.

## Mission / need

Wave 2 ([wave2-multi-cli-adapters](../wave2-multi-cli-adapters/basis.md)) added the local TCP/CONNECT allowlist proxy (`StartEgressFilter` in `daemon/internal/runner/egress_proxy.go`), explicitly noting that wiring it into daemon execution was deferred to Wave 4. Wave 4 (`67924caf` / `5de7babf` / `c19b9947` on `feat/wave4-full-integration`) wired `StartEgressFilter` into `Daemon.execute()` in `daemon/internal/runner/daemon.go`, but `feat/wave4-full-integration` has not been merged to `main` as a whole. This change ports only the daemon author egress proxy wiring and dedicated tests onto `main` without touching any trust surface or merging unrelated Wave 4 changes.

## Scope

In scope: `daemon/internal/runner/daemon.go` (`execute()`, `authorEgressHosts`, `wireAuthorEgressFilter`), `daemon/internal/runner/daemon_egress_test.go`, and this change record under `.nuclear/changes/daemon-egress-filter-wiring/`. Out of scope: kernel decision logic, attestation, sandbox policy verification, checker mount/seccomp/admission paths, API routes, web UI, specs, workflows, and red-team fixtures.

## Fixed inputs

- Reference Wave 4 implementation in `git show 67924caf:daemon/internal/runner/daemon.go` (including the `c19b9947` review fix that respects a non-nil `SandboxPolicy.AllowedHosts` literally so an empty slice denies all outbound `CONNECT`).
- `main`'s `daemon/internal/runner/daemon.go` (`TokenFile`, `SubscriptionFromStatuses`, checker confinement and attestation).
- [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md): zero TLS MITM, zero credential injection/relaying, no weakening of checker confinement or `AgentEnv`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `ws.Checker` is set before `wireAuthorEgressFilter` runs for every sandboxed pre-check. | `prepareWorkspace` calls `PrepareChecker` (`ws.Checker = true`) and `Command` sets `ws.Checker = true` for `pre-check` when `a.SandboxRequired()`. | Any new checker launch path that leaves `ws.Checker` false. |
| `CONTROLROD_EGRESS_FILTER=1` opts into the local CONNECT proxy for author runs without altering default behavior when unset. | `wireAuthorEgressFilter` checks `os.Getenv("CONTROLROD_EGRESS_FILTER") == "1"` and returns `(nil, nil)` otherwise. | Any caller expecting the proxy when `CONTROLROD_EGRESS_FILTER` is unset. |
| `StartEgressFilter` closes all tracked hijacked tunnels on `Close()`. | `egress_proxy.go` `Close()` closes `ef.server` and every tracked tunnel end; tested in `egress_proxy_test.go`. | An open tunnel surviving `ef.Close()`. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Prior egress proxy slice: [wave2-multi-cli-adapters](../wave2-multi-cli-adapters/basis.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md).

## Exit criteria

Author runs with `CONTROLROD_EGRESS_FILTER=1` start the local CONNECT proxy for the policy's `AllowedHosts` (or local Ollama defaults when `sandbox == nil`), inject `HTTP_PROXY` and `HTTPS_PROXY` into `cmd.Env`, and close the proxy when `execute()` returns; checker runs (`ws.Checker == true`) never start the author egress proxy; tests and verification evidence are retained in this packet; and the owner retains the merge decision. Nothing here claims that every child process honors `HTTP_PROXY`/`HTTPS_PROXY` or that network namespaces block direct IP connections outside the proxy.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
