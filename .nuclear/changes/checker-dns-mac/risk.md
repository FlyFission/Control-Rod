# Risk: Claude checks on a Mac can reach their model (DNS in the sandbox)

- The checker gains one Unix socket: the system name resolver. It answers lookups only; every other host socket (agents, Docker, ssh-agent) stays denied, which the existing darwin test keeps proving.
- No file-write rule changes. No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker resolves host names inside its Seatbelt sandbox: the profile still denies every outbound Unix socket except /private/var/run/mDNSResponder. A darwin test resolves a real host name under the profile, a profile test pins the single allow, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
