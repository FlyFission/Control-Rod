# Risk: A check is not voided when another agent run writes the shared login folder

- **Defense in depth.** For mounted checkers, the before-and-after login hash was a second guard behind the mount's write denial. The mount (bubblewrap read-only bind, Seatbelt write deny) is now the only guard. It is tested on Linux (`checker_linux_test.go`, writes to settings.json, CLAUDE.md and hooks fail) and on macOS in the platforms workflow (`checker_darwin_test.go`). If the mount cannot be applied, the check is refused, as before.
- **Self-confined checkers** that use the real login folder (Grok, Antigravity) are still compared, so they keep the false-positive exposure for now.
- **No trust surface is touched** (no kernel, policy, spec or workflow change). This is a security-relevant narrowing, called out for the owner.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The protected-login hash is compared only for a checker that could write its real login folder (self-confined, no disposable home). Mounted Claude and Codex checkers on Linux and macOS, and macOS Codex checkers with their own home, are not compared. Grok and Antigravity still are. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
