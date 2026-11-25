# Plan: Codex checks run on a Mac under Codex's own sandbox

1. `codexAdapter.SelfConfinedChecker` returns true on darwin only, so `applyCheckerMount` does not wrap it.
2. Revert #227's isolated login home (`prepareIsolatedLoginHome`, `SaveRefreshedCredential`, `CredentialCopy`), which no runtime uses now. Its change record stays as history.
3. Tests: `TestCodexCheckerProfileCarriesTheCheckersLimits` checks the profile's root read, workspace read, scratch write, home deny, no network and no `:workspace` extends. `TestSeatbeltCodexCheckerIsSelfConfined` (darwin) checks the launch is not wrapped. The symlink-session darwin test moves to Claude, which is still wrapped. The agy test now asserts Codex is self-confined on darwin only.
4. docs/daemon.md: one paragraph.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check is not wrapped in the outer Seatbelt profile. Its own permission profile allows reads, writes to scratch only, denies the home folder, login folders and daemon home, and gives commands no network. The before-and-after hashes still apply. #227's isolated login home is removed. Linux is unchanged. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
