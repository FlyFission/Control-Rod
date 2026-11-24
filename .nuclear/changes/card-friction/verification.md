# Verification: Fewer steps on a new card

- E-01: `pnpm --filter @control-rod/web typecheck` passes.
- E-02: `vitest run` in `apps/web`: all files pass (929 tests at the first run, one expectation updated for the Return change).
- Blind check: pending.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Adding a card is one step: it takes the project's default data lane with no Classify step; the project bar sets that default; a card's drawer says what its lane means and can raise it; a card in work no longer reads "Needs you: Return for revision" when nothing is asked; web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification.
