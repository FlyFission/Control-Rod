# Ship: A passed check counts on a fresh install, and the pull request push finds the GitHub sign-in

Release decision: **merge on green** under the owner's standing permission (2026-11-25, through 2026-12-02).

- Rollback: revert the merge. No migration.
- Monitoring after merge: the sandbox cards' Codex checks are no longer refused as "not a registered harness", and draft PRs open on control-rod-sandbox.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

With no live pin for a runtime, the server counts a check whose attested executable digest has a passing probe for that runtime, the daemon's own rule; with a pin, only pinned digests count. The pull request push gets the GitHub token read with the person's own environment. Authors are told not to commit. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
