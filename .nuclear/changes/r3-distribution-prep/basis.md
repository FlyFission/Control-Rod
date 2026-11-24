# Basis: Phase 3 distribution prep (install floor, release-notes tooling, proposed release workflow)

**Change slug:** `r3-distribution-prep`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Decision this basis supports:** the non-owner-dependent part of Phase 3 of the ten-x amendment program — the install floor (Step 3) and the release tooling (Step 4's preparation) — ahead of the owner's pending version-string (Step 1) and macOS (Step 2) decisions.

## Mission / need

The plan's Phase 3 closes the distribution gap: one tag, zero releases today. Steps 1 and 2 are the owner's (version string; live macOS check, already in progress on his side). Step 3 writes the install path down to its floor, and Step 4's tooling (notes from git, a release workflow) can be built and proposed without deciding either answer, so the release can move the moment the owner's decisions land.

## Scope

In scope:
- `README.md` "Try it": the command block gains `mise install` as the plan's floor states.
- `docs/getting-started.md` "Run it": the same line, matching the prerequisites section that already documents mise.
- `tools/release_notes.py` and `tools/test_release_notes.py`: notes generated from first-parent commit subjects (each change's squash title), refusing empty and reversed ranges, optional preamble.
- This record, including `proposed-release-workflow.yml` — the byte-exact content proposed to become `.github/workflows/release.yml`.

Out of scope:
- Any file under `.github/` (trust surface; untouched in this change — see ruling A-1 below).
- The tag, the release, the version string, and the macOS platform row (the owner's Steps 1–2; the README's current "Expected to work, not yet verified live" stands until his live check reports).
- Any new installer or packaging (the plan's honesty rule: no one-liner before real demand).

## Owner decisions
| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Proceed to Phase 3 while the owner works his two decisions | "Phase 2 accepted, proceed to Phase 3 — I'll do the live macOS check and get you the version string decision." | 2026-11-24, chat session | Execute Phase 3; Steps 1 (version string/scope) and 2 (macOS posture) sit with the owner and gate the tag; everything not dependent on them proceeds now. | The tag itself; any claim about macOS beyond what status.md already carries. |
| D2 | Non-trust changes proceed on green CI; trust surfaces need the recorded yes | "Trust surfaces (all of .github/, docs/adr/, policies/, tests/redteam/, spec/ major versions, kernel decision functions) need my recorded yes naming the surface, recorded in the record's Signature table (ADR 0025 sole-maintainer rule). Non-trust changes on green CI proceed without re-asking." | 2026-11-24, chat session (standing governance, restated from Phase 1) | This change is non-trust and ships on green CI; the proposed release workflow is named for the yes it needs before it is written under `.github/`. | Any reading that would let a trust-surface file be drafted into the tree before the yes (see the ruling below). |

## Rulings (authoring agent, applying the repo's own rules)

| # | Ruling | Authority | Cost if wrong |
|---|---|---|---|
| A-1 | The release workflow is proposed byte-exact inside this record and nothing is written under `.github/` before the owner's recorded yes. | `AGENTS.md` rule 2: "Never edit trust surfaces without a human signature" — the rule forbids the edit, not merely the merge; the proposal names exactly what the yes would cover. Reviewer feedback to the same effect was received and verified against the rule's text. Noted: Phase 1's recorded practice drafted trust-surface files inside PRs before the yes (r1-1, #98); this stricter reading governs this change, and the owner can overrule it as he can any agent ruling. | One extra yes-gated commit; nothing lands that was not approved. |
| A-2 | The notes generator reads the `.nuclear/changes/` record titles (the first heading of each record's `basis.md`, for records first added in the range), and the release workflow attaches the notes file committed at the tag — it never generates notes at dispatch time. | The plan's Phase 3 Step 4: "release notes generated from the `.nuclear/changes/` titles since the last tag (script, output committed as evidence)". The first version of the tool emitted commit subjects and the proposal regenerated notes at dispatch; reviewer feedback named both gaps and both were verified against the plan's text before the sign-off question was answered, so the yes covers the corrected bytes. | The notes list only records added in the range (a record merely modified is excluded); if a change lands without a record, the release's preamble must name it. |

## Fixed inputs

1. The ten-x amendment plan, Phase 3 (`docs/superpowers/plans/2026-11-24-ten-x-amendment.md`, branch `audit/10x-20261124`), and the review's distribution gap (1 tag, 0 releases; install = clone + 4 tools).
2. `mise.toml` toolchain pins and `docs/getting-started.md`'s prerequisites, which already document `mise install` as the toolchain route.
3. `.github/workflows/ci.yml` conventions: actions pinned by SHA, `timeout-minutes` on every job (enforced by `tools/check_workflow_timeouts.py`), the SBOM artifact name `control-rod-sbom.cdx.json`, and the `NUCLEAR_GRADE_SHA` pin.
4. `AGENTS.md` rule 2 and ADR 0025's sole-maintainer sign-off conditions.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Every change that lands on main is a squash merge whose subject states the change, so first-parent subjects are the change titles. | `docs/collaboration.md` ("The squash title is the commit on `main`, so make it say what changed") and main's history. | A change landing by any other merge style; the notes script would miss it, and the release record must then name it in the preamble. |
| The SBOM artifact a release attaches is the one ci.yml built for that exact commit. | `ci.yml`'s sbom job uploads `control-rod-sbom.cdx.json` per run. | The artifact name or job changing in ci.yml; the proposed workflow's download step must be updated with it. |
| The python CI job does not run `tools/` tests. | `ci.yml`'s python job runs pytest only in `sdk/python`; getting-started's table marks the by-hand checks. | A change that adds tools tests to CI; then this record's "by hand" limit note is stale. |

## Open questions for Ben (not decided here)

1. The version string and the first release's notes range (Step 1 — his).
2. The macOS row after his live check (Step 2 — his; the notes preamble will repeat whatever status.md then carries).
3. The recorded yes to land `proposed-release-workflow.yml` as `.github/workflows/release.yml` — asked in the prep PR, verbatim question in `ship.md`.

## Verification limits (what the tests and gates enforce)

- `release_notes.py` proves the notes are git-derived and refuses degenerate ranges; it does not prove the notes are *good* — the preamble is the owner's honesty surface and is committed with the release record, not generated.
- The proposed workflow's gates (annotated tag, commit on main, green ci run for that commit, that run's SBOM) are design, not executed code — nothing under `.github/` runs until the yes lands it.
- The install floor is documentation; `pnpm cr doctor` running green from this checkout is the evidence that the floor's commands work as written, on one machine (WSL2).

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
