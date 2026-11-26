# Plan: A fresh daemon creates and enrolls its own signing key

1. API: `enrollFirstDaemonKey` in run-attestation.ts and route `POST /runner/signing-key` (daemon token), run as catalog command `daemon.enroll-first-key`. Statuses: enrolled, already, needs-admin, no-organization. Advisory lock so two daemons cannot both enroll a first key.
2. Daemon: `Config.SigningKey` (set to `InitSigningKey` by `controlrod daemon`), `enrollSigningKey` loop with doubling wait to five minutes, `Client.EnrollSigningKey`.
3. Tests: test/daemon-first-key.test.ts; signing_enroll_test.go.
4. docs/daemon.md paragraph.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

At start the daemon creates its keychain key when none exists and offers the public key to `/runner/signing-key` with its token. The control plane enrolls it only while the organization has never had a key (first use), under an advisory lock; any later key still needs an administrator's passkey. The daemon retries while the keychain or setup is not ready and stops on enrolled, already or needs-admin. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
