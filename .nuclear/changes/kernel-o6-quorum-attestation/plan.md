# Plan: Wave 4 Kernel O6 provider, family, quorum, and attestation hardening

1. Establish `.nuclear/changes/kernel-o6-quorum-attestation/` before editing code (`basis.md`, `risk.md`, `plan.md`, `trace.md`, `verification.md`, `ship.md`, `evidence/`).
2. Harden `kernel/src/transition.rs` (`RuntimeIdentity` `vendor`/`family` fields, `canonicalize_token`, fail-closed `may_be_same`, `Grade` enum, `Request` `grade`/`attestation_verified`/`safety_quorum_met` fields, fail-closed `Safety` checks on `SubmitPreCheck`, `Accept`, and `AcceptWithFindings`) and update `kernel/tests/preparation.rs` plus unit tests in `kernel/src/transition.rs`.
3. Rebuild the kernel WASM bundle and JS/TS bindings via `./scripts/build-kernel-wasm.sh`.
4. Update `services/api/src/kernel.ts` (`Grade`, `RuntimeIdentity`, `KernelRequest`) and `services/api/src/work.ts` (pass `vendor`, `family`, `grade`, `attestation_verified`, and `safety_quorum_met` to `decide(...)`, update `mayBeSameRuntime`, forward `finished` to `finishPreCheck`, and prefer unused checker families in `pickChecker`).
5. Add end-to-end API tests covering `Safety` pre-check attestation and 2-of-2 distinct-family quorum acceptance/refusal alongside `runtime` identity hardening.
6. Run Rust (`fmt`, `clippy`, `test`), TypeScript (`typecheck`, `test`), and change-record (`ng.py validate --strict-custody`, `tools/check_owner_decisions.py`) checks, record outputs under `evidence/`, finalize `trace.md` and `verification.md`, and keep `ship.md` `Signature` set to `not yet given` / `not yet asked` for draft PR sign-off.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

O6-01 to O6-06 are implemented and tested in Rust and TypeScript; `./scripts/build-kernel-wasm.sh` rebuilds `services/api/kernel/` cleanly; Rust `fmt`/`clippy`/`test` and API `typecheck`/tests pass; the change record validates with `ng.py validate --strict-custody` and `tools/check_owner_decisions.py`; and `ship.md` awaits Ben Huffer's sole-maintainer sign-off on the draft PR.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
