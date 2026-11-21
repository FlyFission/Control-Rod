# Ship: Wave 4 Kernel O6 provider, family, quorum, and attestation hardening

Release decision: **draft pull request awaiting Ben Huffer's sole-maintainer sign-off (see Signature); no merge or release is authorized by this record.**

- **Proposed:** open as a draft pull request covering the hardened O6 runtime independence, Safety attestation, and Safety 2-of-2 quorum rules in `kernel/` (trust surface), the rebuilt WASM kernel artifacts in `services/api/kernel/`, and the API wiring in `services/api/src/kernel.ts` and `services/api/src/work.ts`.
- **Not claimed:** that the kernel proves which model produced tokens behind an external API or compromised host; an independent review; or that Ben Huffer has signed off on the `kernel/` trust-surface change yet.
- **Trust surfaces touched:** `kernel/src/transition.rs`, `kernel/tests/preparation.rs` (plus compiled WASM output in `services/api/kernel/`).

## Signature

Recorded under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

| Field | Entry |
|---|---|
| Decision | not yet given |
| Trust-surface files | `kernel/src/transition.rs`, `kernel/tests/preparation.rs` |
| Question | not yet asked |
| Answer | not yet given |
| Head when asked | not yet asked |
| Recorded by | not yet given (no signature or initials typed for Ben Huffer; awaits his recorded yes on the draft PR) |

No signature has been given. This table stays unfilled until Ben Huffer gives his own recorded yes on the draft PR under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).

## Rollback and monitoring

Rollback: revert the merge commit (additive optional fields on `RuntimeIdentity` and `Request`, plus fail-closed `Safety` checks).

Monitoring after merge: watch `package.checker-attempt` and `run.record-refused` / `decision.apply` refusals for `Safety` packages missing `attestation_verified` or 2-of-2 distinct checker vendor families, and verify `lifecycle-traces.test.ts` and `kernel` tests stay green.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

O6-01 to O6-06 are implemented and tested in Rust and TypeScript; `./scripts/build-kernel-wasm.sh` rebuilds `services/api/kernel/` cleanly; Rust `fmt`/`clippy`/`test` and API `typecheck`/tests pass; the change record validates with `ng.py validate --strict-custody` and `tools/check_owner_decisions.py`; and `ship.md` awaits Ben Huffer's sole-maintainer sign-off on the draft PR.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
