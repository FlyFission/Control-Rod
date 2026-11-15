# Plan: run attestation for counted checks

1. Keep the environment allowlist. For a sandboxed pre-check, refuse the launch when the generated config or the command environment names a custom base URL (`base_url`, `model_provider`, `*_BASE_URL`, `OLLAMA_HOST`). Codex counted checks must still pass `--ignore-user-config` and `--disable multi_agent`. Claude counted checks must not pass `--fallback-model`. Author argv is not edited.
2. Ship a registry of pinned models. Each entry names the harness, the model strings that count, and the vendor hosts. Record the registry host as the effective endpoint. The enforcement label is `endpoint not enforced` until a proxy exists. An unknown model does not count. A local model, or one marked not deciding, does not count on Safety or Material. API-key-only CLIs are not entries.
3. Collect every model name `StreamMetadataParser` reports (or `ReportedModel` when the adapter does not implement it). A name outside the pinned entry, or a stream that never names the pinned model, does not count.
4. Sign an Ed25519 attestation over the RFC 8785 SHA-256 of the payload in ADR 0022: artifact digest, policy digest, effective config digest, effective endpoint, observed models, platform, probe result (`not-run` until an in-run probe is qualified), workspace before and after hashes, run id, and a nonce. The signing key is the OS keychain. A `0600` file is read only when `CONTROLROD_ALLOW_FAKE=1` and `CONTROLROD_TEST_ATTESTATION_KEY` is set.
5. The server verifies the signature against an enrolled public key. Enrollment is the passkey command `daemon.enroll-key`. It records `attestation_verified` on the run and, when the check counts, on the verification. A missing field, a bad signature, an unknown key, a replayed nonce, an unregistered model, a failed harness lookup, a custom endpoint, or a failed probe does not count. The harness is the runtime stored for that SHA-256, never the file name. The kernel is not asked to read the field.
6. The API test harness sets `CONTROLROD_TEST_UNATTESTED_CHECKS=1` so existing Claude and Codex completions that send no attestation still count. A present attestation is always checked. Production must leave the switch unset.
7. Regenerate spec outputs. Run `gofmt`, `go vet` for linux, darwin, and windows, and `go test ./...` in `daemon/`. Run the API attestation tests.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count. Author launch bytes are unchanged. Daemon and server tests are clean. The spec change is additive. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
