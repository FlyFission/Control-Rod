# Ship: v0.1.0 first release

Release decision: **the commit ships on green CI without a sign-off table entry** — no trust surface is edited. The tag and the GitHub release are cut only after that commit's main ci run is green.

- **Shipped in this commit:** the notes generator's Quick-record fallback, and [evidence/release-notes.md](evidence/release-notes.md), the script's output for `phase0-before-rebase..origin/main` with the honesty preamble.
- **Cut after merge, not in this commit:** annotated tag `v0.1.0` on the green main commit; GitHub release whose body is `release-notes.md`; SBOM artifact from that commit's ci run.
- **Not claimed:** a live macOS start; phone approvals; remote daemons; that `.github/workflows/release.yml` exists (it does not; the proposal remains in `r3-distribution-prep` until a recorded yes).
- **Ruling A-1:** the only tag is not an ancestor of main, so the notes are every titled record on main.
- **Ruling A-2:** Quick records take their title from `risk.md`. Reviewer feedback named `ao-daemon-lock-probe`; the other three no-basis directories were checked the same way. Not the owner's words.

Monitoring: after the tag, the GitHub release body must stay equal to `evidence/release-notes.md` at the tag. A later edit of that file on main does not change the release.

Rollback: delete the tag and the GitHub release, and revert the squash commit. No migration, workflow, or policy change is included.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The owner-accepted defaults are recorded: `v0.1.0`, notes since `phase0-before-rebase`, macOS row unchanged.
2. `release-notes.md` is the script's output for that range, including Quick records via `risk.md`, and the tests pass.
3. The annotated tag and GitHub release exist only after this commit's main ci run is green, with that run's SBOM attached.
4. The release does not promise phone approvals, remote daemons, or a verified macOS start.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
