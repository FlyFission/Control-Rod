# Basis: A fresh daemon creates and enrolls its own signing key

On the owner's Mac on 2026-11-26 both sandbox cards (5A574D7A-README-HELLO, 20D3FB1B-README-LINE) stayed in "Being checked": every counted check was voided with "the daemon signing key is not in the OS keychain". The key was created only by `controlrod attestation-public`, and enrolled only through the passkey-signed admin command `daemon.enroll-key`. Neither `controlrod start`, `setup` nor `update` did either, so a fresh install could never count a check and no card could finish on its own.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

At start the daemon creates its keychain key when none exists and offers the public key to `/runner/signing-key` with its token. The control plane enrolls it only while the organization has never had a key (first use), under an advisory lock; any later key still needs an administrator's passkey. The daemon retries while the keychain or setup is not ready and stops on enrolled, already or needs-admin. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
