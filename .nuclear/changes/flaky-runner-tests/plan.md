# Plan: Fix the flaky daemon runner tests in CI

1. Read the failing CI jobs (runs 45518448195 and 45520690755) and the code behind each message (`Locate` in `contain.go`, `confirm` in `artifact.go`).
2. Reproduce each failure exactly: a zombie in a removed cgroup for `Locate`; a multi-call stand-in `sleep` under CPU load for `Confirm`.
3. Fix `cgroupOf`; give the confirmation tests their own runtime.
4. Stress the touched tests under load, run the whole Go suite against main, draft PR, Codex blind check.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: a run whose process exits at once is located in its scope even after systemd has collected that scope, so it is not stopped as uncontained after five seconds; the runtime-confirmation tests launch a stand-in runtime that keeps running whatever the host's sleep is; the old failures reproduce on main and pass with the change, under load, with no new failure in the Go suite.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
