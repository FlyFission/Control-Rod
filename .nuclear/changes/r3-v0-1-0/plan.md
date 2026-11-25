# Plan: v0.1.0 first release

1. Create this record before tagging.
2. Teach `tools/release_notes.py` to take a Quick record's title from `risk.md` when `basis.md` is absent. Test that case.
3. Generate `release-notes.md` with `tools/release_notes.py --from phase0-before-rebase --to origin/main` and the honesty preamble. Commit it in this record. Do not hand-edit the generated list.
4. Merge on green CI. No `.github/` edit.
5. After main's ci run for the merge commit is green: annotated tag `v0.1.0` on that commit; GitHub release whose body is the committed notes; SBOM from that run's `control-rod-sbom.cdx.json`.
6. Fresh clone at the tag: `mise install`, `pnpm cr doctor`, `pnpm cr start` reaches the board. Record the result here.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The owner-accepted defaults are recorded: `v0.1.0`, notes since `phase0-before-rebase`, macOS row unchanged.
2. `release-notes.md` is the script's output for that range, including Quick records via `risk.md`, and the tests pass.
3. The annotated tag and GitHub release exist only after this commit's main ci run is green, with that run's SBOM attached.
4. The release does not promise phone approvals, remote daemons, or a verified macOS start.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
