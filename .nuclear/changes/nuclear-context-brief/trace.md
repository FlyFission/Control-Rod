# Trace: Nuclear context in agent briefs

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| NC-01 Light briefs and inputs are unchanged. | `work.ts` `nuclearContext` | `context-profile-brief.test.ts` Light case | implemented and tested |
| NC-02 Safety and Material grade lock Nuclear; else card, project default, Light. | `resolveContextProfile` | `context-profile.test.ts`; Safety case end to end | implemented and tested |
| NC-03 Clusters come from structured facts by one table. | `selectClusters`, `CLUSTER_RULES` | `context-profile.test.ts` table cases | implemented and tested |
| NC-04 Nuclear briefs carry Core and cluster cards before Rules, a template pointer, and a checker line for pre-check; skills and templates are inputs only. | `nuclearBriefSections`, `loadNuclearPack` | both test files | implemented and tested |
| NC-05 Trust-surface path scope locks Nuclear. | `TRUST_SURFACE_PATHS` (documented only) | none | not applicable: no path scope in the contract |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

NC-01 to NC-04 are implemented and tested; Light briefs are byte for byte unchanged; the api typecheck passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
