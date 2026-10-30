# Trace: overlay-theme planning

Date: 2026-10-25.

| Input | Resulting design decision | Location |
|---|---|---|
| User's initial interchangeable overlay request | One shared scene engine and swappable art descriptors | Design sections 1, 5 to 6 |
| Creature-workplace and small-helper worlds first, heist world next | Waves A and B; pilot three visual treatments | Catalog production waves; plan Task 9 |
| Confectionery, woodland-fantasy and café worlds, expansion to fifteen | All fifteen concrete art briefs and exact stable IDs | Catalog sections 1 to 15 |
| User wants strong recognizable inspiration and possible “inspired by” labels | Preserve explicit internal lineage and optional separately reviewed public factual notes | Design section 8; each catalog brief |
| User asks for full spec and plan | Documentation packet with proposed defaults and unchecked implementation tasks | Basis; implementation plan |
| User approves design and requests full execution, 2026-10-26 | Isolated native implementation, fifteen original art packs, technical checks and private runnable review bundle | Execution ledger; user guide; verification and ship records |
| Existing Floor/ROOMS/layout and StateMark | Extend `/floor`, use fixed canonical stations, retain plain/legacy fallback | Design sections 2 to 5; plan Tasks 2, 5, 7 |
| Existing per-package queries, 30 cap and `/runs` 200 limit | Explicit package paging and truthful coverage; do not use limited active endpoint as complete inventory | Design sections 2, 4; plan Tasks 2 to 3 |
| Existing run IDs and current-revision contracts | Stable per-run appearances, no fictional cross-run agent/person identity | Design section 4; plan Task 2 |
| Existing SSE invalidation and query timestamps | Reuse events, visible polling, stale freeze and no replay | Design sections 4 to 5; plan Tasks 3, 6 |
| AGENTS.md and permissive distribution rule | Change packet, no protected edits, distinct code/asset rights records | Design sections 7 to 8; plan Tasks 8, 13 |

## Review history

A fresh builder-context review read the engine design and complete catalog, with access to relevant source. Review result: **“nothing important left.”** This review asked for consequential unanswered questions; it was not product-code review, legal clearance, an accessibility audit or a performance test. The author separately reviewed the implementation plan's coverage, step specificity, type names and review-focus cases.

## Acceptance mapping

OT-01 through OT-15 and AC-01 through AC-15 are in design section 9. The plan's Requirement coverage table maps every requirement to implementation tasks and decisive planned checks. No implementation checkbox is checked by planning review.

[Basis](basis.md), [risk](risk.md), [plan](plan.md), [verification](verification.md), [ship posture](ship.md).


## Required links

[Basis](basis.md), [risk](risk.md), [plan](plan.md), [trace](trace.md), [execution](execution.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Fifteen original worlds are verified as observed, every review finding has a disposition, and the remaining human decisions (art and distribution review, DCO sign-off, merge) are named rather than implied.

## Source-lineage note

Workflow basis: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Adapted as a local engineering record, not a compliance certification.
