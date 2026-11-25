# Quick Proof: innocent until proven guilty

## Proof summary

- Change slug: innocent-until-proven
- Proof owner: Ben Huffer (review pending); checks run by Claude Code on 2026-11-25
- Risk record: [`risk.md`](risk.md)

## Claim proven

Every note box can be signed empty and sends its fallback; projects save with one CLI for both roles; the daemon fixes its own loose staging folder and still refuses a link.

## Method and results

| Check | Result |
|---|---|
| `vitest run` in apps/web (95 files, 1,042 tests), including new `src/lib/notes.test.ts` | pass |
| `pnpm typecheck` in apps/web; `tsc --noEmit` in services/api | pass |
| `go test ./internal/runner -run TestStagedRuntimes` | pass |
| `vitest run test/refusals.test.ts` in services/api | pass |
| `ng.py validate --strict-custody` on this packet | run in CI |

Not tested: Postgres-backed API tests (run in CI); the project dialog notice on a real device.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
