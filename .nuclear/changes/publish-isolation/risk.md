# Risk: Accepted work opens a draft pull request, safely and by default

- **Disclosure.** On by default, accepted public and internal work is pushed to GitHub as a draft pull request. Proprietary and restricted work stays local. A project owner who does not want this sets the lane, or the installation sets CONTROLROD_PUBLISH_PULL_REQUESTS=0.
- **Lane raise held back.** While a pull request attempt may still send (at most 15 minutes, normally seconds), a raise that would take the card off public or internal is refused with a plain reason, and succeeds once the attempt has an outcome. If the server stops mid-attempt the claim blocks raises until it runs out. A raise that lands just after a push is a person's deliberate act on work already on GitHub; the card says so.
- **Objects through alternates.** The scratch repository reads the checkout's object store, which must sit inside the workspace root. Objects are content-addressed, so a planted object cannot change what the explicit commit id names.
- **No trust surface is touched.**

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert or one setting; pull requests are drafts; no kernel, policy or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The push is built and sent from an empty scratch repository that reads no config of the user's, the system's or the checkout's, and a checkout planted with every known way to redirect or widen a push still sends exactly one commit to the intended branch. No marking can move a card off the public and internal lanes while its pull request attempt may still send. Publishing is on by default (CONTROLROD_PUBLISH_PULL_REQUESTS=0 turns it off). API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
