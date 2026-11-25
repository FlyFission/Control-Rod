# Verification: Accepted work opens a draft pull request, and SCRAM is one press

- API: full suite 1024 passed, 1 skipped (with the SCRAM change).
- Web: full suite 974 passed (with the SCRAM change). Typecheck clean.
- Spec: `pnpm spec` compiled; generated files committed.
- On the owner's Mac: pending, a small card on a public repository from creation to an open draft pull request.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card added from the board in a project bound to a GitHub repository gets its own worktree and branch and the project's lane. Once accepted, its work goes out as a draft pull request with no clicks, recorded as events and shown on the card. Restricted lanes, non-GitHub repositories, no-change work and repository configs that could redirect the push open nothing and say why. SCRAM stops with one press; restarting stays signed. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
