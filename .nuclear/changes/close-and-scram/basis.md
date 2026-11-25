# Basis: SCRAM that signs, one way to close, true compact, a readable run log

**Change slug:** `close-and-scram`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Asked for by the owner, 2026-11-25.

## Mission / need

The owner, 2026-11-25:

- "I can't even scram my project. I can't even click the 'Sign in with your passkey,' and stop." The SCRAM sign button stayed closed with no word on why: the reason box started empty, no project was chosen, or the count of what it stops was still loading, and on a short window the dialog could run off the screen.
- "I still can't just close out of cards easily. Some have Xs, and others don't."
- "The difference between comfortable and compact is laughable. Compact should actually be compact, just down to the name."
- "I'm trying to read through this run log, and the window is so small that it's hard to figure anything out."

## Proposal

1. SCRAM preselects the active project, prefills the reason "Emergency stop." and says in one line what is still missing whenever Sign is closed. The dialog fits the window and scrolls.
2. One close control (`components/CloseX.tsx`) in the top-right corner of every drawer, dialog and panel. Esc closes. A click outside closes (`lib/dismiss.ts`) unless typed text would be lost or a signature is in flight.
3. Compact density shows one line per card: a status mark and the name. The next line is the hover text and is kept for screen readers.
4. Every run has "Open full log": a near full-screen view with the plain summary first, every line numbered and wrapped, "Only problem lines", Copy log and Jump to the end. The inline log is taller.

## Out of scope

`spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `.github/`: untouched. What SCRAM stops and how it is signed are unchanged; only the dialog around it changes. Card autonomy and the card split are another thread.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SCRAM can be signed at once from the active project, and when its button is closed the dialog says why in one line. Every drawer, dialog and panel has the same close X in its top-right corner, Esc closes, and a click outside closes unless typed text would be lost. Compact cards are one line: a status mark and the name. The run log opens at full size with the plain summary first. Web tests, typecheck and the live drawer, SCRAM dialog and lifecycle tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
