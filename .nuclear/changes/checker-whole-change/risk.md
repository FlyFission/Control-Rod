# Risk: The checker is told a checkout card's patch is the whole change

- The statement is true only while `publishAccepted` builds from the one patch; both use the same .patch/.diff rule, and a card with more than one patch gets no section (and no pull request).
- Brief text only: no verdict rule, policy, kernel or spec change. The checker still judges every criterion itself.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

For a card on a repository checkout whose author delivered exactly one patch, the pre-check brief has a "The whole change" section: the pull request is built from the bound commit plus that patch only, and it lists the files the patch touches. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
