# Trace: v0.1.0 first release

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| R310-1 | Version `v0.1.0`, macOS row unchanged, no phone approvals or remote daemons promised. | E-01 (`release-notes.md` preamble), D1 in [basis](basis.md) | done in the notes; the tag is cut after merge |
| R310-2 | Notes are the script's output for `phase0-before-rebase..origin/main`, including Quick records via `risk.md`. | E-02 (tests), E-01 (the committed file) | done |
| R310-3 | Tag and GitHub release only after a green main ci run, with that run's SBOM. | E-03 | done |
| R310-4 | Fresh clone at the tag: `mise install`, `pnpm cr doctor`, `pnpm cr start` reaches the board. | E-04 (`evidence/board-chromium.png`) | done on WSL2, not macOS |
| R310-5 | No trust surface edited. | E-05 (diff has no `.github/` path) | done |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The owner-accepted defaults are recorded: `v0.1.0`, notes since `phase0-before-rebase`, macOS row unchanged.
2. `release-notes.md` is the script's output for that range, including Quick records via `risk.md`, and the tests pass.
3. The annotated tag and GitHub release exist only after this commit's main ci run is green, with that run's SBOM attached.
4. The release does not promise phone approvals, remote daemons, or a verified macOS start.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
