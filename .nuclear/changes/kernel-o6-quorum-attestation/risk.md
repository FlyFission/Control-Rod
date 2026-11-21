# Risk: Wave 4 Kernel O6 provider, family, quorum, and attestation hardening

- **Mode:** Standard
- Execution owner: Implementing agent in `/home/flyfission/worktrees/control-rod-kernel-o6` (branch `feat/kernel-o6-quorum`).
- Decision owner: Ben Huffer, project owner and sole maintainer.
- **Trust surface touched:** **`kernel/src/transition.rs`** and **`kernel/tests/preparation.rs`** (`kernel/` decision functions are protected under AGENTS.md rule 2 and CODEOWNERS). This branch opens as a **draft PR** awaiting Ben Huffer's sole-maintainer sign-off recorded in `ship.md` under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).
- Scope: `kernel/src/transition.rs`, `kernel/tests/preparation.rs`, rebuilt `services/api/kernel/`, `services/api/src/kernel.ts`, `services/api/src/work.ts`, API tests, and this change record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Extra `vendor` or `family` fields override `provider` and allow same-vendor pre-checks to slip past O6 independence. | `RuntimeIdentity::may_be_same` collects canonicalized tokens across `(provider, vendor, family)` on both sides and returns `true` if either token set is empty or any token intersects. | `{ provider: "anthropic", family: Some("openai") }` vs `{ provider: "anthropic", family: None }` returns `may_be_same == false` or allows `SubmitPreCheck`. |
| R-02 | `Grade::Safety` packages allow unattested pre-checks (`attestation_verified: None`) or single-checker / unverified acceptance (`safety_quorum_met: None`). | Fail-closed checks on `SubmitPreCheck` (`attestation_verified == Some(false)` or `Safety && attestation_verified != Some(true)`) and on `Accept`/`AcceptWithFindings` (`safety_quorum_met == Some(false)` or `Safety && safety_quorum_met != Some(true)`). | Any `Safety` request with `None` for the required flag is allowed. |
| R-03 | Owner `OverrideIndependence` bypasses missing/failed attestation or Safety quorum. | `owner_override_verified` applies solely to `author.may_be_same(checker)` and never bypasses `attestation_verified` or `safety_quorum_met`. | Any request with `owner_override_verified: true` and `attestation_verified: Some(false)` or `None` (on `Safety`) is allowed. |
| R-04 | `services/api/kernel/` WASM drift from `kernel/src/transition.rs`, or `work.ts` drops `attestation_verified` when invoking `finishPreCheck`. | Rebuild via `./scripts/build-kernel-wasm.sh` with `wasm-bindgen 0.2.104`, run `lifecycle-traces.test.ts` and `lifecycle_traces.rs`, and pass `{ ...row, status: finished.status, body: finished }` into `finishPreCheck` so `attestation_verified` reaches both `VerificationRecord` and `decide(...)`. | Any trace mismatch or stale WASM artifact, or `Safety` pre-check failing when attested. |
| R-05 | Requiring `safety_quorum_met` breaks existing non-Safety tests (including `OverrideIndependence` tests where author and checker share a runtime). | `work.ts` passes `safety_quorum_met` for `grade === "safety"` computed from attested, non-overridden, distinct-family verifications on the current deliverable (`verifyO6CheckerQuorum`), leaving non-Safety requests with `safety_quorum_met: undefined`. | Any existing `runs.test.ts`, `checker-attempts.test.ts`, `app.test.ts`, or `preparation*.test.ts` regression. |
| R-06 | Trust-surface edit in `kernel/` merges without Ben Huffer's recorded sign-off. | Leave `ship.md` `Signature` table explicitly `not yet given` / `not yet asked`; open as draft PR only. | Any commit or record presenting Ben Huffer's signature as already given. |

## Selected mode

- **Mode:** Standard
- Basis: Modifies kernel transition logic (a protected trust surface) and API enforcement; reversible by reverting the branch before merge, and gated on draft PR review plus sole-maintainer sign-off.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

O6-01 to O6-06 are implemented and tested in Rust and TypeScript; `./scripts/build-kernel-wasm.sh` rebuilds `services/api/kernel/` cleanly; Rust `fmt`/`clippy`/`test` and API `typecheck`/tests pass; the change record validates with `ng.py validate --strict-custody` and `tools/check_owner_decisions.py`; and `ship.md` awaits Ben Huffer's sole-maintainer sign-off on the draft PR.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
