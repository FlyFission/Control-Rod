# Risk: Phase 3 distribution prep (install floor, release-notes tooling, proposed release workflow)

- **Mode:** Standard
- Execution owner: authoring agent under the 2026-11-24 ten-x amendment program, Phase 3.
- Decision owner: Ben Huffer. **No trust surface is edited by this change**: `.github/` is untouched; the release workflow is proposed byte-exact under this record (`.nuclear/changes/r3-distribution-prep/proposed-release-workflow.yml`) and lands as `.github/workflows/release.yml` only under the owner's recorded yes naming it.
- Scope: `README.md` ("Try it"), `docs/getting-started.md` ("Run it"), `tools/release_notes.py`, `tools/test_release_notes.py`, this record, and the proposed workflow file inside it. Tagging and the release itself are out of scope (they wait on the owner's version-string and macOS decisions).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The release workflow, once wired, publishes a release that overstates platform support (macOS live login unverified) or attaches an SBOM that does not belong to the tagged commit. | The proposed workflow refuses to run without a successful ci run for the tag's exact commit, downloads that run's SBOM artifact (never regenerates one), and carries the notes generated from git; the release notes' honesty preamble (the platform table, Step 2's macOS outcome) is a committed input, not ad-hoc prose. | Any release created for a commit without its own green ci run, or any platform claim in the notes that status.md does not carry. |
| R-02 | Release notes typed by hand drift from what actually shipped. | `tools/release_notes.py` reads the titles out of git (first-parent squash subjects); an empty or reversed range is refused, not printed empty. | Any hand-edited line in generated notes, or an empty-range invocation that exits 0. |
| R-03 | The install path grows beyond the floor (a one-liner installer, a new packaging step) that nobody has asked for yet. | The change only documents the existing floor (`mise install` was already the documented toolchain route) and adds no installer, no packaging, no binary artifact. | Any new install mechanism beyond the five documented commands. |
| R-04 | A trust-surface edit slips in under a "prep" label. | The diff touches no `.github/` file; the proposed workflow lives inside this record, and its landing is a separate, yes-gated change. | Any file under `.github/` in this change's diff. |

## Selected mode

- **Mode:** Standard
- Basis: documentation and a stdlib-only tool with a by-hand test; no production code, contract, migration or trust-surface change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The README "Try it" and getting-started "Run it" paths are the five-command floor from the plan (clone → `mise install` → `pnpm install` → `pnpm cr doctor` → `pnpm cr start`), with no new installer.
2. `tools/release_notes.py` generates notes from git titles, refuses empty and reversed ranges, supports a committed preamble, and its tests pass by hand (CI's python job does not run `tools/` tests).
3. The release workflow exists as a byte-exact proposal inside this record, gated on the tag being an annotated main commit with its own green ci run, attaching that run's SBOM artifact, and nothing lands under `.github/` in this change.
4. Repo gates pass: workflow-timeouts (still 4 files — nothing new under `.github/`), public-claims, originality, owner-decisions (this record), and `pnpm cr doctor` runs green from this checkout.
5. The PR names the proposed workflow and asks the owner for the recorded yes to land it as `.github/workflows/release.yml`.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
