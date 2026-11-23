# Risk: the Plant view

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-23 instruction.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec change. The view only reads existing routes.
- Scope: as in [basis](basis.md).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | An instrument states something untrue: zero while a read is missing, "no SCRAM" when status is unknown, a stop claimed before it is recorded, or "No agent working" while work is hidden in presenting mode. | Pure state functions with a loading and unavailable state for every read; captions say "as of" after a failed refresh; tested case by case. | Any instrument showing a value its reads do not support. |
| R-02 | Meaning carried by colour alone, or text too small or low in contrast on the dark plant. | State shapes on every lit window and figure; contrast and shape checks in the harness at minimum zoom and under every lens; `--fs-*` tokens. | A harness contrast or shape failure on the plant. |
| R-03 | The drawing cannot be used on a narrow screen or by a screen reader. | A list view grouped by zone, opened automatically below the width where the drawing fits; the drawing's regions carry names and purposes; the annunciator speaks counts and announces changes politely. | A figure reachable only on the drawing. |
| R-04 | Layout regressions: figures overlap, queues spill off walkways, a door opens onto nothing. | `validatePlantLayout` and `checkRegionGeometry` run in unit tests; the harness fills every place with 40 agents. | A validator or harness failure. |
| R-05 | People lose a theme they chose. | Office themes kept under Advanced; an archived choice is still honored and says how to return to the Plant; the old storage key is ignored, not deleted. | A chosen archived theme that no longer loads. |
| R-07 | Effects distract, cost frames, or carry meaning alone. | Motion only while the core is lit and on a newly lit window; all of it stops with reduced motion or a hidden tab (harness); the figure light pools sit in the scene layer under the plate and ring, which the harness measures; frame time is checked with 40 agents. | A harness motion, contrast or frame time failure. |
| R-06 | Nuclear imagery is read as a claim of real plant status or safety. | Words name work, never power or safety: no percentages, units or trust words; zones use plain building names. | Any reading that implies a physical quantity. |

## Selected mode

- **Mode:** Standard
- Basis: user-visible change to a main screen; no contract or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design: [plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md). Earlier work: [overlay-themes](../overlay-themes/basis.md).

## Exit criteria

The Plant view is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, validation with real users, or that the art resembles any real facility; it is a stylized plan, not an engineering drawing.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
