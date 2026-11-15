# ADR 0022: Run attestation and where the daemon signing key lives

- Status: Proposed (owner direction in the milestone 4 brief; awaiting the signed review)
- Date: 2026-11-15

## Context

A counted pre-check has to say which executable ran, which config it ran under, which endpoint and models the stream showed, and that the daemon on that machine signed the statement. The kernel will not read the result until milestone 6. Until then the server records it and refuses to count a check that does not verify.

ADR 0021 still holds. Control Rod does not read, store, copy, or relay a CLI token. The signing key is the daemon's own key. It is not a provider credential.

## Decision

1. The daemon signs with Ed25519. The signed message is the 32-byte SHA-256 of the RFC 8785 canonical form of the payload, under the profile already shared by `daemon/internal/digest` and the kernel digest. The payload is a JSON object with these fields and no others: `schema_version`, `run_id`, `nonce`, `artifact_digest`, `policy_digest`, `effective_config_digest`, `effective_endpoint`, `endpoint_enforcement`, `observed_models`, `platform`, `probe_result`, `workspace_before`, `workspace_after`. `signature` and `key_id` are carried beside that payload and are not inside it. `observed_models` is sorted and contains each name once. Digests are `{ "algorithm": "sha256", "value": "<64 hex>" }`.
2. `key_id` is the hex SHA-256 of the raw 32-byte public key. `signature` is the standard base64 of the 64-byte Ed25519 signature. `nonce` is 32 random bytes, hex, and is stored once for that key. A second use does not count, including on the same run under a new completion.
3. The private key lives in the OS keychain: macOS Keychain via `security` (`service` `controlrod-daemon-signing`, account `controlrod`), and Linux Secret Service via `secret-tool` with the same attributes. If that tool is missing or refuses, the daemon does not sign and does not write a key file. A file is read only when `CONTROLROD_ALLOW_FAKE=1` and `CONTROLROD_TEST_ATTESTATION_KEY` names a regular file of mode `0600` owned by the user and not a symlink. That path is for tests. `controlrod attestation-public` prints the key id and the base64 public key.
4. An administrator enrolls the public key with the passkey command `daemon.enroll-key` (`POST /admin/commands/daemon.enroll-key`). The same gate as pinning a runtime. The server verifies against the enrolled key for that organization. An unknown key does not count.
5. The harness is the runtime stored for the executable's SHA-256 (`runtime_artifact_versions`, or the pin the server sent the daemon). The file name is not an input. A digest with no row does not count. The server does not pick a vendor when the model registry misses.
6. The model registry is `daemon/internal/runner/models.json`. Each entry names the harness, the model strings that count, and the vendor hosts. The effective endpoint recorded today is that host. There is no egress proxy, so `endpoint_enforcement` is `endpoint not enforced`. A statement that says `enforced` does not count. A local model, or one that is not deciding, does not count on Safety or Material. API-key-only CLIs are not entries. Ollama is not an entry.
7. `probe_result` is `not-run` until an in-run probe is qualified. `fail` does not count. Workspace before and after must be the same digest. The policy digest must be the one on the run.
8. The server stores `attestation_verified` and `attestation_reason` on the run. When the check counts, `attestation_verified` is also on the verification record, beside the check. `decide` is still called with the outcome string only.

## Conditions

- A counted Claude or Codex pre-check with a missing attestation, a bad signature, an unknown key, a replayed nonce, an unregistered model, a model alias, an extra stream model, a custom endpoint, a renamed binary, or a failed harness lookup does not count.
- Author and intake launches do not gain checker flags. The fake runtime is not a counted vendor check.
- The test harness sets `CONTROLROD_TEST_UNATTESTED_CHECKS=1` so suite completions that send no attestation still count. A present attestation is still verified. Production leaves the switch unset.

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
