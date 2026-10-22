# Independent PR review follow-up, 2026-10-22

Standard-plus: drawing records determine output paths and engineering review notes.

Goal: refuse drawing numbers that escape the output directory, and refuse omitted or
invalid notes instead of silently asserting `NONE.`. No protected trust surface changes.

Findings reproduced on PR #2 at `0ec5b84`: `../escape` becomes an output path outside
the requested directory; missing notes sections and null/false values become `NONE.`.

Changes: reject path separators, control characters and reserved filename characters
in drawing numbers before starting CADCraft;
require every template notes section as a list of nonblank strings. An explicit empty
list means no notes. Document these requirements and add independent refusal tests.

Evidence: new tests failed against the original validation, then all six test methods
passed with the fixes. Command: `python3 -m unittest discover -s tests/conformance/cad
-p test_record.py -v`. `git diff --check` passes. The existing packet validates with
the CI-pinned nuclear-grade validator at `8122269a5b55e5694c8f998ad17955e7ce45798a`.

Limit: these tests prove record refusals, not CAD rendering, output confinement in the
presence of filesystem symlinks, DWG fidelity or AutoCAD compatibility. CADCraft was
unavailable for a fresh nine-check conformance run. Existing CAD evidence remains
historical. Owner review and contributor DCO requirements remain pending.

Publication: the owner instructed "Double check to ensure youre confident then continue"
after reviewing the concrete patches. This authorizes publishing these scoped fixes,
overriding the earlier local-only agent brief for this work. Independent behavior and
standards rechecks found no additional finding, and the six tests passed again.
Commit sign-off identifies the agent's new contribution; it does not certify earlier
contributors' commits or supply the protected-surface owner signature. Merge remains
subject to owner review and the repository's existing gates.
Rollback: discard this isolated branch or revert the eventual fix commit.

## Dependency audit follow-up

The publication surfaced 21 Dependabot advisories in undici 7.24.4 pinned by the
build-only TypeSpec dependency `@scalar/json-magic@0.13.5`. Apply the same narrow
workspace override to 7.30.1 used in the later MVP branch; that version already
appears through another TypeSpec dependency. No production package is added.

Proof: regenerate contracts without drift, run baseline typechecks/tests and license
checks, validate this packet, and repeat the current registry audit. Retain outcomes
under `E:\invention-pipeline\outputs\control-rod-pr-review-2026-10-22`.

## Second Codex review (2026-10-22, on 688dc12)

- Revision rows: `check_record` now refuses a revision with any template column missing or blank; a pending approval is written as "-". Test: `test_blank_or_incomplete_revision_rows_are_refused`.
- Font: `fc-match` always returns its best match, so a missing font came back as a substitute (here "Inter" for a made-up name). `Metrics` now refuses unless the matched family is the one requested, so Pillow measures the font CADCraft draws. Test: `test_missing_font_is_refused_rather_than_substituted` (skips without fontconfig and Pillow).
- Result: `tests/conformance/cad`, 8 passed, 29 subtests passed.

## Required links

- `basis.md`, `trace.md`, `verification.md`, `ship.md`

## Exit criteria

- Regression tests and packet validator pass; owner reviews before publishing or merging.

## Source-lineage note

This is an engineering review record under the existing nuclear-grade workflow: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. It makes no certification or compliance claim.

## Dependency proof outcome

The refreshed audit reports zero known advisories. Baseline typechecking and all
seven API tests pass; TypeSpec regeneration has no tracked drift. The Node license
gate passes for 48 packages. The six drawing-record tests and packet validator pass.
These are local checks; remote CI is verified after publication.

## Revision value follow-up

Independent recheck found that null, boolean, numeric and structured revision values
were stringified rather than refused. Every revision cell now requires nonblank text;
write a numeric revision as a string and a pending approval as "-". The added malformed
value regression failed before the guard and passes afterward. All nine drawing
test methods pass with fontconfig and Pillow available.
