# Ship: Phase 3 distribution prep (install floor, release-notes tooling, proposed release workflow)

Release decision: **authorized on green CI without a sign-off table entry for this change** — no trust surface is edited, per the owner's standing governance ("Non-trust changes on green CI proceed without re-asking"). The follow-up that lands the workflow under `.github/` is a trust-surface change and carries the verbatim question below.

- **Shipped:** the five-command install floor in `README.md` "Try it" and `docs/getting-started.md` "Run it" (`mise install` joins the block; nothing else changes), `tools/release_notes.py` with its by-hand tests, and the byte-exact release-workflow proposal inside this record.
- **Not claimed:** that the release workflow runs (it is a proposal; nothing under `.github/` changed); that any release exists yet (the tag waits on the owner's version string and macOS decisions); that `tools/` tests run in CI (they are by-hand, per getting-started's table); that the install floor is proven on any platform but this WSL2 machine (the doctor code it invokes is the same everywhere, but that is an argument, not a run).
- **Ruling recorded in [basis](basis.md) (A-1):** the workflow is proposed outside `.github/` because AGENTS.md rule 2 forbids editing a trust surface without the human signature, not merely merging it. Reviewer feedback reached the same reading; the ruling cites the rule, not the reviewer.
- **Known pre-existing debt, named not fixed:** `check_owner_decisions.py` reports problems in `board-attention`, `control-room-redesign` and `visual-reference-board` (the owner's author-thread records); this record passes clean.

## Sign-off question (for the follow-up change, answered by the owner)

The follow-up change will commit `proposed-release-workflow.yml` (in this record) verbatim as `.github/workflows/release.yml`. The question, asked in the prep PR:

> "Do you approve committing the proposed release workflow from .nuclear/changes/r3-distribution-prep/proposed-release-workflow.yml verbatim as .github/workflows/release.yml — a new trust surface under .github/? It is on-demand only (workflow_dispatch with a tag, a notes-from ref and an optional preamble), refuses a tag that is not annotated, not on main, or whose commit lacks a green ci run, attaches that run's control-rod-sbom.cdx.json, and creates the GitHub release with git-generated notes using only the job token. It never runs on push; the first release also waits on your version string and macOS check."

The answer, when given in the owner's own words, goes in the follow-up record's Signature table under the ADR 0025 conditions. Until then, no `.github/` file is written.

Rollback: revert the squash commit. No production code, contract, migration, workflow or policy change is included.

Monitoring after merge: the prep PR's CI run is the only automation this change rides on; the notes script must be re-run by hand whenever `tools/` changes touch it, and the release record (Step 4) commits the actual notes output as evidence.

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
