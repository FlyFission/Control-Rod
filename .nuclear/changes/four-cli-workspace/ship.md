# Release disposition

Local implementation is available in the isolated execution worktree. The release decision remains with the owner. Verified checkout comparison, a clean-repo release walkthrough and the full four-provider matrix remain open. The original worktree and deployed systems retain their existing state. [Execution results and outstanding dependencies](evidence/execution.md).

Rollback is local to the execution branch. Before release, monitoring should distinguish stale feed data, transcript paging failures, preview integrity failures, and provider readiness from observed run outcomes.

## Signature

| Field | Entry |
|---|---|
| Decision | **Yes.** The owner approved #134's `spec/` changes for merge: the workspace-project endpoints and models, and the run reads (optional `before`, `recent` and `limit` on `runEvents`, with `after` now at least 0). Recorded by the agent (Claude, landing thread); not the owner's signature. This entry covers the `spec/api.tsp` change of #134 as a whole, including the parts traced in [active-run-switcher](../active-run-switcher/ship.md). |
| Question | "Approve the spec/ contract changes in #148 and #134 so they can merge?", on a decision card in the Control Rod project thread "Land the open PRs onto main", whose first option read: "I record your yes in each ship.md Signature table: #148 adds two optional workflow fields; #134 adds additive workspace-project and run-read endpoints." |
| Answer | "Yes to both" (the owner's own pick on the card) |
| When and where | 2026-11-23 17:18:55 UTC, Control Rod project thread "Land the open PRs onto main" |
| Head when asked | #134 at `f9de155`. The landing PR changes no line of `spec/api.tsp` that #134 did not; its regenerated `spec/generated/` files come from `pnpm spec`. |

## Required links

[basis](basis.md), [risk](risk.md), [plan](plan.md), [trace](trace.md), [verification](verification.md).

## Exit criteria

Record the reviewed plan, reviewer findings, and any outstanding review status.

## Source-lineage note

Local planning evidence based on the Control Rod repository and user direction. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md).
