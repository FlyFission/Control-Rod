# Basis: Wave 4 Kernel O6 provider, family, quorum, and attestation hardening

**Change slug:** `kernel-o6-quorum-attestation`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether the hardened O6 runtime independence, Safety attestation, and Safety 2-of-2 quorum rules in `kernel/` (trust surface) and their API wiring in `services/api/` may be accepted via Ben Huffer's sole-maintainer sign-off on the draft pull request.

## Mission / need

The earlier Wave 4 prototype (`67924caf:kernel/src/transition.rs`) had two PR #86 review findings on O6 independence and Safety assurance:

1. `RuntimeIdentity::canonical_family` allowed optional `family` or `vendor` fields to override `provider` (`family.or(vendor).unwrap_or(provider)`), so supplying `{ provider: "claude", family: Some("openai") }` masked `"claude"` and passed independence checks against `{ provider: "claude", family: None }`.
2. `SubmitPreCheck` only refused `attestation_verified == Some(false)` and `safety_quorum_met == Some(false)` rather than failing closed when `attestation_verified` or `safety_quorum_met` is absent (`None`) on `Grade::Safety`, and `Accept` / `AcceptWithFindings` did not check `safety_quorum_met` at all.

This change hardens `kernel/src/transition.rs` (plus `kernel/tests/preparation.rs`), rebuilds the control-plane WASM bindings (`services/api/kernel/`), and wires `services/api/src/kernel.ts` and `services/api/src/work.ts` so `Safety`-grade packages enforce attested pre-checks and 2-of-2 distinct checker vendor families end-to-end without breaking existing non-Safety tests.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Implement Wave 4 Kernel O6 provider/family/quorum/attestation hardening on branch `feat/kernel-o6-quorum` as a draft PR awaiting Ben Huffer's sole-maintainer sign-off. | none: authoring agent's choice, open to the owner | 2026-11-21, Wave 4 delegation to this session | Build the kernel trust-surface hardening, WASM rebuild, API wiring, tests, and change record; leave `ship.md` Signature unfilled (`not yet given` / `not yet asked`) for Ben Huffer to sign on the draft PR. | Signing or merging the trust-surface change; altering `spec/` contracts or `policies/`. |
| D2 | Use `ReasonCode::Forbidden` for missing/failed Safety attestation on `SubmitPreCheck` and missing/failed Safety quorum on `Accept` / `AcceptWithFindings`, while keeping `ReasonCode::NotIndependent` for author/checker baseline or runtime token overlap. | none: authoring agent's choice, open to the owner | 2026-11-21, this record | Preserves all existing `ReasonCode` invariants in `kernel/src/decision.rs` and `services/api/src/refusals.ts` without adding unreviewed reason codes; an owner independence override never waives attestation or Safety quorum. | Adding new `ReasonCode` variants or modifying `kernel/src/decision.rs`. |

## Scope

- **Trust surfaces touched:** `kernel/src/transition.rs`, `kernel/tests/preparation.rs` (and regenerated WebAssembly output under `services/api/kernel/` built via `./scripts/build-kernel-wasm.sh`).
- **API wiring & tests:** `services/api/src/kernel.ts`, `services/api/src/work.ts`, and new/updated tests in `kernel/` and `services/api/test/`.
- **Out of scope:** `spec/`, `policies/`, `tests/redteam/`, `.github/workflows/`, `kernel/src/decision.rs`, `daemon/`.

## Fixed inputs

- `spec/records.tsp` (`WorkPackage.grade`: `"safety" | "material" | "general-service"`).
- `services/api/src/runtimes.ts` (`RUNTIME_FAMILIES`, `distinctFamily`, `verifyO6CheckerQuorum`).
- `services/api/src/run-attestation.ts` (`countedProvider`, `harnessName`, `verifyCountedAttestation`).
- `models/traces/package-lifecycle/v1/` conformance traces and `AGENTS.md` rules 1–6.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

O6-01 to O6-06 are implemented and tested in Rust and TypeScript; `./scripts/build-kernel-wasm.sh` rebuilds `services/api/kernel/` cleanly; Rust `fmt`/`clippy`/`test` and API `typecheck`/tests pass; the change record validates with `ng.py validate --strict-custody` and `tools/check_owner_decisions.py`; and `ship.md` awaits Ben Huffer's sole-maintainer sign-off on the draft PR.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
