# Trace: The daemon keeps its signing key in a private file, so no keychain dialog blocks a check

| Need | Change | Evidence |
| --- | --- | --- |
| No keychain dialog | file key store | `TestSigningKeyIsAPrivateFileInTheHome` |
| Unsafe key file refused | `readKeyFile` | same test (0644 refused) |
| Daemon's new key replaces its own old one | `enrollFirstDaemonKey` | daemon-first-key.test.ts |
| Admin-enrolled key protected | same | same test |
| Keychain still works when chosen | opt-in | `TestSecretToolCreatesOnlyWhenStderrIsEmpty` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's signing key is read from and created in `<home>/signing.key` (0600, owned, regular), with the OS keychain only when CONTROLROD_SIGNING_KEY_STORE=keychain. The control plane lets the daemon replace keys it enrolled itself, retiring them, and never a key an administrator enrolled. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
