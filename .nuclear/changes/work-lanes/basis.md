# Basis: work lanes

**Change slug:** `work-lanes`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24

## Mission / need

The Plant's six work bays are fixed to capital-project disciplines (Process, Mechanical, Electrical, Civil, Assurance, Project controls), and `cubeFor` in `services/api/src/figures.ts` places a package by keywords in its free-text discipline. On a software project almost every package lands in Process, so the bays say nothing. The owner asked for the bays to be project-defined lanes with presets, sorted by the card's lane tag or the repository paths it touches, with the preset picked from the repository at setup.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Make the Plant's work rooms project-defined lanes with presets: "Software" (Frontend, Backend, Platform, Data, Tests, Docs), "Capital project" (today's six) and custom lanes (up to six). Sort work by the card's lane tag or the repository paths it touches, with unsorted work going to a general bay, and propose the preset from the repository at setup. | "Yes, presets plus custom lanes" | 2026-11-24, 16:34 UTC, tapped on a decision card in the owner's chat with the agent | The card asked "Make the Plant's work rooms project-defined lanes with presets?" and the option's consequence read "I change the spec so each project picks Software, Capital project or custom lanes; the art stays the same and the room labels follow the project." The record builds what the proposal he read described: presets plus custom lanes, labels that follow the project, the same art, sorting by tag then paths, and a preset proposed at setup. This is the owner's decision to build it. | **This is not the signature.** The tap approved the direction, not this pull request's diff. The `spec/` change needs the owner's recorded yes to a question that names this pull request (#167) as it stands; that yes is asked once the diff is final and is recorded in `ship.md`'s Signature table, not here. Also not covered: new art, a seventh bay, renaming the seven rooms. |
| D2 | A custom set holds at most six lanes, and a seventh is refused rather than folded into "+N more". | none: authoring agent's choice, open to the owner | 2026-11-24, this record | The Plant has six work-bay tiles; a lane with no bay to stand in would be invisible. "+N more" already folds figures inside a crowded bay and is unchanged. | A seventh bay tile. |
| D3 | The Software preset's general lane is Platform: work no tag, path or keyword places stands there, not in Process. | none: authoring agent's choice, open to the owner | 2026-11-24, this record | The six Software lanes are the owner's list and fill all six bays, so a separate "Engineering" bay would be a seventh. The general lane is one of the six and its purpose says so. | Naming a bay "Engineering"; the owner may prefer to swap one lane for it. |
| D4 | A card's explicit lane tag is its existing `discipline` text, equal to a lane id or name. No new field on the work package. | none: authoring agent's choice, open to the owner | 2026-11-24, this record | Least invasive: the work package contract is untouched, and old cards that name a discipline keep working. | A dedicated lane field on the card. |

## Scope

In scope: `spec/tenancy.tsp` and `spec/api.tsp` (additive, optional fields only), regenerated code, a migration, the API's storage, sorting and setup detection, the Plant's bay names and accessible names, a project setting on the Board's project bar, tests, and this record.

Out of scope: the plant art and geometry, the seven rooms, `WorkPackage`, any policy, red-team fixture, workflow or kernel decision function, and a spec major version.

## Assumptions and invalidation triggers

- The owner's tap on 2026-11-24 16:34 UTC is a decision, not a signature. If the diff changes after the signature question is asked, ask again (docs/collaboration.md, sole-maintainer sign-off).
- Recorded run outputs are the best available record of the repository paths a package touches. If a better record lands (changed files per run), the path step should read it.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md), [ship](ship.md).

## Exit criteria

A project can pick Software, Capital project or custom lanes; the Plant's bay names, purposes and accessible names follow the project; work is placed by tag, then paths, then keywords, then the default lane; existing projects and stored figures behave as before; the spec regenerates with no drift; tests, typechecks and record checks pass; the owner's recorded yes to a question naming #167 is in `ship.md` before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
