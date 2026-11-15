# Verification: run attestation for counted checks

| ID | Result | What was checked | Evidence |
|---|---|---|---|
| E-01 | pass | A custom base URL in Codex `-c` or `OPENAI_BASE_URL` is refused before a counted check starts. | `daemon` `go test` (`TestCheckerRefusesCustomBaseURL`, `TestCheckerRefusesBaseURLEnv`) in `evidence/test.log` |
| E-02 | pass | An alias, an extra stream model, and an unregistered model do not count. A local model does not count on Safety or Material. The registry does not default a vendor. | `TestCheckerRefusesModelAliasAndExtraModel`, `TestCheckerRefusesUnregisteredModel`, `TestLocalModelIsNotDecidingOnSafety`; API `test/run-attestation.test.ts` |
| E-03 | pass | The harness is the digest, not the file name. A second digest is refused. A pin digest selects that pin's runtime. | `TestHarnessFollowsDigestNotName`; API renamed-binary cases |
| E-04 | pass | Ed25519 over the RFC 8785 SHA-256. A tampered field and an unknown key fail. The Go vector's hash matches the server digest. A replayed nonce fails. | `TestAttestationSignsAndRejectsTamper`, `TestAttestationVector`; API spoof cases |
| E-05 | pass | The file key is refused unless `CONTROLROD_ALLOW_FAKE=1` and the mode is `0600`. | `TestFileKeyRequiresFakeAndMode` |
| E-06 | pass | Enrollment requires a passkey. A Codex pre-check with no attestation is recorded failed, `attestation_verified` false, and inserts no verification. | API `enrollment` tests. 639 API tests passed (`evidence/api-suite.log`) |
| E-07 | pass | Author launch bytes are unchanged. `gofmt -l` is empty. `go vet` exits 0 for linux, darwin, and windows. `go test -count=1 ./...` in `daemon/` exits 0. | `evidence/vet.log`, `evidence/test.log`. No diff under `testdata/launch-golden/` |
| E-08 | pass | `pnpm -r run typecheck` exits 0. Spec compile output is the generated files in the diff. No `kernel/` diff. | typecheck this session; `evidence/diff-stat.txt` |

Not qualified: macOS Keychain on Ben's Mac, Linux `secret-tool` against a session bus, a real Claude Code or Codex binary, an egress proxy, and an in-run probe (`probe_result` stays `not-run`).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Spoofed checks do not count. Author launch bytes are unchanged. Daemon and server tests are clean. The spec change is additive. The kernel is not edited. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
