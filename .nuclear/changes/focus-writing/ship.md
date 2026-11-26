# Ship: Agents write so a person can act at a glance

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread on 2026-11-25 at 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. Focus as the default, with Standard one choice away, was this thread's call on the owner's instruction to make product-default calls without asking. No trust surface is touched.

- Rollback: revert the merge. The stored preference is ignored by older code.
- Monitoring after merge: after the next `controlrod update`, a new card's BRIEF.md ends with "Write so the person can act at a glance" before the rules, and Setup shows the writing choice.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under the Focus writing preference, which is the default, every intake, author and pre-check brief carries one section, placed just before the rules, that tells the agent to write what a person reads with the outcome or next action first, numbered steps, one next step at the end, short lists and no preamble, without dropping anything the work needs. Setup has a "How should agents write to you?" choice (Focus or Standard) that is saved like the check-in answer and stays off the chain. Standard leaves the section out. The brief budgets are measured again by script. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): its ten output rules and its first-and-last-line check, rewritten for agents on a card. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
