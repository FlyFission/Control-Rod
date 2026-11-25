# Plan: A failed run says what happened and offers Run again

1. Read the owner's install (read-only) to find why the card was stuck.
2. Add the stalled-run line to `nextLine` and the Run again / Open run log buttons to the card.
3. Unit tests, typecheck, a live-stack run with a failing scripted author, draft PR, Codex blind check, owner yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card whose newest author or pre-check run failed, was stopped or was lost says so in plain words, shows the runner's error, and offers one button: Run again, or Open run log when the outcome is unknown. It no longer reads "Needs you: Return for revision" for a check that never ran. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
