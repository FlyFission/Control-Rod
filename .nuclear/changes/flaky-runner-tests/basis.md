# Basis: Fix the flaky daemon runner tests in CI

**Change slug:** `flaky-runner-tests`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

On 2026-11-24 the Go job failed at random on PRs that did not touch Go (#181, #191, #192): each time a different daemon test with `process N never entered scope controlrod-run-…`, and once `TestAWriteBetweenCheckAndStartIsBlockedAndCaught` with `the run's process was never seen executing the verified runtime`. They passed on re-run.

## Root causes

1. **Production bug (cgroup containment).** `Locate` waits for the run's leader to appear in its systemd scope by reading `/proc/<pid>/cgroup`. The leader is held unreaped until the receipt step. A run that exits at once (the checkout tests run a three-line shell script) leaves a zombie in an empty scope, and `systemd-run --collect` removes that scope. The kernel then prints the zombie's cgroup as `…/controlrod-run-…-g1.scope (deleted)`, so the suffix match failed, and since a zombie still exists to `kill(pid, 0)`, `Locate` spun for its full five seconds and the run was stopped as "could not be owned". CI failed at 5.09 s; the reproduction fails at 5.02 s. Only GitHub's runners have a user systemd, so this never showed locally. On a real install the same race could fail any very short run.
2. **Test fragility (runtime confirmation).** The confirmation tests copied the host's `sleep` and launched it through its descriptor, so its argv[0] is `/proc/self/fd/3`. The runners are Ubuntu 26.04, whose coreutils is most likely a multi-call build that picks the tool from argv[0] (inferred, not verified on the runner): it then exits at once, and the test only passes when `Confirm` looks before it exits. Under load it loses and waits out its ten seconds (CI: 10.03 s). The checker path is not affected, because it names the mounted runtime by its own path.

## Proposal

1. `cgroupOf` drops the kernel's ` (deleted)` suffix (`parseCgroup`). Only a process with no live tasks left can be in a removed cgroup, so this is still the scope the leader entered; the existing "exited, so the scope holds nothing" handling then applies.
2. Tests: `TestMain` makes the test binary a stand-in runtime that sleeps when `CONTROLROD_TEST_HELPER_SLEEP=1`; `verifiedCopy` copies the test binary and `sleepRuntime` launches it. No retries, skips or longer timeouts.
3. Regression tests: `parseCgroup` on a removed, a live and a missing cgroup line; `Locate` on a leader that exited inside a cgroup that was then removed (needs root and a writable cgroup v2 hierarchy; skipped on GitHub's runners, run in the cloud container).

## Out of scope

- `spec/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`: untouched.
- `TestVerifiedLaunchRunsTheCheckedBytesEvenAfterTheFileIsReplaced` still copies the host's `true` and `false`; on a multi-call coreutils it passes without proving much. Follow-up.
- Author runs keep argv[0] = `/proc/self/fd/N`; an agent CLI that dispatches on its own name would need the checker's approach. None of the built-in agents do.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: a run whose process exits at once is located in its scope even after systemd has collected that scope, so it is not stopped as uncontained after five seconds; the runtime-confirmation tests launch a stand-in runtime that keeps running whatever the host's sleep is; the old failures reproduce on main and pass with the change, under load, with no new failure in the Go suite.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
