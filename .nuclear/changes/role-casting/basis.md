# Basis: role casting design spec

**Change slug:** `role-casting`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-16
**Decision this basis supports:** whether the design spec `docs/superpowers/specs/2026-11-16-role-casting-design.md` and ADR 0023 (Proposed) are accepted as the target for a sliced build of per-role model casting in Software and Capital Projects modes. This change is the spec, the ADR draft and a pattern note only; no product code.

## Mission / need

The owner asked (2026-11-16) to pick the best available model for each job in Control Rod, within the agent CLIs it runs and the models they can reach, with separate job sets for software engineering and capital project engineering, prompted by a public talk on domain-specific agents. Today the author runtime is chosen by a fixed order with per-role pins (`pickRuntime`) and the checker by another fixed order (`pickChecker`), both in `services/api/src/work.ts`. There is no record of why a model holds a role and no way to compare candidates.

## Scope

In scope: the design spec, ADR 0023 as Proposed, `docs/patterns/standard-agents.md`, index entries in `docs/README.md` and `docs/patterns/README.md`, and this change record. Out of scope: any change to `kernel/`, `spec/`, `policies/`, `tests/redteam/`, `.github/`, `daemon/`, `services/`, `apps/` or `packs/`.

## Fixed inputs

| Input | Where |
|---|---|
| Multi-provider design plan, including its non-goal cutting an editable strengths matrix and any learning loop, and the accepted M0 decisions | `docs/plan/multi-provider-design-plan.md`, `docs/plan/HANDOFF.md` |
| ADR 0015 (modes), ADR 0020 (print-mode runs), ADR 0021 (CLI login and native sandboxes) | `docs/adr/` |
| Review panel design (seats, Stage 1 anchoring, Stage 2 refutation) | `docs/superpowers/specs/2026-11-06-review-panel-design.md` |
| Domain deliverables (DN-01 to DN-06) | `docs/superpowers/specs/2026-10-23-domain-deliverables-design.md` |
| Ontology roles, baselines and pins | `spec/records.tsp` (`AgentRole`, `AgentBaseline`), `spec/workbench.tsp` (`RuntimePin`), `spec/work.tsp` (`RunRole`) |
| The talk that prompted the request | Public coverage only; see `docs/patterns/standard-agents.md` provenance |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| A static, signed casting sheet with reported (not applied) trial results is within the spirit of the plan's cut of a strengths matrix and learning loop. | Spec section 2. | The owner answers C-1 no; the spec then narrows to checkers only, as the plan has it. |
| Version zero of the sheet can reproduce today's author and checker choices exactly. | `pickRuntime` and `pickChecker` in `services/api/src/work.ts` are pure orders plus the override rule. | A choice today depends on state the sheet cannot express. |
| Model and effort can be passed per run through the existing adapters. | The adapter seam (M1) and today's model argument (ADR 0020 trace). | A qualified CLI cannot be launched with a chosen model headless. |
| Trial scores can be produced by scripts alone for every duty except plan quality, where an owner edit distance is recorded by the owner. | Spec section 9. | A duty whose score needs a model judge. |
| The talk's ideas are described accurately enough to borrow from. | Public listing and press coverage; the video could not be retrieved here. | A reading of the talk contradicts the pattern note. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
