# Risk: A fresh daemon creates and enrolls its own signing key

- **Trust on first use.** Anyone holding the daemon token while the organization has no key could enroll a key. The daemon token already lets its holder claim and complete runs, and it is local to the install. After the first key, enrollment needs the administrator's passkey as before, and an administrator can retire the first key with `daemon.retire-key`.
- **Keychain.** `InitSigningKey` never replaces an existing key and creates none when the keychain is locked or unreachable.
- **No trust surface is touched** (no kernel decision function, policy, spec or workflow). This relaxes who may enroll the very first key, called out for the owner.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; an enrolled key can be retired.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

At start the daemon creates its keychain key when none exists and offers the public key to `/runner/signing-key` with its token. The control plane enrolls it only while the organization has never had a key (first use), under an advisory lock; any later key still needs an administrator's passkey. The daemon retries while the keychain or setup is not ready and stops on enrolled, already or needs-admin. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
