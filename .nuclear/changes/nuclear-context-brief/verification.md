# Verification: Nuclear context in agent briefs

Evidence status: **pass** on this host (Linux, PostgreSQL 17.10 embedded binaries run as a separate local server through `TEST_DATABASE_URL`).

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | `context-profile.test.ts` and `context-profile-brief.test.ts`: 26 tests pass. Fixture pack, not the real pack. | `evidence/touched-tests.log` |
| E-02 | pass | Whole api suite: 774 pass, 2 skipped; 2 failures in `command-boundary.test.ts` expect an owner role named `controlrod` that the local test server (superuser `postgres`) does not have; unrelated to this change. | `evidence/full-suite-summary.log` |
| E-03 | pass | `pnpm --filter @control-rod/api typecheck` exits 0. | this record |

No independent review was done.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

NC-01 to NC-04 are implemented and tested; Light briefs are byte for byte unchanged; the api typecheck passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
