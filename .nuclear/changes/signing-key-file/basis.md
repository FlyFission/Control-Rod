# Basis: The daemon keeps its signing key in a private file, so no keychain dialog blocks a check

On the owner's Mac on 2026-11-26, after #240, Codex passed both sandbox cards (R-177f93fc, R-66f962a9). Then both runs were lost: "no contact with the control plane for a whole lease; stopping the run" (03:48:38Z, 03:49:04Z). macOS SecurityAgent had started 5 seconds after the updated daemon. The keychain ties its item to the binary that created it, every `controlrod update` rebuilds that binary, and the daemon blocked on the password dialog while signing the passed check. A dialog after every update cannot work for an unattended product, and a headless Linux host has no keychain at all.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's signing key is read from and created in `<home>/signing.key` (0600, owned, regular), with the OS keychain only when CONTROLROD_SIGNING_KEY_STORE=keychain. The control plane lets the daemon replace keys it enrolled itself, retiring them, and never a key an administrator enrolled. API and runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
