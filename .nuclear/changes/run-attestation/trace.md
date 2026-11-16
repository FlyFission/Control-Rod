# Trace: run attestation for counted checks

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | A counted check refuses a custom base URL in the generated config or the environment, including an attached `-c` value. Codex `-p`, `-pX`, `-p=X`, `--profile` and `--profile=X` are refused. Claude `-p` and `--print` are boolean: the next flag is still scanned, and the prompt is not config. A valued flag does not consume a following flag. | `TestCheckerRefusesCustomBaseURL`, `TestCheckerRefusesBaseURLEnv`, `TestCountedConfigParsing`; server `refuses a custom endpoint that was re-signed` | implemented with this change |
| T-02 | The effective endpoint is the registry host. Without a proxy the label is `endpoint not enforced`. A label of `enforced` does not count. | `BuildCheckerAttestation` sets the label; `judgeAttestation` rejects `enforced` by the same rule as a non-registry host | implemented; no proxy exists |
| T-03 | A counted Claude check does not pass `--fallback-model`. A counted Codex check keeps `--ignore-user-config` and `--disable multi_agent`. Author argv is unchanged. | `TestCountedRunDisablesDelegation`, `TestLaunchGolden` | implemented with this change |
| T-04 | Observed models are the set of names from the stream parser. An alias or an extra name does not count. An unknown model does not select a vendor. | `TestLogBufferCollectsEveryModel`, `TestCheckerRefusesModelAliasAndExtraModel`, `TestCheckerRefusesUnregisteredModel`; server spoof cases | implemented with this change |
| T-05 | The daemon signs the RFC 8785 SHA-256 of the payload with Ed25519, including the attempt id, the requested model, the deliverable digest, and the verification digest. A tampered field or an unknown key does not verify. A nonce is stored only after that check. The same payload is a retry. Any other reuse is a replay. | `TestAttestationSignsAndRejectsTamper`, `TestAttestationVector`; server spoof cases and `treats the same nonce and payload as a retry` | implemented with this change |
| T-06 | The signing key is the OS keychain. macOS does not put the secret on argv. Linux store reads stdin. `secret-tool` exit 1 with empty stderr is a missing key and may be created. A D-Bus or GError message is unavailable and is not replaced. A `0600` file is read only when `CONTROLROD_ALLOW_FAKE=1`. | `TestFileKeyRequiresFakeAndMode`, `TestKeychainFailureIsNotAMissingKey`, `TestSecretToolCreatesOnlyWhenStderrIsEmpty`. Security.framework and a real `secret-tool` were not executed here | implemented; keychain not qualified |
| T-07 | The harness is the runtime stored for the executable SHA-256. A renamed binary's other digest is not accepted. | `TestHarnessFollowsDigestNotName`; server `refuses a renamed binary whose digest is not registered` | implemented with this change |
| T-08 | The server records `attestation_verified`. A counted check with no attestation does not count, leaves no verification, and is an inconclusive checker attempt under the id assigned at start. The kernel is not edited. | `does not count a Codex pre-check with no attestation`; `git diff` has no `kernel/` files | implemented with this change |
| T-09 | A local model does not count on Safety or Material. API-key-only CLIs are not registry entries. | `TestLocalModelIsNotDecidingOnSafety`; server `refuses a local model on Safety or Material` | implemented with this change |
| T-10 | The fake runtime still runs without an attestation. A counted completion in the suite carries a signature the test helper built. Production has no unattested switch. A retired key does not count. | `sealCountedCheck` in the API tests; `retires a key so its signatures stop counting` | implemented with this change |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count. Author launch bytes are unchanged. Daemon and server tests are clean. The spec change is additive. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
