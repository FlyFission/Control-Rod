# Ship: `omp` Integration and Visual Casting Desk

Release decision: **proposed merge after Wave 2 verification and owner review; the owner retains the merge decision.**

- **Proposed:** merge `feat/omp-patterns-adapter-casting-desk` with:
  - clean-room pattern note `docs/patterns/oh-my-pi.md` and design spec,
  - `omp` registered in the daemon behind `AwaitingConfinement` (`NativeSandbox: "none"`), refused on every launch path until live OS confinement qualification lands,
  - visual Casting Desk in `apps/web` (`AgentsRoster.tsx`) with presets, role cards, effort selectors, plain-language read-back, Author-only fallback chains, and an honest local-draft preview notice, plus `omp` listed as `not-yet` runnable.
- **Not claimed:** that `omp` can run or check live work today; that live OS confinement qualification for `omp` is complete; that Casting Desk drafts are persisted in the API or passkey-signed (ADR 0023); or that any protected trust surface (`kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`) was changed.
- **Owner decisions requested:** review and approve or return the branch once Wave 2 verification is complete.

Rollback: revert the merge. No schema, wire protocol, or stored server data is changed; browser-only drafts live in `localStorage`.

Monitoring after merge: `omp` appears in runtime probes as not ready with its `ConfinementGap` reason. Watch that no future change removes `AwaitingConfinement` from `ompAdapter` without its own ADR 0021 qualification change record.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Pattern note: [oh-my-pi.md](../../../docs/patterns/oh-my-pi.md). Design spec: [2026-11-24-omp-integration-and-casting-desk-design.md](../../../docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md). Decisions: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md), [ADR 0023](../../../docs/adr/0023-role-casting.md), [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

`docs/patterns/oh-my-pi.md` and the design spec are in place; `omp` is registered in the daemon behind `AwaitingConfinement` with `NativeSandbox: "none"`, refuses every launch path until live confinement qualification lands, and parses `omp --mode json` events + upstream `provider/model` vendor families in unit tests; `apps/web` lists `omp` honestly as `not-yet` and renders the visual Casting Desk with presets, role cards, effort selectors, plain-language read-back, Author-only fallback chains, and an honest local-draft preview notice; `tools/check_register.py`, daemon tests, and web tests pass; no protected trust surface is touched; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
