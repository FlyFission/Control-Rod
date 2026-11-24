# Risk: work lanes

- **Mode:** Quick
- Execution owner: Claude (project thread).
- Decision owner: Ben Huffer. This change edits `spec/`, a trust surface, additively and with no major version. It needs the owner's recorded yes to a question naming the pull request (docs/collaboration.md, sole-maintainer sign-off); see [ship](ship.md). No policy, red-team fixture, workflow or kernel decision function is edited.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Existing projects or stored figures change bay. | No stored lanes reads as the capital-project preset, whose placement is the old `cubeFor`; the migration only allows the new field. A test checks every old discipline lands where `cubeFor` put it. | Any old discipline landing in another bay. |
| R-02 | A figure is labelled with a lane it is not in. | The lane is named only where the figure stands in the bay the lane placed it in; the card shows the figure's own lane name. | A card naming a lane for a figure standing in a room. |
| R-03 | A seventh lane has no bay and vanishes. | More than six is refused at the API and the setting; the Plant never draws more than six. | A stored set with more than six lanes. |
| R-04 | Reading a repository at setup reads files or leaves the workspace. | Entry names only, from a clone inside the workspace root, never a file; unsafe names and GitHub names give no entries. | Any file content read. |
| R-05 | The spec change merges without the owner's yes. | The Signature table in `ship.md` stays pending until the owner answers a question naming the pull request; CI and the record check show it. | Merge with a pending signature. |
| R-06 | Two projects with different lane sets on one Plant mislabel bays. | The Plant uses the set of the project with the most figures; each card names its own lane. | A bay name contradicting a card's lane without the card saying so. |

## Selected mode

- **Mode:** Quick
- Basis: additive optional fields, reversible by revert, one trust-surface file family with the owner's decision recorded.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
