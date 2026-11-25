# Risk: A failed run says what happened and offers Run again

- Run again could queue work twice. Mitigation: it is the server's requeue route, which refuses a run already requeued, a run with an unknown outcome, and anything under SCRAM; the button is disabled under a SCRAM lock and while a request is in flight.
- The runner's error text is shown on the card. It is the runner's own message (never model output), rendered as text, clipped to 160 characters.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: web-only change, reversible by revert, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card whose newest author or pre-check run failed, was stopped or was lost says so in plain words, shows the runner's error, and offers one button: Run again, or Open run log when the outcome is unknown. It no longer reads "Needs you: Return for revision" for a check that never ran. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
