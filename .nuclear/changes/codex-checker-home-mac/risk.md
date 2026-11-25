# Risk: Codex checks run on a Mac again: a login home of their own

- **Narrower than before.** The host sign-in file is no longer writable by the checker process on macOS. Only the daemon writes it, after the run, under the compare-and-swap rule.
- **Lost rotation.** If two checks refresh at once, the second save sees the host changed and leaves it alone. That check's own token copy is discarded with its temporary directory.
- **Claude, Grok, Antigravity unchanged.** Only a runtime that declares an isolated login home (Codex) takes this path.
- **No trust surface is touched.**

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check runs with CODEX_HOME in its own per-run temporary directory, holding a copy of the sign-in. The real login folder, sign-in file included, is never writable during the check. A refreshed sign-in is saved back only when it changed, is valid JSON, and the host file still holds what was copied in. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
