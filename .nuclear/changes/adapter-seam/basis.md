# Basis: adapter seam for the run daemon

**Change slug:** `adapter-seam`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-14
**Decision this basis supports:** whether the daemon runtime dispatch can be refactored into one adapter per CLI with no behavior change.

## Mission / need

Later milestones need one place per CLI for launch, probe, stream parsing and, later, provenance. Today those choices are switch statements in `daemon/internal/runner` (`runtime.go`, `probe.go`, and the shared normalizer in `events.go`). Milestone 1 introduces a registry and three adapters (Claude, Codex, fake) that call the existing functions. It does not add a CLI, change an argument, or change a probe.

The milestone text is the design input. No separate multi-provider design file is in this tree.

## Scope

In scope: `daemon/` (the registry, three adapters, dispatch through them, tests and golden fixtures), `docs/daemon.md` (one paragraph under Runtimes), and this packet. Out of scope: `kernel/`, `spec/`, `policies/`, `tests/redteam/`, `.github/`, `services/`, `apps/`, new CLIs, identity or attestation fields, wire schemas, sandbox policy, flags, the environment allowlist, and probe commands.

## Fixed inputs

The current `Command`, `LaunchFor`, `Probe`, `Detect` and `RuntimeFor` behavior, including error text. Golden launch fixtures in `daemon/internal/runner/testdata/launch-golden/` are the output of those functions before this refactor. `controlrod sandbox-args` output for the `sandbox_test.go` policy fixture is saved before and after under `evidence/`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Print-mode launch, probe and stream parsing are the whole per-runtime seam this milestone moves. | The functions named in the milestone, plus the per-runtime branches in preflight, staging and execute that would otherwise stay as switches on runtime names. | A caller that builds an agent command without `Command` or `LaunchFor`. |
| Delegating to `ClaudeArgs`, `CodexArgs`, `Normalize`, `TurnEnd`, `Probe` and `CopyFakeOutputs` preserves bytes. | Those functions stay, and the golden fixtures plus the existing runner tests compare the results. | A golden mismatch, or an edited assertion in the existing launch, sandbox, probe, events or runner tests. |
| `Capabilities` describes the adapter and decides nothing. | No production function reads it. | A later change that branches on `Capabilities` without its own record. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The registry is the only dispatch for `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe`. Golden launch output and `sandbox-args` output match the pre-refactor bytes. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
