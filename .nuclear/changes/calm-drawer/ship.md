# Ship: A calm card drawer

Release decision: **approved by the owner, 2026-11-25 01:08 UTC.**

## Signature

Owner (sole maintainer): Ben Huffer, yes, by decision card "Merge PR 195 (calm card drawer) into main?" in the project thread, 2026-11-25 01:08 UTC. Blind check: Codex gpt-6.2-sol on the owner's Mac, five findings, all fixed as recorded in verification.md.

- Rollback: revert the merge. No data, route or migration.
- Monitoring: the live drawer test (`e2e/live/drawer.spec.ts`) runs with the live suites; the owner's next stuck card is the field check that the drawer says what to do in one line.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Opening a card shows its title, one plain sentence on where it stands and one primary step, with nothing else above Details. A runner error is said in plain words with the raw text behind a toggle. Send back and Reject open their note box in view and focused, and a signed Send back is recorded. Web tests, typecheck and the live drawer test pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
