# Trace: A fresh daemon creates and enrolls its own signing key

| Need | Change | Evidence |
| --- | --- | --- |
| First key enrolled with no passkey | `enrollFirstDaemonKey`, `/runner/signing-key` | test/daemon-first-key.test.ts |
| Later keys still need an administrator | needs-admin status | same test |
| Daemon creates and offers its key, retrying | `enrollSigningKey`, `Client.EnrollSigningKey` | `TestDaemonEnrollsItsSigningKeyAtStart`, `TestDaemonStopsWhenAnAdministratorMustEnroll` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

At start the daemon creates its keychain key when none exists and offers the public key to `/runner/signing-key` with its token. The control plane enrolls it only while the organization has never had a key (first use), under an advisory lock; any later key still needs an administrator's passkey. The daemon retries while the keychain or setup is not ready and stops on enrolled, already or needs-admin. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
