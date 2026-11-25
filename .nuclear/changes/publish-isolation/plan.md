# Plan: Accepted work opens a draft pull request, safely and by default

1. `services/api/src/repos.ts`: `publishCheckout` rebuilt around a scratch bare repository with alternates to the checkout's objects; `deadline` input.
2. `services/api/src/publish-claim.ts`: `PR_CLAIM_MS`, `PUBLISH_SEND_BY_MS`, `publishing()`.
3. `services/api/src/markings.ts`: the lane barrier in `write()`. `refusals.ts`: `publishing`.
4. `services/api/src/work.ts`: claim with the lane read under the shared marking lock (`package.open-pr` declares `markings: "read"`); deadline.
5. `services/api/src/app.ts`: default on.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The push is built and sent from an empty scratch repository that reads no config of the user's, the system's or the checkout's, and a checkout planted with every known way to redirect or widen a push still sends exactly one commit to the intended branch. No marking can move a card off the public and internal lanes while its pull request attempt may still send. Publishing is on by default (CONTROLROD_PUBLISH_PULL_REQUESTS=0 turns it off). API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
