# Plan: Phase 3 distribution prep (install floor, release-notes tooling, proposed release workflow)

1. Create this change record under `.nuclear/changes/r3-distribution-prep/` before editing anything.
2. Write the install floor: `README.md` "Try it" gains `mise install` (the plan's five-command floor); `docs/getting-started.md` "Run it" matches. No new installer, no packaging.
3. Write `tools/release_notes.py`: notes from first-parent commit subjects between `--from` and `--to`, newest first, optional `--preamble`, refusing empty and reversed ranges; plus `tools/test_release_notes.py`, run by hand (CI's python job tests only `sdk/python`).
4. Propose the release workflow byte-exact inside this record as `proposed-release-workflow.yml`: on-demand only; the tag must be annotated, on main, with a successful ci run for that exact commit; the SBOM is that run's `control-rod-sbom.cdx.json` artifact; notes from `tools/release_notes.py`; no third-party release action — `gh` with the job token. Do not write anything under `.github/` in this change.
5. Verify: notes tests green by hand; `pnpm cr doctor` green from this checkout; repo gates (workflow-timeouts, public-claims, originality, owner-decisions) green; record validated `--strict-custody`.
6. Open the PR naming the proposed workflow and asking the owner's recorded yes to land it as `.github/workflows/release.yml` (the verbatim question in `ship.md`). Tagging waits on the owner's version string and macOS decisions.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The README "Try it" and getting-started "Run it" paths are the five-command floor from the plan, with no new installer.
2. `tools/release_notes.py` generates notes from git titles, refuses empty and reversed ranges, supports a committed preamble, and its tests pass by hand.
3. The release workflow exists as a byte-exact proposal inside this record, gated as described, and nothing lands under `.github/` in this change.
4. Repo gates pass: workflow-timeouts, public-claims, originality, owner-decisions (this record), and `pnpm cr doctor` runs green from this checkout.
5. The PR names the proposed workflow and asks the owner for the recorded yes to land it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
