# Risk: Fix the flaky daemon runner tests in CI

- **Mode:** Standard
- Execution owner: Claude (project thread "Fix the flaky daemon tests in CI").
- Decision owner: Ben Huffer. No trust surface is edited.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Accepting a removed cgroup lets a process outside the run's scope pass as contained. | Only an exited leader is accepted this way, and the receipt then names the scope's own place, not the path read from /proc; a live process in a cgroup literally named like a removed scope is refused (test). `cgroupOf` and `signalPinned` stay exact. | A live process located through a " (deleted)" path. |
| R-04 | A removed scope's path is later reused by another cgroup, which the receipt then treats as the run's. | Unchanged from main: unit names are deterministic per daemon namespace, run and generation, and main already records this path for a leader that exited before it was seen. A same-user process that creates cgroups at will is the hostile same-user case the threat model leaves to Phase 6. | A second scope under this run's unit name. |
| R-02 | The stand-in runtime hides a real confirmation bug. | The tests still launch through the descriptor and check the same things (exe identity, ETXTBSY, lease); only the binary changed, and `TestConfirmFailsClosedWhenTheProcessNeverRunsTheRuntime` still uses a different program. | A confirmation test that no longer fails on main's bug. |
| R-03 | The new `Locate` test is itself flaky. | It waits for the zombie and for the kernel to count the cgroup empty before removing it; 300 runs under load pass. | Any failure in stress. |

## Selected mode

- **Mode:** Standard
- Basis: one-line production change in containment lookup plus test changes; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: a run whose process exits at once is located in its scope even after systemd has collected that scope, so it is not stopped as uncontained after five seconds; the runtime-confirmation tests launch a stand-in runtime that keeps running whatever the host's sleep is; the old failures reproduce on main and pass with the change, under load, with no new failure in the Go suite.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
