# Ship: Nuclear context in agent briefs

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge together with the parallel spec (profile fields) and pack (`packs/nuclear-grade/`) changes.
- **Not claimed:** behavior against the real pack; tests use a fixture with the agreed manifest shape.

Rollback: revert the commit. Server only; Light work is unaffected either way.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

NC-01 to NC-04 are implemented and tested; Light briefs are byte for byte unchanged; the api typecheck passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
