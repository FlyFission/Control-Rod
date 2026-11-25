# Plan: Accepted work opens a draft pull request, and SCRAM is one press

1. `services/api/src/repos.ts`: `publishCheckout(binding, pr)`: branch check, commit leftovers excluding `.controlrod-run-*` (owner's git identity, or a plain Control Rod one), no-change check, planted-config check, push to `https://github.com/<repo>.git` with `gh auth git-credential`, `gh pr create --draft`.
2. `services/api/src/work.ts`: `WorkConfig.publish`; `decideTx` schedules it after an accept commits; `publishAccepted` claims the revision under the events lock, checks the lane, records the outcome; `prBody`; `packageView.pull_request`.
3. `services/api/src/app.ts`: sets `cfg.publish` (`publishPullRequests` option, default on). `commands/catalog.ts`: `package.open-pr`.
4. `spec/api.tsp`: `PackagePullRequest`, `PackageView.pull_request`. `spec/workbench.tsp`: `ScramEvent.assertion` optional. Regenerated.
5. Web: `PullRequestLine` on the package page and the board drawer; `QuickAdd` lane and worktree; `lib/branch.ts`; SCRAM dialog "Stop now".
6. `services/api/src/admin.ts`: `press-or-sign` signature for `scram.pull`; `scram.ts` optional assertion.
7. README check-in bullet describes the signing settings and one-press SCRAM.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card added from the board in a project bound to a GitHub repository gets its own worktree and branch and the project's lane. Once accepted, its work goes out as a draft pull request with no clicks, recorded as events and shown on the card. Restricted lanes, non-GitHub repositories, no-change work and repository configs that could redirect the push open nothing and say why. SCRAM stops with one press; restarting stays signed. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
