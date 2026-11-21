# Risk: Nuclear context in agent briefs

- **Mode:** Standard
- Execution owner: Claude Code, as a worker under the coordinating session.
- Decision owner: the maintainer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec/ change. `packs/nuclear-grade/` is not touched; tests use a fixture pack.
- Scope: `services/api/src/context-profile.ts`, `buildJob` and a new helper `nuclearContext` in `services/api/src/work.ts`, and their tests.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A Light brief changes and every existing agent sees different instructions. | Light returns no sections and no inputs; a test compares the Light brief to the brief as written before this change, byte for byte. | Any Light brief difference. |
| R-02 | Safety grade work runs without Nuclear context. | Safety and Material grade lock Nuclear over card and project settings (tests). A missing or broken pack puts a stop-and-report notice in the brief and records the problem on the run event rather than silently dropping the cards. | A Safety grade brief without Core card or notice. |
| R-03 | Agent prose steers which cards are given. | Clusters read only package fields, the role's tools file and the hint; the table is in one place with comments (`CLUSTER_RULES`). | A rule reading free text. |
| R-04 | A manifest path reads outside the pack. | Manifest paths are resolved inside the pack directory and refused otherwise (test). | A path outside the pack read. |
| R-05 | Skill files bloat BRIEF.md. | Skills and templates ship only as input files (tests assert their markers are absent from BRIEF.md). | A skill body in BRIEF.md. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

NC-01 to NC-04 are implemented and tested; Light briefs are byte for byte unchanged; the api typecheck passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
