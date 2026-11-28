# Basis: Pull request state on accepted cards

**Change slug:** `pr-watch`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

Every card on the normal path ends with Control Rod opening a draft pull request. From then on the card said "Accepted" and the pull request line said "Draft pull request opened" forever, whatever happened on GitHub. The owner could not see from the Board which pull requests are ready to merge, failing, merged or closed. That is the last step of the plan-to-PR goal.

Found by the 2026-11-28 repo-siphon run over 23 inspiration repositories: 11 of them named this gap (OpenHands C-001 and agent-orchestrator C-001 as Tier 1). The design is our own, from the dossiers' descriptions; no donor code, tests, field names or wording are used.

## Proposal

1. `spec/api.tsp`: an optional `watch` on `PackagePullRequest` (model `PullRequestWatch`: state open, merged or closed; checks passing, failing, pending or none; read_at). Additive, not a major version. Generated files regenerated.
2. `services/api/src/repos.ts` `readPullRequestFacts`: `gh pr view <link> --json state,statusCheckRollup`, pinned to github.com, refusing anything that is not a plain pull request link.
3. `services/api/src/pr-watch.ts`: maps gh's answer to the fixed words and caches it in memory. An open pull request is re-read after five minutes, a failed read after one minute. Merged or closed is not read again. A package view waits at most two seconds for a read in flight. All three are proposed settings, named constants, not measured values.
4. `work.ts` pullRequestOf adds `watch` to an opened pull request when it can be read.
5. Web: `acceptedLine` in `lib/next.ts` (ready or failing is Needs you, running is Waiting, merged or closed is ok, unread is Accepted), and `PullRequestLine` says the state and when it was checked, and keeps the link.

## Out of scope

Requeuing a card when checks fail. Closing or moving a card when its pull request merges. Sending any pull request text to an agent. Notifications. The sealed event chain: the reading is an outside observation, not custody, so it is not recorded. `kernel/`, `policies/`, `.github/`, `daemon/`, and ADRs are untouched.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

After Control Rod opens a card's draft pull request, the card's line and the pull request line say whether it is ready to merge, failing its checks, still checking, merged or closed, read live and read-only from GitHub. When GitHub cannot be read, both lines are exactly as before. No text from GitHub is read or shown. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
