# Basis: Cards and tags say what to do, in plain words

**Change slug:** `focus-cards`
**Owner:** Ben Huffer
**Date:** 2026-11-26
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-26, after #249: "Did you incorporate even to what our cards say? And to what is shown? I want this whole experience to be ADHD friendly." #249 covered agent prose, Today, the drawer and the Inbox fold. The board's cards still led with a kind chip, an id and owner and role initials before the next step, ran "Author running" and "Needs a second qualified person. Originators cannot verify their own work", and the Inbox tagged items with gate names ("Standard gate").

## Proposal

1. Card face (`features/board/Card.tsx`): title, next line, action, then a quiet row (flags, id and version, agent icons). No kind chip, owner initials or role initials on the face; Move to waits for hover or focus where hovering exists (`board.css`).
2. Run and block lines (`lib/next.ts`) in the board's words.
3. Item tags by what they ask (`lib/plainError.ts` plainItem), used by the Inbox and Today.
4. Packages rows say "version N".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A board card reads title, then one plain next line, then its one action, with the id, version, grade and agent icons last and no kind chip, owner initials or role initials; Move to shows when the card is pointed at, focused or open on screens that can hover. Run lines say "Agent working", "Being checked" or "Waiting for a free agent"; the reviewer block names who wrote it in one sentence. Inbox and Today tags say what the item asks ("Ready to accept"), not the gate name. Packages say "version N", not "rev". Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): ideas only for the screens, no code. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
