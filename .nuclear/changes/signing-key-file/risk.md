# Risk: The daemon keeps its signing key in a private file, so no keychain dialog blocks a check

- **Key at rest.** A 0600 file is readable by any process of the same user, the same exposure as the daemon token beside it, whose holder can already claim and complete runs. The keychain stays available with CONTROLROD_SIGNING_KEY_STORE=keychain.
- **Self-replacement.** The daemon may replace only keys it enrolled itself. An administrator-enrolled key blocks it, so an administrator's choice stands.
- No trust surface is touched (no kernel decision function, policy, spec or workflow). The key store change is security-relevant and is called out for the owner.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; a key can be retired.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's signing key is read from and created in `<home>/signing.key` (0600, owned, regular), with the OS keychain only when CONTROLROD_SIGNING_KEY_STORE=keychain. The control plane lets the daemon replace keys it enrolled itself, retiring them, and never a key an administrator enrolled. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
