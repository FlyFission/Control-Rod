# Quick Proof: one SCRAM button with a beacon lamp

## Proof summary

- Change slug: scram-switch
- Proof owner: Ben Huffer (review pending); checks run by Claude Code on 2026-11-24
- Risk record: [`risk.md`](risk.md)

## Claim proven

The top bar shows one SCRAM button with a lamp beside it and a hover card; SCRAM behaviour is unchanged.

## Method and results

| Check | Result |
|---|---|
| `pnpm --filter @control-rod/web exec vitest run` (85 files, 931 tests), including new assertions in `shell-scram.test.tsx` and `shell-phone.test.tsx` | pass |
| Codex blind review round 1 (gpt-6.2-sol, read-only) | FAIL: 3 major, 3 minor; all fixed in round 2 (below) |
| Round 2 fixes: the card says "stopping" until the control plane records the stop; Restart opens the real SCRAM before any drill; no Restart and no clear lamp after a failed read; a hover bridge and a document-level Escape for the card; review scrolled to centre so a sticky phone bar cannot cover it | 5 new tests; 4 of them fail against the round 1 `Shell.tsx` (failed-first) |
| Codex blind review round 2 | all six round 1 findings FIXED; new: 2 major, 2 minor |
| Round 3 fixes: Restart opens the organization SCRAM before a project one, then any trip, then a drill; copy says agents stop at their next heartbeat and that a restart is signed, scoped (all, discipline, package) and can be refused; a stale held reading says it may be out of date; Escape dismisses only an open card | 1 new test and 3 tightened; 4 fail against the round 2 `Shell.tsx` and `ScramSwitch.tsx` (failed-first) |
| `pnpm --filter @control-rod/web typecheck` | pass |
| Chromium screenshots of clear, trip, drill and phone against recorded fixtures | lamp states as specified; card above the SCRAM banner |
| Chromium with reduced motion: computed `animation-name` of the lit lamp | `none` |
| Restart while tripped opens and focuses the banner's "Review and restart" | pass |
| `ng.py validate --strict-custody` on this packet | run in CI |

Not tested: Safari and Firefox rendering of the conic-gradient bezel; screen reader output beyond the accessible names asserted in tests.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
