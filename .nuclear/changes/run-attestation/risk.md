# Risk: run attestation for counted checks

- **Mode:** Standard
- Execution owner: implementing agent under the Milestone 4 brief (run attestation).
- Decision owner: Ben Huffer. Spec additions are minor and additive (Review). No kernel decision function, policy, red-team fixture, or workflow is edited.
- Scope: `daemon/`, `services/api/` (attestation, enrollment, migration `023`), additive spec fields, `docs/daemon.md`, ADR 0022, the command inventory, and this packet. The branch is cut from `cursor/checker-workspace-8f32` (pull request #78), which stacks on #76.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Author launch bytes change. | Checker admission runs only when the workspace is a sandboxed pre-check. Golden files are not rewritten. | Any author file under `testdata/launch-golden/` differs. |
| R-02 | A custom base URL still counts, including an Ollama host. | Checker admission refuses `base_url`, `model_provider`, `*_BASE_URL`, and `OLLAMA_HOST` on the command. The server rejects an endpoint that is not the registry host. | A fixture with a custom base URL still counts. |
| R-03 | A model alias or an extra stream model counts as the pinned model. | Observed names must be the registry entry's names, and the pinned id must be one of them. Dated suffixes are not assumed. | An alias or a second model still verifies. |
| R-04 | A renamed or symlinked binary selects the harness by its file name. | The harness is the runtime stored for the executable's SHA-256. The file name is not an input. | A digest that is not registered is accepted because the name is `claude`. |
| R-05 | A replayed, tampered, or unknown-key attestation counts. | The signature covers the canonical hash. The nonce is stored once. The public key must be enrolled. | One of those fixtures verifies. |
| R-06 | The signing key is written where a test file can be used in production. | The file path is read only when `CONTROLROD_ALLOW_FAKE=1`. The mode must be `0600` and the file must not be a symlink. Otherwise the OS keychain is required, and a missing keychain refuses the signature. | A file key loads with the fake switch unset, or with mode other than `0600`. |
| R-07 | A production path counts a Claude or Codex pre-check with no attestation. | No environment switch exists. Tests sign a real attestation in `sealCountedCheck`. An unattested completion is an inconclusive attempt and leaves no verification. | An unattested Codex or Claude pre-check is stored as a verification. |
| R-08 | The kernel starts treating `attestation_verified` as a decision. | The field is stored on the run and the verification. `decide` is still called with the outcome string only. No file under `kernel/` changes. | A kernel diff, or `decide` receiving the attestation object. |
| R-09 | Migration `023` lands before #77's `020`–`022`, or a failed attestation becomes a sticky fail. | `023` follows `022`. A failed attestation calls `recordCheckerAttempt` with no verification row, so the outcome is `error` and `counts_as` is `inconclusive`. The attempt id is the one assigned at start. | A verification row exists for an attestation failure, or `counts_as` is `fail`. |

## Selected mode

- **Mode:** Standard
- Basis: a counted check can move a package. The change refuses the cases that would make a spoofed run look like that check. The kernel decision is unchanged.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count. Author launch bytes are unchanged. Daemon and server tests are clean. The spec change is additive. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
