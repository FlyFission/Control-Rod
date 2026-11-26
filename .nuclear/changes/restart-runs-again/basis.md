# Basis: A run Control Rod stopped to restart runs again on its own

**Change slug:** `restart-runs-again`
**Owner:** Ben Huffer
**Date:** 2026-11-26
**Status:** Built; merged under the owner's standing merge-on-green yes (2026-11-25, seven days).

## Mission / need

Driving three issue cards on the owner's Mac (Sonnet writes, Haiku checks), a `controlrod update` restarted the daemon mid-run. The two checks came back on their own (the once-only check retry from #221), but the author run (B44DFF3A-DOCTOR-EXIT, R-874b210a, error "daemon shutdown") stayed failed and needed a press. Root cause: `retryFailedCheck` covered only pre-checks and only first attempts; a run the daemon stops itself is never the work's fault.

## Proposal

`retryFailedRun` (was `retryFailedCheck`): also retries an author run whose error is the daemon's own "daemon shutdown", and retries any run stopped that way every time (not once per chain), under the same signed policy (release "auto"), settling an unknown outcome first with a reason naming the policy. Other author failures still stop for the person. Also: the board card's icon for a run not yet assigned reads "The first free agent does the work", not "any does the work"; and a test that the dispatcher follows the board's column picks.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under a signed policy that releases cards on its own, an author or check run that the daemon stopped because it was shutting down (an update or restart) is settled and queued again by the policy, every time, with the reason recorded; an author run that failed for any other reason still stops for the person. Column picks are followed for routine cards (test). A not-yet-assigned run's icon says the first free agent takes it. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
