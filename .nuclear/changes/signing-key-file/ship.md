# Ship: The daemon keeps its signing key in a private file, so no keychain dialog blocks a check

Release decision: **merge on green** under the owner's standing permission (2026-11-25, through 2026-12-02).

- Rollback: revert the merge. The old keychain item is left untouched.
- Monitoring after merge: on the owner's Mac the daemon logs "daemon signing key ready" with no keychain dialog, and passed checks count.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's signing key is read from and created in `<home>/signing.key` (0600, owned, regular), with the OS keychain only when CONTROLROD_SIGNING_KEY_STORE=keychain. The control plane lets the daemon replace keys it enrolled itself, retiring them, and never a key an administrator enrolled. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
