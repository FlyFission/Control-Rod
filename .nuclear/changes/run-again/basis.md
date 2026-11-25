# Basis: A failed run says what happened and offers Run again

**Change slug:** `run-again`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-24, on his own install: a card read "Needs you: Return for revision" and he could not tell what to do. The author run had succeeded; the Codex pre-check failed in under a second before it looked at the work (the login-folder size limit, fixed separately in PR #191). Returning the work would have sent a finished author back over a check that never ran. The Requeue button existed only in the Inbox and the run log.

## Proposal

1. `lib/next.ts`: when no run is active and the newest author or pre-check run failed, was stopped or was lost and was not queued again, the card's next line is "The check could not finish. Run it again" (or "The agent stopped answering", "was stopped"), with the runner's error under it, clipped to two lines.
2. The card face gets one primary button for it: **Run again** (the existing requeue route). Release/Accept stay behind it until the run is settled.
3. A run whose outcome is unknown (its process may still be running) cannot be requeued until it is reconciled, so its card says so and offers **Open run log**, where the existing reconcile form is.

## Out of scope

`spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `.github/`: untouched. The cause of Ben's failure (PR #191) and the "Return" escape-hatch filter (PR #189) are their own changes; this one is independent of both and merges in any order.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card whose newest author or pre-check run failed, was stopped or was lost says so in plain words, shows the runner's error, and offers one button: Run again, or Open run log when the outcome is unknown. It no longer reads "Needs you: Return for revision" for a check that never ran. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
