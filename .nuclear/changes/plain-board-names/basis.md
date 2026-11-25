# Basis: Plain names on the board, one way to add work, a shorter Setup

**Change slug:** `plain-board-names`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

Ben, 2026-11-24: new users get stuck and will uninstall. Remaining items from the first-run walkthrough (`/mnt/project-files/control-rod/first-run/walkthrough-findings.md`, items 3, 6, 8), approved to proceed by the coordinator on Ben's standing "fewer questions" preference.

## Proposal

1. Software board columns in plain words: Implementing -> Agent working, CI / Agent check -> Being checked, Peer review -> Needs a reviewer, Needs signature -> Ready to accept (and the list view's badge). Capital Projects and Nuclear-Grade keep their terms, which their users know. Column ids and logic are unchanged.
2. One way to add work: the empty board keeps one primary "+ New change" (the "Open Packages" button beside it is gone); the column's "+ Add a card" is renamed "+ Quick add" so it reads as the fast path to the same thing.
3. Setup: agents Control Rod can run stay in the list when not found, so their install commands are visible instead of folded under "Add an agent"; the ones it cannot run yet are one line ("Coming later: ...").

## Out of scope

The card drawer (thread "Simplify the card detail drawer"), the data-lane step (PR #189), `spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `.github/`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The Software board names its columns in plain words; the board offers one New change button and a secondary Quick add; Setup lists the agents Control Rod can run, found or not, with their install commands visible, and names the ones coming later in one line. Web tests, typecheck and the live lifecycle pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
