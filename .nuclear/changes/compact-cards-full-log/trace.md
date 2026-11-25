# Trace: Compact cards, a full-screen run log, and splits explained

| Need | Code | Test |
| --- | --- | --- |
| Compact is one line | `apps/web/src/features/board/Card.tsx` compact branch, `board.css` .bd-card-compact | `board.test.tsx` "shrinks a card to its name and a status mark in compact density" |
| Readable run log | `apps/web/src/components/RunLog.tsx` LogViewer, `styles.css` .log-viewer | `components.test.tsx` "opens the whole log full screen, filters it and keeps every line" |
| Splits explained | `apps/web/src/features/board/useBoardData.ts` splitsOf, `Card.tsx` .bd-split | `quick-add.test.tsx` "gives way to the package cards once intake lists package ids", "says nothing about a split when a request became one card" |
| Fewer splits | `packs/general/roles/intake.md`, `packs/software/feature/roles/intake.md` | wording only; `services/api/test/intake-brief.test.ts` still passes |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A compact card is one line: a status mark and its name. A run log opens full screen with every line, a filter and copy. A card drafted from a request that became several cards says "Card N of M from one request" with the request. Intake keeps one card unless the work truly splits. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
