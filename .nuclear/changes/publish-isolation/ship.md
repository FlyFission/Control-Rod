# Ship: Accepted work opens a draft pull request, safely and by default

Release decision: **approved by the owner.**

## Signature

| Decision | Question | Answer (owner's words) | Given | Where | Recorded by |
|---|---|---|---|---|---|
| Merge PR #213 without a second blind-review round | "Merge PR #213 (accepted cards open a draft PR, on by default) without a second Codex round?" | Yes, merge #213 (option chosen on a decision card) | 2026-11-25T12:35:51Z | Project thread "Make cards finish without Ben stepping in", decision cmsg_01JQf1P5cs98pyQ9mZyGHPrK42HCsY7XXXfZAqRQETdq7L | Claude (project thread) |

- Rollback: set CONTROLROD_PUBLISH_PULL_REQUESTS=0, or revert the merge. No migration. Pull requests already opened stay on GitHub as drafts.
- Monitoring after merge: an accepted card in a GitHub project shows "Draft pull request opened" with a link.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The push is built and sent from an empty scratch repository that reads no config of the user's, the system's or the checkout's, and a checkout planted with every known way to redirect or widen a push still sends exactly one commit to the intended branch. No marking can move a card off the public and internal lanes while its pull request attempt may still send. Publishing is on by default (CONTROLROD_PUBLISH_PULL_REQUESTS=0 turns it off). API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
