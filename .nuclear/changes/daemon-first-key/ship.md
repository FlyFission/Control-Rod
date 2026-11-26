# Ship: A fresh daemon creates and enrolls its own signing key

Release decision: **merge on green** under the owner's standing permission (2026-11-25, through 2026-12-02).

- Rollback: revert the merge; retire the key with `daemon.retire-key` if wanted. No migration.
- Monitoring after merge: the daemon log on the owner's Mac shows "daemon signing key ready", and sandbox card checks are no longer voided for a missing key.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

At start the daemon creates its keychain key when none exists and offers the public key to `/runner/signing-key` with its token. The control plane enrolls it only while the organization has never had a key (first use), under an advisory lock; any later key still needs an administrator's passkey. The daemon retries while the keychain or setup is not ready and stops on enrolled, already or needs-admin. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
