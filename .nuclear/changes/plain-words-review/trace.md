# Trace: A card, the Inbox and Today say what happened in plain words

| Need | Code | Test |
| --- | --- | --- |
| A failed run is never a dispute | `apps/web/src/lib/plainError.ts` plainItem; `pages/Inbox.tsx`, `pages/Today.tsx` | `pages/inbox.test.tsx` "never calls a run that did not finish a dispute" |
| One way in, details folded | `pages/Inbox.tsx` Item | `components/components.test.tsx` inbox; `pages/inbox.test.tsx`; `pages/today.test.tsx` |
| Drawer uses the board's words | `features/board/BoardReviewDrawer.tsx` columnWord, agentName, DrawerDetails | `features/board/cockpit.test.tsx` "leads with the title" |
| No "r0" on cards | `features/board/Card.tsx` | board tests |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that did not finish reads "Did not finish" with a plain sentence on the Inbox and Today, never "Dispute"; the runner's own text, the digest and what signing binds sit under Details. The card drawer names its column as the board does, counts files without "2 of 1", says "Did not finish" rather than "Not run yet" after a failed check, names the agents that write and check, and counts versions from 1. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
