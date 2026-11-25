# Risk: Codex checks run on a Mac under Codex's own sandbox

- **Fence on macOS.** Codex's Seatbelt profile replaces Control Rod's outer one for Codex checkers, as it already does for Grok and Antigravity. The Codex process itself can write its own ~/.codex, as it does for any author run. Its commands cannot. The protected login names (config, instructions, hooks, skills) are still hashed, so a change to them voids the check.
- **Reads.** The outer profile allowed every read except session folders. Codex's checker profile denies the home folder, the login folders and the daemon home for commands, which is narrower.
- **Network.** Commands get none, the same as before. The Codex process reaches its own API.
- **No trust surface is touched.**

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check is not wrapped in the outer Seatbelt profile. Its own permission profile allows reads, writes to scratch only, denies the home folder, login folders and daemon home, and gives commands no network. The before-and-after hashes still apply. #227's isolated login home is removed. Linux is unchanged. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
