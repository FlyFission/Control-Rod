# Plan: Claude checks on a Mac can reach their model (DNS in the sandbox)

1. Read the failed runs' logs (ENOTFOUND on the first turn) and confirm on the Mac with sandbox-exec and curl, with and without the allow.
2. Tests first: a profile test pinning the single allow, and a darwin test resolving a host name under the profile.
3. Allow only mDNSResponder's socket; vet for linux and darwin; PR, merge on green.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker resolves host names inside its Seatbelt sandbox: the profile still denies every outbound Unix socket except /private/var/run/mDNSResponder. A darwin test resolves a real host name under the profile, a profile test pins the single allow, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
