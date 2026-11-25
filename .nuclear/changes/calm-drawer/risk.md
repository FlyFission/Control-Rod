# Risk: A calm card drawer

- Facts a decision rests on are one click away instead of on screen. Mitigation: each Details row carries a one-line summary (criteria count, check outcome and findings, outputs n of m, run count), the full case page is unchanged, and the server still decides every signature over the digest the page read.
- A plain-words rule could mislabel an error. Mitigation: rules match the runner's own wording only, the raw text is always one click away, and anything unmatched says "Something went wrong while it ran" rather than guess.
- Run again could queue twice: the existing requeue route refuses a run already requeued or with an unknown outcome, and the button is disabled while pending and under a SCRAM lock.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: web-only change, reversible by revert, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Opening a card shows its title, one plain sentence on where it stands and one primary step, with nothing else above Details. A runner error is said in plain words with the raw text behind a toggle. Send back and Reject open their note box in view and focused, and a signed Send back is recorded. Web tests, typecheck and the live drawer test pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
