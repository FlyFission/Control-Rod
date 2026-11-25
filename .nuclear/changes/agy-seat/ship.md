# Ship: Antigravity CLI as a confined seat

Release decision: **pending the owner**. Merge after the live qualification passes on the owner's Mac, a Codex blind review, and the owner's yes in the project thread. No trust surface is touched.

## Signature

Owner (sole maintainer): not yet recorded.

## Known limits

- macOS only. Linux and Windows keep Antigravity listed and switched off.
- No authoring in a repository checkout yet. Antigravity loads workspace hook files outside its sandbox, so a checkout needs a later mirrored workspace.
- The file tools can create a new file directly in `/private/var/tmp` in an author run (risk residual). A checker in plan mode cannot.
- Antigravity's built-in list of safe commands and its own model reviewers can allow commands that are not on Control Rod's list. Its terminal sandbox still holds for every command, and deny rules hold.
- One simple command per terminal call: Antigravity ends a print run at the first command with pipes or chaining.

- Rollback: revert the merge. Antigravity returns to "found, not supported yet"; no stored data changes shape.
- Monitoring after merge: the first real Antigravity check on a Mac ends with a verdict, and no `.controlrod-gate.sh` home is left under `/var/tmp/controlrod-run-<uid>`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Antigravity CLI runs author (outside a checkout), intake and pre-check work on macOS under its own terminal sandbox, with file-tool rules, a per-run home and plan-mode checks that Control Rod derives from the run's policy; it stays refused on every other platform and for checkout authoring; its pre-checks count with the Gemini models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
