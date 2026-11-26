# Trace: Claude checks on a Mac can reach their model (DNS in the sandbox)

| Need | Code | Test |
| --- | --- | --- |
| A checker resolves host names on macOS | `daemon/internal/runner/checker.go` seatbeltProfile, mDNSResponderSocket | `checker_darwin_test.go` TestSeatbeltCheckerResolvesHostNames (platforms workflow, macos-15) |
| Only that socket is allowed | `daemon/internal/runner/checker.go` seatbeltProfile | `checker_test.go` TestSeatbeltProfileDeniesWritesExceptScratch; TestSeatbeltCheckerCannotReachAHostUnixSocket |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker resolves host names inside its Seatbelt sandbox: the profile still denies every outbound Unix socket except /private/var/run/mDNSResponder. A darwin test resolves a real host name under the profile, a profile test pins the single allow, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
