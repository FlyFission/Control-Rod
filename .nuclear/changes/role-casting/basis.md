# Basis: role casting design spec

**Change slug:** `role-casting`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-16
**Decision this basis supports:** whether the design spec `docs/superpowers/specs/2026-11-16-role-casting-design.md` and ADR 0023 (Proposed) are accepted as the target for a sliced build of per-role model casting in Software and Capital Projects modes. This change is the spec, the ADR draft and a pattern note only; no product code.

## Mission / need

The owner asked (2026-11-16) to pick the best available model for each job in Control Rod, within the agent CLIs it runs and the models they can reach, with separate job sets for software engineering and capital project engineering, prompted by a public talk on domain-specific agents. Today the author runtime is chosen by a fixed order (`pickRuntime`), with the CLI build pinned per runtime and role, and the checker by another fixed order (`pickChecker`), both in `services/api/src/work.ts`. There is no record of why a model holds a role and no way to compare candidates.

## Scope

In scope: the design spec, ADR 0023 as Proposed, `docs/patterns/standard-agents.md`, index entries in `docs/README.md` and `docs/patterns/README.md`, and this change record. Out of scope: any change to `kernel/`, `spec/`, `policies/`, `tests/redteam/`, `.github/`, `daemon/`, `services/`, `apps/` or `packs/`.

## Fixed inputs

| Input | Where |
|---|---|
| Multi-provider design plan, including its non-goal cutting an editable strengths matrix and any learning loop, and the accepted M0 decisions | `docs/plan/multi-provider-design-plan.md`, `docs/plan/HANDOFF.md` |
| ADR 0015 (modes), ADR 0020 (print-mode runs), ADR 0021 (CLI login and native sandboxes) | `docs/adr/` |
| Review panel design (seats, Stage 1 anchoring, Stage 2 refutation) | `docs/superpowers/specs/2026-11-06-review-panel-design.md` |
| Domain deliverables (DN-01 to DN-06) | `docs/superpowers/specs/2026-10-23-domain-deliverables-design.md` |
| Ontology roles, baselines and pins | `spec/records.tsp` (`AgentBaseline`, `AgentAssignment`; `AgentRole` is named in the ontology design but is not yet a contract), `spec/workbench.tsp` (`RuntimePin`), `spec/work.tsp` (`RunRole`) |
| Today's model flags and attestation | `daemon/internal/runner/runtime.go` (`ClaudeArgs`, `CodexArgs`), `daemon/internal/runner/attest.go` (`argvModel`) |
| The talk that prompted the request | Public coverage only; see `docs/patterns/standard-agents.md` provenance |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The plan's cut of a strengths matrix and learning loop can be amended to allow a static, signed casting sheet informed by trials, under the permitted uses in spec section 2. This is an amendment, not a reading inside the cut (all three reviews, 2026-11-18). The owner chose to amend for every role, with checker guardrails (C-1, 2026-11-18). | Spec sections 2 and 15. | The owner returns ADR 0023 or reverses C-1. |
| Version zero of the sheet can reproduce today's author, intake and checker choices exactly. | `pickRuntime` and `pickChecker` in `services/api/src/work.ts` are pure orders plus the override rule, applied after lane admission, runtime pins, the sandbox network filter, package status and the sticky pre-check gate, with budget holding the run afterwards. Version zero keeps all of those as they are and moves only the two orders into the sheet. | A choice today depends on state the sheet cannot express. |
| A model can be passed per run through the existing adapters; effort cannot yet. | `ClaudeArgs` passes `--model` and `CodexArgs` passes `-m`, and `argvModel` reads only those; no adapter passes an effort setting (Grok review GK-9, verified). Effort is added per CLI only after a flag is shown to work as a counted argument. | A qualified CLI cannot be launched with a chosen model headless, or effort cannot be passed in a way attestation reads. |
| Most trial measures can be scored by scripts over structured outputs and answer keys; the rest are labelled human-graded, graded blind and attributed, and never scored by a model. | Spec section 9 (revised after CX-9, AG-6, GK-6). | A measure that can be scored neither by a script nor by a person without a model judge. |
| The talk's ideas are described accurately enough to borrow from. | Public listing and press coverage; the video could not be retrieved here. | A reading of the talk contradicts the pattern note. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
