# Basis: Codex checks run on a Mac under Codex's own sandbox

#227 gave a macOS Codex checker a writable login home, which cleared the app-server error. The next run on the owner's Mac (2026-11-25, R-3c2f50be) failed 5 s in with "failed to load AGENTS.md instructions ... fs sandbox helper failed with status exit status: 71: sandbox-exec: sandbox_apply: Operation not permitted". Codex 0.172 runs its own Seatbelt helper even to read AGENTS.md, and Seatbelt profiles do not nest. This was measured on the same Mac on 2026-11-24 for Antigravity, and Grok already relies on it. Those two runtimes are already self-confined checkers (`SelfConfinedChecker`). Codex's checker permission profile already sets read-only except scratch, read denies for the policy's denied paths, and no network.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check is not wrapped in the outer Seatbelt profile. Its own permission profile allows reads, writes to scratch only, denies the home folder, login folders and daemon home, and gives commands no network. The before-and-after hashes still apply. #227's isolated login home is removed. Linux is unchanged. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
