# Quick Proof: work lanes

## Proof summary

- Change slug: work-lanes
- Proof owner: Ben Huffer (review pending); checks run by Claude Code
- Risk record: [`risk.md`](risk.md)

## Claim proven

Work lanes place work and name the Plant's six bays by project; the checks below passed where marked, and the database-backed API tests were not run in this session.

## Method and results

| Check | Result |
|---|---|
| `pnpm spec` regenerates with the committed output | pass |
| `cd apps/web && pnpm -s vitest run` | pass: 72 files, 780 tests (baseline 70 / 768; new `lanes.test.tsx`, `work-lanes-setting.test.tsx`) |
| `tsc --noEmit` for apps/web and services/api | pass |
| `services/api` `test/work-lanes.test.ts` (pure: presets, validation, tag > paths > keywords > default, capital-project parity with `cubeFor`, setup detection) | pass: 17 tests |
| `test/migration-lock.test.ts` with 027 locked | pass |
| API database tests (`figures.test.ts` lane placement, `admin.test.ts` storage, proposal and legacy default, migration preservation) | gap: written, not run here; no PostgreSQL 17 in this environment, CI runs them |
| CI fix: `WORK_LANES_DOWN_SQL` added to the down-migration lists in `tenancy.test.ts` and `workbench.test.ts` (the two places 026 was listed that 027 was not); `pathMatches` wildcard directory patterns | pass: `work-lanes.test.ts` 18 tests (new: `apps/*/src/`, `**/migrations/`, `docs/`, exact-file glob) |
| API database tests on a local PostgreSQL 16 via `TEST_DATABASE_URL` (tenancy, workbench, dependencies, admin) | pass: 133 tests. Full API suite: 27 failures, all in controller-grant tests that require PostgreSQL 17 ("Controller grants require PostgreSQL 17 or newer"); the same run before the fix had 41 failures. Not a substitute for CI on PG17 |
| Screenshot, Plant with the Software preset, 1440x900 at 2x | pass: bays read Frontend, Backend, Platform, Data, Tests, Docs; `/mnt/project-files/control-rod/lanes/plant-software.png` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
