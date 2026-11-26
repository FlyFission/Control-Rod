# Plan: A card on a local clone whose origin is on GitHub gets its pull request

1. repos.ts publishCheckout: a repo that is not owner/name is resolved from `git remote get-url origin` in the checkout with `parseGithubOwnerRepoFromUrl`.
2. work.ts: drop not-github from PR_FINAL so resumePublishing retries those cards at start.
3. Tests in publish-checkout.test.ts: a GitHub origin opens the PR, and a GitLab origin or no origin is still not-github.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

When a project's repository is a local clone name, publishCheckout reads the checkout's origin and publishes to that owner/name if it is on github.com; otherwise not-github as before. not-github is retried at server start so cards refused earlier get their pull request. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
