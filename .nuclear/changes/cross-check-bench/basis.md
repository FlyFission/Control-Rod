# Basis: cross-vendor checking benchmark

**Change slug:** `cross-check-bench`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23, rebuilt 2026-11-24 to design v3.3
**Decision this basis supports:** whether Control Rod may carry its own benchmark of author, same-model checker and cross-vendor checker, run by hand on real tasks, built to the agreed design `bench/cross-check/DESIGN.md` v3.3.

## Mission / need

The README's research section (PR #152) ties Control Rod's independent check to published results, and says plainly that no study measures one vendor's coding agent reviewing another vendor's code. The owner asked (2026-11-23, project thread) to send major updates through a repeatable run and get output he can share honestly ("open source, free, try it today"). The owner then asked (2026-11-24) that the design be agreed with Antigravity on Neon and Codex on Astra before anything runs; DESIGN.md v3.3 is that agreement, with the owner's decisions: $0 extra spend, adjudication of discordant rejections only, A4 omitted. The owner said go for the rebuild. This change makes no claim about any result: no model call has been made.

## Scope

In scope: `bench/cross-check/` (the script, configs, prompts, fixture tasks, tests, README), a `bench` subcommand in `scripts/cr.mjs` that calls it, and this packet.

Out of scope: `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`, the daemon and the control plane. The benchmark calls the agent CLIs directly; it does not go through Control Rod's dispatch, so it measures the checking pattern, not this build's kernel.

## Fixed inputs

- Design: `bench/cross-check/DESIGN.md` v3.3 (agreed, four review rounds).
- Task source: a local snapshot file, validated and digest-pinned (`configs/verified-historical.json`: SWE-bench Verified hard tiers, labelled historical). Not vendored.
- Evaluation: the SWE-bench harness (MIT), version pinned in the config, run in Docker through `uv`.
- Agents: `claude` and `codex` CLIs, the two that run work in Control Rod today, on existing subscription sign-ins. Models in `bench/cross-check/agents.json`.
- Isolation flags mirror `daemon/internal/runner` and are listed in `crbench/agents.py`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Hidden tests are a usable reference for "resolved". | SWE-bench design; tasks are audited and can be struck before any call. | A task struck after any call, or a report that treats resolved as mergeable. |
| One author patch judged by both checkers isolates the checker's effect. | Both checkers receive the same patch, verified by SHA-256 digest. | A digest mismatch (refused by `score`). |
| The checker sees the issue and the diff only. | Prompt template; opaque workspace with a single synthetic commit. | A checker prompt holding author output, or a probe that reads outside its tree. |
| Subscription sign-in costs nothing extra. | `preflight` verifies the route and refuses billing keys. | Any API-key or paid route in preflight. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` implements DESIGN.md v3.3: a frozen protocol, calibration then sizing then phase 1, isolated single-commit workspaces with isolated sign-in, matched capabilities, the failure taxonomy, grading by test ID with controls, a blind adjudication queue built before evaluation, the frozen statistics, and a release gate. Every step is started by hand and refuses to run out of order. Subscription billing is verified before any call; no API key is used. The offline tests pass with no network and no model calls. Nothing runs on the owner's Mac until the owner says go for calibration.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
