# Basis: control room redesign

**Change slug:** `control-room-redesign`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24

## Mission / need

Three visual rounds on the Plant view ended at about the same look. The owner asked for an ambitious, intentional redesign built against the reference board in `design/references/`, planned carefully, graded blind by three reviewers, then built and checked against the plan before merge.

## Owner decisions

| Decision | Owner's words | Where | When |
|---|---|---|---|
| Plan, grade blind, iterate, build, review against the plan | "Run your plan by claude, AGY, and codex CLI and have it graded using a set of criteria each of them come up with independently, then iterate your plan 1-2 times until you're happy. Then when you're done, have sonnet subagents execute it. then have AGY/Codex review it at the end prior to PR merge against original plan to ensure everything translated." | Project thread | 2026-11-24 |
| Art from his existing image accounts | Chose "Your existing AI image accounts" on the art-route card | Project thread | 2026-11-24 01:58 UTC |
| Art direction B | Chose "B Engineering cutaway" on the direction card | Project thread | 2026-11-24 02:28 UTC |
| Use subagents with Claude orchestrating | "yes, do it with as many subagents as makes sense with you orchestrating to keep context light" | Project thread | 2026-11-24 |
| Fix the polar crane before freezing the concept | "It's a little distracting, so let's just fix that before we freeze a concept. And it's much too low to the reactor. It's right there on it." | Project thread | 2026-11-24 17:45 UTC |

## Scope

The plan in `docs/superpowers/specs/2026-11-24-control-room-redesign.md`, sections 5 and 9. This record opens with the plan; code lands step by step on the same PR.

## Fixed inputs

`design/references/README.md`, `design/references/screens.md`, and the plan's three grading rounds.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

Every row of the plan's trace table (section 11) passes its scripted check and the critic, or is marked deferred with its reason; Antigravity and Codex review the result against the plan; the owner keeps the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
