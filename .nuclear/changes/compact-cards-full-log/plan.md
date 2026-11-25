# Plan: Compact cards, a full-screen run log, and splits explained

1. Compact card branch in `Card.tsx` and its CSS; fold limit by density in `BoardView.tsx`.
2. `LogViewer` in `components/RunLog.tsx` and its CSS.
3. `splitsOf` in `useBoardData.ts`, passed to each card.
4. Intake brief and software feature guidance wording.
5. Tests, typecheck, draft PR, Codex blind check, owner yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A compact card is one line: a status mark and its name. A run log opens full screen with every line, a filter and copy. A card drafted from a request that became several cards says "Card N of M from one request" with the request. Intake keeps one card unless the work truly splits. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
