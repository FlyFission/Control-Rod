# Plan: per-card Context Light / Nuclear toggle

1. Contract fields, migration 024, board ContextSwitch and Nuclear badge (269636b).
2. Composer in `context-profile.ts`, wired into `buildJob`, tested against a fixture pack (6c44c27).
3. Generated pack, generator with `--check`, token counter, `scripts/` workspace package (26f92ab).
4. Integrate: compose from the real pack (api test), align the web mirror with the server rule, move BRIEF.md assembly into pure `brief.ts`, measure Light and Nuclear briefs into `budgets.json` with a budget test, keep `budgets.json` across regeneration.
5. Merge the two earlier records into this one; validate it with the validator CI pins.
6. Run typecheck, `pnpm -r run test`, pack `--check`, budget `--check`, register and other repository checks, and spec regeneration with no diff.
7. Ask Ben Huffer for a recorded yes on the `spec/` change before merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md), [provenance](provenance.md).

## Exit criteria

CT-01 to CT-08 are implemented and tested; Light briefs are byte for byte unchanged; the composer loads the real pack; every measured brief is within its budget; the owner's recorded yes for the `spec/` change is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
