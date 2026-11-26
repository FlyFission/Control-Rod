# Plan: The daemon keeps its signing key in a private file, so no keychain dialog blocks a check

1. keystore.go: `SigningKey`/`InitSigningKey` use `<home>/signing.key` (O_EXCL create, 0600, same checks as the test key file). The keychain is used only with CONTROLROD_SIGNING_KEY_STORE=keychain.
2. run-attestation.ts `enrollFirstDaemonKey`: when every key was enrolled by `daemon-first-use`, a new key retires those and is enrolled. Otherwise the answer is needs-admin.
3. Tests: keystore_file_test.go, daemon-first-key.test.ts, and the keychain test opting in.
4. docs/daemon.md.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's signing key is read from and created in `<home>/signing.key` (0600, owned, regular), with the OS keychain only when CONTROLROD_SIGNING_KEY_STORE=keychain. The control plane lets the daemon replace keys it enrolled itself, retiring them, and never a key an administrator enrolled. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
