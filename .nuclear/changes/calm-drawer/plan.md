# Plan: A calm card drawer

1. Reproduce the dead buttons on the live stack (built control plane, embedded PostgreSQL, Go daemon with the scripted fake runtime, Chromium).
2. Split the decision bar's state into `useDecisionSigner` and `ReasonBox` (focus and scroll into view), shared by the case page and the drawer.
3. Rewrite the drawer: step sentence and primary action from the same stalled-run rules as the card (`lib/next.ts`), plain errors, Details folds.
4. Unit tests, a live drawer test, screenshots at 1440 and 390, draft PR, Codex blind check, owner yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Opening a card shows its title, one plain sentence on where it stands and one primary step, with nothing else above Details. A runner error is said in plain words with the raw text behind a toggle. Send back and Reject open their note box in view and focused, and a signed Send back is recorded. Web tests, typecheck and the live drawer test pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
