# Trace: Phase 3 distribution prep (install floor, release-notes tooling, proposed release workflow)

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| R3-1 | The install path is the plan's five-command floor (clone → `mise install` → `pnpm install` → `pnpm cr doctor` → `pnpm cr start`), with no new installer or packaging. | E-03 (`README.md` "Try it" command block; `docs/getting-started.md` "Run it"), E-01 (`pnpm cr doctor` green from this checkout) | done |
| R3-3 | The release workflow is proposed byte-exact outside `.github/`, gated on an annotated tag on main with its own green ci run, attaching that run's SBOM artifact and the release notes committed at the tag (refusing to run if the notes file is absent), using only the job token. | E-03 (`proposed-release-workflow.yml` inside this record) | done as a proposal — not executed, not wired; landing is a separate yes-gated change |
| R3-2 | Release notes are generated from the change records' titles, never typed: the first heading of each record's `basis.md`, for records first added in the range, newest first, optional committed preamble; empty and reversed ranges are refused. The output is committed with the release record, and the workflow attaches those bytes. | E-02 (`tools/test_release_notes.py`, 6 passed by hand), E-03 (the proposal attaches the committed notes file and refuses to run without it) | done |
| R3-4 | No trust surface is edited in this change. | E-04 (diff file list: no `.github/` path) | done |
| R3-5 | The PR names the proposed workflow and asks the owner's recorded yes verbatim. | E-05 (the PR body and `ship.md`'s Signature table to be filled by his answer) | open — merge of the yes-gated follow-up waits on his words |

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
