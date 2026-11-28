# Plan: Typed failure reasons and one safe retry for author runs

1. Spec enum and fields; regenerate.
2. Daemon `failKind` with a table test (`failkind_test.go`).
3. API: store the kind; extend `retryFailedRun`; tests in `test/signing-policy.test.ts` (retry once, never twice; no retry for timeout, breaker, an unplaced error or no containment; an unknown kind is refused); the existing restart and failed-check tests pass unchanged.
4. Typecheck, related suites, PR, blind review (at most two rounds), merge on green under the owner's merge-on-green permission (to 2026-12-02).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every failed run the daemon can place carries a fixed failure kind, taken from the daemon's own error values. An author run whose agent quit with an error, or that the daemon stopped after losing contact, runs again once on its own under a signing policy that lets cards run. That holds only when the daemon accounted for its processes. Every other failure stops for the person as before. API and Go tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
