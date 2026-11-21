# Plan: Nuclear context in agent briefs

1. Write `context-profile.ts`: resolution, cluster table, pack loader, brief sections.
2. Wire it into `buildJob` for author and pre-check before Rules; record `run.context-profile` for Nuclear runs.
3. Unit tests with a fixture pack (`services/api/test/fixtures/nuclear-grade/`); end-to-end brief tests through the claim path.
4. Run the touched tests and the api suite; typecheck.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

NC-01 to NC-04 are implemented and tested; Light briefs are byte for byte unchanged; the api typecheck passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
