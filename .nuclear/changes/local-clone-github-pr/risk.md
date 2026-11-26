# Risk: A card on a local clone whose origin is on GitHub gets its pull request

- **The push target comes from the clone's origin.** The origin lives in the shared repository config, which agent runs cannot write (the checkout's shared Git administration is read-only to them). The push still uses the person's own GitHub sign-in, so it reaches only repositories they can already push to.
- Retrying not-github at each start costs one git call per accepted checkout card, and it adds one event pair for cards that stay local.
- No trust surface is touched (no kernel decision function, policy, spec or workflow).

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

When a project's repository is a local clone name, publishCheckout reads the checkout's origin and publishes to that owner/name if it is on github.com; otherwise not-github as before. not-github is retried at server start so cards refused earlier get their pull request. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
