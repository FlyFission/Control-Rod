# Basis: guided work-package preparation

- Owner: Ben Huffer (proposed)
- Date: 2026-10-22
- Status: proposed design; documentation only.
- Decision question: how can Control Rod help users define the right work without letting preparation agents control acceptance or release?

## Protected outcomes

1. A user can resume a saved draft and distinguish their decisions from agent suggestions.
2. Requirements and the technical approach can be reviewed separately.
3. A released package binds to the exact preparation content and input versions reviewed.
4. Missing evidence, stale inputs and unresolved blockers remain visible and prevent normal progression.
5. Existing MVP release, return, checker independence and recorded exception semantics remain explicit.

## Baseline and constraints

Merged main: `40763d4153eabd542d0c7ef028b8aab5de8d6522`.
Integration target: open PR #3 at `26e3da117773731aaa3e24cb29c48cab26ba445b` (observed 2026-10-22; not merged or certified here). Local reference: `origin/planning-pr3`.
PR #4 at `ba32feeb4e786d88b8aa23460689b3b72974133c` is context for the workbench direction, not a prerequisite for this feature.

The user endorsed the preceding comparison and requested systematic planning and specification. The six recommendations are the scope anchor. Details in the design are proposed implementation choices, not previously approved product decisions.

The one fact that could materially change this design: the full Platform Plan may prescribe a different requirements or approval model. It is referenced but not present in the inspected repository; reconcile it at implementation entry, without blocking this reviewable proposal.

## Specification

Requirements GP-01 through GP-18 and acceptance scenarios AC-01 through AC-18 are defined in [the design](../../../docs/superpowers/specs/2026-10-22-guided-preparation-design.md). All implementation behavior is planned. The [implementation plan](../../../docs/superpowers/plans/2026-10-22-guided-preparation.md) assigns each requirement to a task and test seam.

## Required links

[Risk](risk.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The reviewable specification defines all eighteen requirements and their proposed acceptance scenarios; implementation claims remain planned.

## Source-lineage note

Conceptual inspiration: [Srijith Rajamohan's two-agent specification pipeline](https://srijithr.gitlab.io/post/product-spec-to-execution/). This is an original adaptation of workflow ideas; no external prompts or code are copied. No compliance or formal assurance claim is made.
