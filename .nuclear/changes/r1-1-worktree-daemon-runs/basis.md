# Basis: bind materialized worktrees to author runs

**Date:** 2026-11-22

Plan row R1.1 continues Cycle 2 of [wave1-hardened-worktrees](../wave1-hardened-worktrees/basis.md). [Issue #118](https://github.com/FlyFission/Control-Rod/issues/118) identifies capture-text workspace hints and silent execution fallback as the gap. This packet covers worktree and branch binding; selected runtime/model/reasoning binding remains outside R1.1.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
| --- | --- | --- | --- | --- | --- |
| D1 | Start R1.1 | "Start release 1 with R1.1." | 2026-11-22, owner-provided Codex handoff in this conversation | Implement typed checkout binding and daemon execution. | Merge, acceptance, protected-path edits, runtime selection binding, later rows. |

## Inputs and scope

Read `AGENTS.md`, `docs/README.md`, `docs/status.md`, `docs/collaboration.md`, the Wave 1 packet, and the Cycle 1 hardening design sections on materialization and deferred binding. Implementation paths: additive `spec/api.tsp` and `spec/work.tsp`, their regenerated outputs, `services/api/src/{app,work,repos}.ts`, `daemon/internal/runner/`, and `apps/web/src/components/NewWorkModal.tsx` and their relevant tests.

The recorded checkout must be validated at capture and checked again on the daemon. Intake and blind checker never inherit author checkout access. Missing, changed, unsafe, busy or unavailable checkouts fail closed. Historical captures without a typed binding retain their current behavior; text headers never grant filesystem access.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Author evidence proves checkout and branch binding, rejection without fallback, and checker separation. Independent different-vendor checker and Ben's acceptance remain required.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
