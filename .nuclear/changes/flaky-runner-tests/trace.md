# Trace: Fix the flaky daemon runner tests in CI

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| FR-01 A run that exits at once is located in its collected scope. | `contain.go` `Locate`, `contain_linux.go` `exitedInRemovedScope` | `TestLocateFindsALeaderThatExitedInItsCollectedScope`; E-01, E-02 | implemented and tested |
| FR-04 A live process is never located through a removed-looking path. | same | `TestLocateRefusesALiveCgroupNamedLikeARemovedScope`, `TestParseCgroupKeepsTheKernelsText`; E-01 | implemented and tested |
| FR-02 Confirmation tests do not depend on the host's sleep. | `main_test.go`, `artifact_test.go` | E-03 | implemented and tested |
| FR-03 No new failure elsewhere. | none | E-04 | checked |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: a run whose process exits at once is located in its scope even after systemd has collected that scope, so it is not stopped as uncontained after five seconds; the runtime-confirmation tests launch a stand-in runtime that keeps running whatever the host's sleep is; the old failures reproduce on main and pass with the change, under load, with no new failure in the Go suite.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
