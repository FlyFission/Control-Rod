# Ship: Accepted work opens a draft pull request, safely and by default

Release decision: **pending the owner's yes.**

## Signature

| Decision | Question | Answer (owner's words) | Given | Where | Recorded by |
|---|---|---|---|---|---|
| Pending | deferred | deferred | deferred | deferred | deferred |

- Rollback: set CONTROLROD_PUBLISH_PULL_REQUESTS=0, or revert the merge. No migration. Pull requests already opened stay on GitHub as drafts.
- Monitoring after merge: an accepted card in a GitHub project shows "Draft pull request opened" with a link.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The push is built and sent from an empty scratch repository that reads no config of the user's, the system's or the checkout's, and a checkout planted with every known way to redirect or widen a push still sends exactly one commit to the intended branch. No marking can move a card off the public and internal lanes while its pull request attempt may still send. Publishing is on by default (CONTROLROD_PUBLISH_PULL_REQUESTS=0 turns it off). API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
