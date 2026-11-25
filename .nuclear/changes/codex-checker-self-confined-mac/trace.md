# Trace: Codex checks run on a Mac under Codex's own sandbox

| Need | Change | Evidence |
| --- | --- | --- |
| Codex's sandbox can start on a Mac | `SelfConfinedChecker` on darwin | `TestSeatbeltCodexCheckerIsSelfConfined` (platforms workflow) |
| Its own profile carries the checker's limits | existing `codexPolicyArgsFor` checker branch | `TestCodexCheckerProfileCarriesTheCheckersLimits` |
| Claude stays wrapped | unchanged | `TestSeatbeltCheckerSessionSymlinkDoesNotGrantHomeWrites` (now on Claude) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check is not wrapped in the outer Seatbelt profile. Its own permission profile allows reads, writes to scratch only, denies the home folder, login folders and daemon home, and gives commands no network. The before-and-after hashes still apply. #227's isolated login home is removed. Linux is unchanged. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
