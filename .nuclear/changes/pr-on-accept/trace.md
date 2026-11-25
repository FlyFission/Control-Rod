# Trace: Accepted work opens a draft pull request, and SCRAM is one press

| Need | Change | Evidence |
| --- | --- | --- |
| Accepted work leaves as a pull request with no clicks | `publishAccepted`, `publishCheckout`, `decideTx` hook | `publish-checkout.test.ts`; `signing-policy.test.ts` "a card bound to a repository checkout goes out as a pull request once accepted" |
| The card shows where the work went | `PackageView.pull_request`, `PullRequestLine` | `signing-policy.test.ts` (view), web typecheck |
| No credential leak, no restricted push | planted-config and lane guards | `publish-checkout.test.ts` "refuses to push when the repository's own config could redirect the credential" |
| Board cards need no second step | `QuickAdd` lane and worktree | `quick-add.test.tsx` "gives a card in a repository project its own worktree and branch" |
| SCRAM is one press, restart signed | `press-or-sign`, optional assertion | `scram.test.ts` "stops with one press and no passkey..."; `scram.test.tsx` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card added from the board in a project bound to a GitHub repository gets its own worktree and branch and the project's lane. Once accepted, its work goes out as a draft pull request with no clicks, recorded as events and shown on the card. Restricted lanes, non-GitHub repositories, no-change work and repository configs that could redirect the push open nothing and say why. SCRAM stops with one press; restarting stays signed. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
