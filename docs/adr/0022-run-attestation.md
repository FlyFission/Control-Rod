# ADR 0022: Run attestation and where the daemon signing key lives

- Status: Proposed (owner direction in the milestone 4 brief; awaiting the signed review)
- Date: 2026-11-15

## Context

A counted pre-check has to say which executable ran, which config it ran under, which endpoint and models the stream showed, and that the daemon on that machine signed the statement. The kernel will not read the result until milestone 6. Until then the server records it and refuses to count a check that does not verify.

ADR 0021 still holds. Control Rod does not read, store, copy, or relay a CLI token. The signing key is the daemon's own key. It is not a provider credential.

## Decision

1. The daemon signs with Ed25519. The signed message is the 32-byte SHA-256 of the RFC 8785 canonical form of the payload, under the profile already shared by `daemon/internal/digest` and the kernel digest. The payload is a JSON object with these fields and no others: `schema_version`, `run_id`, `nonce`, `artifact_digest`, `policy_digest`, `effective_config_digest`, `effective_endpoint`, `endpoint_enforcement`, `observed_models`, `platform`, `probe_result`, `workspace_before`, `workspace_after`, `requested_model`, `check_id`, `deliverable_digest`, `verification_digest`. `signature` and `key_id` are carried beside that payload and are not inside it. `observed_models` is sorted and contains each name once. Digests are `{ "algorithm": "sha256", "value": "<64 hex>" }`. `check_id` is the checker attempt id assigned when the pre-check starts (`checker_attempt_id` on the run). `deliverable_digest` is the canonical digest of the deliverable names and byte hashes, the same value attempt records store. `verification_digest` is the canonical digest of the outcome, findings, criterion results, and evidence file digests. `requested_model` is the model the run named, or the pin's model when the run says `default` or `any`.
2. `key_id` is the hex SHA-256 of the raw 32-byte public key. `signature` is the standard base64 of the 64-byte Ed25519 signature. `nonce` is 32 random bytes, hex. The server inserts it only after the signature, the run, the check id, the model, the deliverable digest, and the verification digest all match. The primary key is `(org_id, key_id, nonce)`. A second insert of the same run and the same payload hash is an idempotent retry. Any other reuse is a replay and does not count.
3. The private key lives in the OS keychain. On macOS the daemon calls Security.framework (`SecItemCopyMatching`, `SecItemAdd`) so the key bytes are not process arguments. A build without cgo cannot use the keychain and does not sign. On Linux, `secret-tool store` reads the secret on stdin. Lookup treats "not found" as missing and every other failure (locked, D-Bus, empty output) as unavailable. An unavailable keychain does not create a key. `controlrod attestation-public` creates a key only when the lookup says it is absent, and it never replaces one. A file is read only when `CONTROLROD_ALLOW_FAKE=1` and `CONTROLROD_TEST_ATTESTATION_KEY` names a regular file of mode `0600` owned by the user and not a symlink. That path is for tests.
4. An administrator enrolls the public key with the passkey command `daemon.enroll-key`. The same gate as pinning a runtime. Keys are rows of `(org_id, key_id)`. `daemon.retire-key` retires one key. A retired key fails verification immediately and is not enrolled again. An unknown key does not count.
5. The harness is the runtime stored for the executable's SHA-256 (`runtime_artifact_versions`, or the pin the server sent the daemon). The file name is not an input. A digest with no row does not count. The server does not pick a vendor when the model registry misses.
6. The model registry is `daemon/internal/runner/models.json`. Each entry names the harness, the model strings that count, and the vendor hosts. The effective endpoint recorded today is that host. There is no egress proxy, so `endpoint_enforcement` is `endpoint not enforced`. A statement that says `enforced` does not count. A local model, or one that is not deciding, does not count on Safety or Material. API-key-only CLIs are not entries. Ollama is not an entry.
7. `probe_result` is `not-run` until an in-run probe is qualified. `fail` does not count. Workspace before and after must be the same digest. The policy digest must be the one on the run. The deliverable digest must be the digest pinned for this run, or the current author deliverable when no pin was stored. The verification digest must match the submission the server received.
8. The server stores `attestation_verified` and `attestation_reason` on the run. When the check counts, `attestation_verified` is also on the verification record, beside the check. `decide` is still called with the outcome string only. A counted pre-check whose attestation does not verify has its verification and criterion results dropped. The run is not a counted check and not a sticky fail. It is recorded as a checker attempt with outcome `error` and `counts_as` `inconclusive`, and no verification row.

## Conditions

- A counted Claude or Codex pre-check with a missing attestation, a bad signature, an unknown key, a replayed nonce, an unregistered model, a model alias, an extra stream model, a custom endpoint, a renamed binary, or a failed harness lookup does not count.
- Author and intake launches do not gain checker flags. The fake runtime is not a counted vendor check.
- There is no production switch that counts a Claude or Codex pre-check without an attestation. Tests that need a counted completion sign one with a key the test inserts. Production startup cannot set that behavior.

## Alternatives considered

- Signing the canonical bytes instead of their SHA-256. Rejected: both sides already agree on the SHA-256 of the RFC 8785 form, and the signature stays a fixed size.
- A file key as the production fallback. Rejected: a world-readable or copied file is the failure this custody rule is there to avoid. The file exists only for the fake test switch.
- Letting the kernel require `attestation_verified` in this change. Rejected: that is milestone 6 and a kernel decision change.

## Consequences

- Easier: a spoofed endpoint, model, or binary does not become a pre-check, and the reason is on the run.
- Harder: a real Claude or Codex check does not count until the daemon's public key is enrolled, the executable's digest is in `runtime_artifact_versions`, and the run names a registered model. The in-run probe is still `not-run`.
- Given up: endpoint enforcement. The label says so.

## Evidence

`.nuclear/changes/run-attestation/`. The cross-language vector is `daemon/internal/runner/testdata/attestation-vector.json`, written by the Go test. Not qualified: the macOS Keychain on Ben's Mac, `secret-tool` on a Linux session bus, and a real Claude Code or Codex binary.
