# Ship: Cards and tags say what to do, in plain words

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread on 2026-11-25 at 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge. Web only.
- Monitoring after merge: after `controlrod update`, a board card reads its title, then one plain line, then its button.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A board card reads title, then one plain next line, then its one action, with the id, version, grade and agent icons last and no kind chip, owner initials or role initials; Move to shows when the card is pointed at, focused or open on screens that can hover. Run lines say "Agent working", "Being checked" or "Waiting for a free agent"; the reviewer block names who wrote it in one sentence. Inbox and Today tags say what the item asks ("Ready to accept"), not the gate name. Packages say "version N", not "rev". Web tests and the typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): ideas only for the screens, no code. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
