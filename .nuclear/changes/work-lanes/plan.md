# Plan: work lanes

## The shape, and why

A bay slot is a position on the Plant floor; a work lane is what a project puts there. The existing six cube-set ids stay the figure `place` values unchanged and are documented as positions (`WorkBaySlot`). Lane i stands in slot i. Under the capital-project preset the lane ids are the slot ids, so stored figures, old clients and the seven rooms keep their meaning. That is the least invasive shape: `FigurePlace` and `AgentFigure.place` do not change, nothing is renamed, and no existing field changes type.

Additive and optional only, so this is a minor change to the spec and no major version moves:

- `tenancy.tsp`: `WorkBaySlot`, `WorkLanePreset` (`capital-project`, `software`, `custom`), `WorkLane` (`id`, `name`, `purpose`, `keywords?`, `paths?`), `WorkLaneChoice` (a request: preset, lanes for custom, optional default), `WorkLaneSet` (as stored: preset, one to six lanes, `default_lane`), and `Project.work_lanes?`.
- `api.tsp`: `WorkspaceProject.work_lanes?` and `UpdateProject.work_lanes?` (so create and update take it), `AgentFigure.lane?` and `lane_name?`, and `lane_sets?` on the office floor so the Plant names its bays by the project.

The name is `work_lanes` because `lanes` on a project already means data lanes (public, internal and so on).

## Sorting

`placeWork` in `services/api/src/work-lanes.ts`, stopping at the first step that places a package:

1. the lane tag: the card's `discipline` equal to a lane id or name;
2. the repository paths its recorded outputs touch, against each lane's `paths` (directory prefix, exact path or glob); the lane matching most wins, the earlier lane on a tie;
3. whole-word `keywords` (the matcher added for `cubeFor`; the capital-project preset keeps its built-in discipline words, so its behavior is byte for byte what it was);
4. the set's default lane (capital-project: Process, with `place_defaulted` as today; software: Platform; custom: the first lane unless set).

## Setup

`proposePreset` is a pure function over the names at the top of the repository (no file is read) and the project's mode: discipline folders mean capital-project, a build manifest with none means software, no signal falls back to the mode. `project.workspace-create` uses it when the request names no lanes, and the project's setting changes it afterwards.

## Web

Bay names, purposes and accessible names come from the project's lane set through one context; the art, geometry and `place` ids are untouched. A "Plant bays" setting on the Board's project bar picks the preset and edits custom lanes (at most six).

## Order

1. Spec and generated code. 2. API: migration, storage, sorting, setup. 3. Web. 4. Tests and checks. 5. Screenshot. 6. The owner's recorded yes naming #167, once the diff is final.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
