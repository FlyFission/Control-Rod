# Trace: Accepted work opens a draft pull request, safely and by default

| Need | Change | Evidence |
| --- | --- | --- |
| Nothing in the checkout can redirect or widen the push | scratch repository in `publishCheckout` | `publish-checkout.test.ts` "never reads the checkout's own config, so nothing in it can redirect or widen the push" |
| Private run folders never leave | NUL-separated tree diff | `publish-checkout.test.ts` "finds a run folder even when git would quote the path" |
| A lane raise cannot race a push | `publishing()`, `markings.ts` barrier, claim under the marking lock | `signing-policy.test.ts` "holds a lane raise back while the card's pull request is being opened" |
| A slow attempt never sends after its claim | `deadline` | `publish-checkout.test.ts` "sends nothing once its claim may have run out" |
| A retry and adoption are exact | fixed identity, adoption filter | `publish-checkout.test.ts` retry, identity and fork tests |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The push is built and sent from an empty scratch repository that reads no config of the user's, the system's or the checkout's, and a checkout planted with every known way to redirect or widen a push still sends exactly one commit to the intended branch. No marking can move a card off the public and internal lanes while its pull request attempt may still send. Publishing is on by default (CONTROLROD_PUBLISH_PULL_REQUESTS=0 turns it off). API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
