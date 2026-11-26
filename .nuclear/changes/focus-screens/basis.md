# Basis: Screens point at the one next step

**Change slug:** `focus-screens`
**Owner:** Ben Huffer
**Date:** 2026-11-26
**Status:** Built, for owner review.

## Mission / need

The same ask as `focus-writing`: the i-have-adhd rules everywhere, so the screens too. Today led with counts, not with what to do; the drawer named a column but not how far along the card is; the Inbox listed everything at once.

## Proposal

1. Today (rule 1, lead with the next action): "Start here", the first Inbox item's title and its one button, under the headline.
2. Card drawer (rule 5, restate state): "step N of M" from `lib/board.ts` workStep.
3. Inbox (rule 8, five in view): the first five items, the rest under "Show N more".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Today shows "Start here" with the most urgent Inbox item and its one button under the headline, and nothing when nothing waits. The card drawer says "step N of M" after its column word, counting Person verifies only for work that needs it. The Inbox shows five items and folds the rest under "Show N more", dropping none. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): ideas only for the screens, no code. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
