# Risk: A card, the Inbox and Today say what happened in plain words

- Moving the digest and "what signing binds" under Details hides them one click deeper. They stay on the Inbox row's Details and in the drawer's Signing record, and every signature still shows them where it is made.
- Calling a failed run "Did not finish" instead of "Dispute" changes a label only; the item, its rank and its actions are the server's, unchanged.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: web wording and layout only, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A run that did not finish reads "Did not finish" with a plain sentence on the Inbox and Today, never "Dispute"; the runner's own text, the digest and what signing binds sit under Details. The card drawer names its column as the board does, counts files without "2 of 1", says "Did not finish" rather than "Not run yet" after a failed check, names the agents that write and check, and counts versions from 1. Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
