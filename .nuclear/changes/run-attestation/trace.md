# Trace: run attestation for counted checks

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | A counted check refuses a custom base URL in the generated config or the environment. | `TestCheckerRefusesCustomBaseURL`, `TestCheckerRefusesBaseURLEnv`; server `refuses a custom endpoint that was re-signed` | implemented with this change |
| T-02 | The effective endpoint is the registry host. Without a proxy the label is `endpoint not enforced`. A label of `enforced` does not count. | `BuildCheckerAttestation` sets the label; `judgeAttestation` rejects `enforced` by the same rule as a non-registry host | implemented; no proxy exists |
| T-03 | A counted Claude check does not pass `--fallback-model`. A counted Codex check keeps `--ignore-user-config` and `--disable multi_agent`. Author argv is unchanged. | `TestCountedRunDisablesDelegation`, `TestLaunchGolden` | implemented with this change |
| T-04 | Observed models are the set of names from the stream parser. An alias or an extra name does not count. An unknown model does not select a vendor. | `TestLogBufferCollectsEveryModel`, `TestCheckerRefusesModelAliasAndExtraModel`, `TestCheckerRefusesUnregisteredModel`; server spoof cases | implemented with this change |
| T-05 | The daemon signs the RFC 8785 SHA-256 of the payload with Ed25519. A tampered field or an unknown key does not verify. The nonce is single use. | `TestAttestationSignsAndRejectsTamper`, `TestAttestationVector`; server `refuses a tampered field`, `refuses a replayed nonce`, `refuses an unknown signing key` | implemented with this change |
| T-06 | The signing key is the OS keychain. A `0600` file is read only when `CONTROLROD_ALLOW_FAKE=1`. | `TestFileKeyRequiresFakeAndMode`. macOS `security` and Linux `secret-tool` were not executed here | implemented; keychain not qualified |
| T-07 | The harness is the runtime stored for the executable SHA-256. A renamed binary's other digest is not accepted. | `TestHarnessFollowsDigestNotName`; server `refuses a renamed binary whose digest is not registered` | implemented with this change |
| T-08 | The server records `attestation_verified`. A counted check with no attestation does not count. The kernel is not edited. | `does not count a Codex pre-check with no attestation`; `git diff` has no `kernel/` files | implemented with this change |
| T-09 | A local model does not count on Safety or Material. API-key-only CLIs are not registry entries. | `TestLocalModelIsNotDecidingOnSafety`; server `refuses a local model on Safety or Material` | implemented with this change |
| T-10 | The fake runtime and the existing suite's unattested completions still run. Present attestations are still checked. | `CONTROLROD_TEST_UNATTESTED_CHECKS` in `harness.ts`; API suite | implemented with this change |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count. Author launch bytes are unchanged. Daemon and server tests are clean. The spec change is additive. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
