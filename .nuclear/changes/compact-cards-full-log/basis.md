# Basis: Compact cards, a full-screen run log, and splits explained

**Change slug:** `compact-cards-full-log`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-25, on his own install:

1. "The difference between comfortable and compact is laughable. Compact buttons should actually be compact, just down to the name." Compact density hid only the avatars and grade chips.
2. "I'm trying to read through this run log, and the window is so small that it's hard to figure anything out." The drawer's log box was 320 px tall and showed only the last 400 lines.
3. "When I created one card, it split into two... Was that intentional?" Yes: the intake brief allows "one or more work package drafts", and the software feature guidance split out a design spec "when contracts or architecture need owner approval", which an integration request always seems to. The board never said a card came from a split.

## Proposal

1. Compact density renders a card as one line: a status mark and the card's name. The status words stay in the tooltip and for screen readers. Columns fold at 24 compact cards instead of 8.
2. Every run log gets **Open full log**: a modal that fills the screen with every line numbered, a filter, a copy button, and follow-the-tail while the run is live. The drawer's log box grows to 60% of the window height.
3. A card from a request that intake turned into several cards shows "Card N of M from one request: <request>".
4. The intake brief now says one card per request unless the parts need different agents or one must be accepted before the next starts, and never to split design from build, or code from tests, for a change one author can make. When it splits, each objective says why. The software feature guidance splits out a design spec only when the request asks for one.

## Out of scope

`spec/`, `services/` code, `daemon/`, `kernel/`, `policies/`, `.github/`: untouched. Automatic release and accept, and the signing settings, are separate changes (thread "Make cards finish without Ben stepping in").

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A compact card is one line: a status mark and its name. A run log opens full screen with every line, a filter and copy. A card drafted from a request that became several cards says "Card N of M from one request" with the request. Intake keeps one card unless the work truly splits. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
