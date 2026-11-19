# Basis: anchored notes and plan approval

**Change slug:** `plan-approval-and-anchors`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-18
**Decision this basis supports:** whether to accept two items from the Plannotator pattern note (`docs/patterns/plannotator.md`):
- PL3: an anchor contract and a deterministic check, for notes and findings;
- PL4: a spike on plan approval in print-mode runs, and a design based on what it found.

## Mission / need

- **PL3.** The review panel's Stage 1 needs a deterministic check that a finding points at text that is really there (review panel design 6.3, slice R3). A person's notes on a plan or a deliverable need the same anchors. `Comment.locator` in `spec/workbench.tsp` is a free string with no checkable scheme.
- **PL4.** The pattern note left open whether Plannotator's plan hook works in Control Rod's headless runs. The answer decides the design.

## Scope

In scope:
- `spec/anchors.tsp` and its generated schemas;
- `services/api/src/anchors.ts` and `services/api/test/anchors.test.ts`;
- the spike evidence;
- `docs/superpowers/specs/2026-11-18-plan-approval-design.md`;
- the PL3 and PL4 rows of the pattern note and a line in `docs/README.md`.

Out of scope:
- routes, migrations or web views for anchors;
- any change to `Comment`;
- any daemon, kernel, policy or workflow change;
- building any part of the plan approval design.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Start PL3 and PL4. | "start PL3 and PL4" | 2026-11-18, Claude Code session for this pull request | Build the anchor contract and check; run the PL4 spike and write a design. | Routes, tables or views; any daemon or kernel change. |
| D2 | PL3 lands as a contract and a pure check with no route; review panel R3 and a later plan review slice will use it. | none: authoring agent's choice, open to the owner | 2026-11-18, this record | As stated. | Any route, migration or view. |
| D3 | PL4 stops at a spike and a design. Building it touches the daemon's agent authority and possibly a kernel floor, each gated. | none: authoring agent's choice, open to the owner | 2026-11-18, this record | As stated. | Building any slice of the design. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The four location types and their checks are the ones the review panel design names. | Review panel design 6.3, Stage 1 table. | The owner changes the Stage 1 table. |
| Adding models to `spec/` is a minor, additive change that the owner approves as a contract. | Review panel design section 7; AGENTS rule 2 gates major versions only. | The owner treats any `spec/` addition as needing a signature. |
| Spike results hold for the daemon's pinned Claude Code. | One run each on 2.1.327, Linux, under this session's login; the daemon checks 2.1.318. | A qualification run on the pinned version or another platform behaves differently. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The anchor contract regenerates with no drift, the anchor check passes its tests and fails each planted fault, the print-mode hook spike is recorded, the plan approval design is written, and the owner has reviewed all three.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
