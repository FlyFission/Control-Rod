# Trace: A card on a local clone whose origin is on GitHub gets its pull request

| Need | Change | Evidence |
| --- | --- | --- |
| Local clone with GitHub origin gets a PR | publishCheckout origin resolve | publish-checkout.test.ts new case |
| Non-GitHub stays local | same | not-github case with GitLab origin |
| Earlier refusals retried | PR_FINAL | resumePublishing at start (signing-policy tests pass) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

When a project's repository is a local clone name, publishCheckout reads the checkout's origin and publishes to that owner/name if it is on github.com; otherwise not-github as before. not-github is retried at server start so cards refused earlier get their pull request. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
