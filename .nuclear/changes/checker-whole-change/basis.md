# Basis: The checker is told a checkout card's patch is the whole change

On the owner's Mac on 2026-11-26 the Codex check of sandbox card 5A574D7A-README-HELLO came back inconclusive: intake wrote a criterion "no other files or lines change", and the checker, seeing only the patch, said it could not verify the rest of the repository. But `publishAccepted` builds the pull request from the bound commit plus that one patch and nothing else, so the patch is the complete change. The checker was not told that.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

For a card on a repository checkout whose author delivered exactly one patch, the pre-check brief has a "The whole change" section: the pull request is built from the bound commit plus that patch only, and it lists the files the patch touches. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
