# Basis: Wave 2 multi-CLI adapters

**Change slug:** `wave2-multi-cli-adapters`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether `feat/wave2-multi-cli-assurance` (PR #84) is merged.

## Mission / need

The owner wants Claude Code, Codex, Antigravity, OpenCode and Grok CLI, plus user-named local models, under one roof. This branch registers daemon adapters for Grok CLI, OpenCode, Antigravity and Ollama, adds an egress allowlist filter (not yet wired; wave 4 wires it), and adds API helpers for disclosure, checker families and attestation.

As first written, the four new adapters built a bare process that ignored the run's sandbox policy, and their capabilities claimed an outer sandbox that does not exist. Control Rod confines Claude Code and Codex by configuring each CLI's own sandbox from the run's policy (ADR 0021); nothing did that for the new four. A run on any of them would have reached the whole machine. This record covers the fix: the four are listed but refused until each has its confinement built and qualified under its own change record.

## Scope

In scope: `daemon/internal/runner` (the four adapters, `adapter.go`, `runtime.go`, `sandbox.go`, `egress_proxy.go`, tests), `services/api/src/{disclosure,runtimes,run-attestation}.ts` and `test/wave2-assurance.test.ts`, and this packet. Out of scope: kernel, policies, red-team fixtures, workflows and spec.

## Fixed inputs

ADR 0021 (no agent CLI starts without the run's verified sandbox). ADR 0014 (local models go through a gateway that pins the endpoint). The plan's floor that proprietary and stricter lanes are local only.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Every launch passes `PreflightHost` (daemon start and scheduled probe) and then `Command`. | `daemon.go` calls `PreflightHost` before the launch; `runtime.go` `Command` is the only launcher. | A new launch path that skips either. |
| `ollama run <model>` can reach a hosted model. | Ollama's cloud model names run remotely through the local CLI. | Ollama removes hosted models from `run`. |
| OpenCode's model vendor comes from its own configuration, not from the runtime. | OpenCode routes to any provider it is configured for. | None expected. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Grok CLI, OpenCode, Antigravity and Ollama are registered and can be detected and probed, but every path that would start one refuses it with the reason it cannot yet be confined; none is pinnable; Ollama is not treated as local; a runtime with no fixed vendor never counts as a distinct checker family; the evidence is retained in this packet; and the owner has made the merge decision. Nothing here claims any of the four can do or check work.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
