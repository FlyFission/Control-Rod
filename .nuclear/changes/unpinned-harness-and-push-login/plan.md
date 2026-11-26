# Plan: A passed check counts on a fresh install, and the pull request push finds the GitHub sign-in

1. run-attestation.ts `unpinnedHarness`: no live pin for the runtime, plus a passing runtime_probes row for the same org, runtime and digest, gives the harness.
2. repos.ts: read `gh auth token --hostname github.com` (or GH_TOKEN) with the person's environment. Pass it as GH_TOKEN only to the ls-remote and push git processes.
3. checkout.go author prompt: do not commit, stash or switch branches.
4. Tests: runtimes.test.ts (unpinned, unprobed, pinned), publish-checkout.test.ts (token lookup).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

With no live pin for a runtime, the server counts a check whose attested executable digest has a passing probe for that runtime, the daemon's own rule; with a pin, only pinned digests count. The pull request push gets the GitHub token read with the person's own environment. Authors are told not to commit. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
