# Basis: run attestation for counted checks

**Change slug:** `run-attestation`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-15
**Decision this basis supports:** whether a Claude or Codex pre-check can count when its endpoint, model, executable, or daemon signature is not the one the registry and the enrolled key name.

## Mission / need

Milestone 4 of the multi-provider plan (run attestation). A counted pre-check must say which executable ran, which config it ran under, which endpoint and models the stream showed, and that the daemon signed that statement. The server checks the signature and records `attestation_verified` beside the check. The kernel does not read that field until milestone 6.

Depends on the checker workspace, pull request #78, branch `cursor/checker-workspace-8f32`, which is cut from the adapter seam, pull request #76. Neither is merged. This branch is cut from #78.

The milestone text is the design input. No separate multi-provider design file is in this tree. ADR 0021 still holds: Control Rod does not read or copy a CLI token. ADR 0022 records the attestation bytes and where the signing key lives.

Pull request #77 records checker attempts in the same server area. This change does not edit those tables. The new migration is `023-run-attestation`, leaving `020` through `022` for #77.

## Scope

In scope: `daemon/` (config admission, observed models, Ed25519 attestation, test-only file key, tests), `services/api/` (verification, enrollment, migration `023`), additive spec fields, `docs/daemon.md`, `docs/adr/0022-run-attestation.md`, `docs/commands/inventory.md`, and this packet.

Out of scope: `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, a spec major version, author and intake argv, and the fake runtime's pre-check layout.

## Fixed inputs

- ADR 0021: real login, no token handling in Control Rod.
- The author launch fixtures in `daemon/internal/runner/testdata/launch-golden/`. Those bytes are not rewritten.
- RFC 8785 under the profile already shared by `daemon/internal/digest` and the kernel digest. The signature covers the SHA-256 of that form. This change does not edit the kernel.
- Model names already used in this tree: `claude-sonnet-4-5` and `gpt-5-codex`, with the vendor hosts `api.anthropic.com` and `api.openai.com`. No other model id is added.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `--ignore-user-config` is what makes Codex's generated `-c` overrides the effective config. | The flags are already on every Codex launch. A counted check refuses a `-c` or settings value that names a base URL. | A Codex build that still reads `base_url` from a file those flags do not ignore. |
| The environment allowlist already drops `*_BASE_URL`. | `AgentEnv` is unchanged. Admission also refuses those keys if they appear on a checker command. | A checker command whose environment still contains a base URL. |
| No egress proxy is implemented. | The attestation label is `endpoint not enforced`. The server rejects `enforced`. | A proxy that can prove the connected host. |
| The OS keychain was not executed here. | macOS calls `security`. Linux calls `secret-tool`. Tests use a `0600` file only when `CONTROLROD_ALLOW_FAKE=1`. | A run on Ben's Mac that stores and loads the key, or a Linux session where `secret-tool` is absent and a counted check still signs. |
| The fake runtime is not a counted vendor check. | Existing API completions for `fake` stay as they are. Claude and Codex without a valid attestation do not count, except the test harness switch documented in `risk.md`. | A fake completion that the server treats as a vendor attestation. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count: a custom base URL, a model alias, a renamed binary, an extra model in the stream, a replayed attestation, a tampered field, and an unknown signing key. Author launch bytes are unchanged. `gofmt`, `go vet` for linux, darwin, and windows, and `go test ./...` in `daemon/` are clean. Server tests pass. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
