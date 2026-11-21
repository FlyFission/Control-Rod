# Trace: per-card Context Light / Nuclear toggle

| Requirement | Code | Tests and checks | Disposition |
|---|---|---|---|
| CT-01 A package and a project carry an optional context profile. | `spec/records.tsp`, `spec/tenancy.tsp`, migration 024, `admin.ts`, `tenancy.ts` | `draft-cas.test.ts`, `admin.test.ts`, `tenancy.test.ts`; spec regenerates with no diff | implemented and tested |
| CT-02 Light briefs and inputs are unchanged. | `nuclearContext`, `composeBrief` | `context-profile-brief.test.ts` Light case | implemented and tested |
| CT-03 Safety and Material grade lock Nuclear; else card, project default, Light. | `resolveContextProfile` (server); web mirror | `context-profile.test.ts` (api and web); Safety case end to end | implemented and tested |
| CT-04 The toggle shows what the server will use, with the server's reasons. | `apps/web/src/lib/context-profile.ts`, `ContextSwitch.tsx` (read-only during guided preparation) | `apps/web/src/lib/context-profile.test.ts`, `board.test.tsx` | implemented and tested |
| CT-05 Clusters come from structured facts by one table; Nuclear briefs carry cards before Rules, skills and templates as inputs only. | `selectClusters`, `CLUSTER_RULES`, `nuclearBriefSections` | `context-profile.test.ts`, `context-profile-brief.test.ts` | implemented and tested |
| CT-06 The composer loads the real generated pack, verified against its manifest digests and contained by real path; a Nuclear run without a verified pack is not launched. | `loadNuclearPack`, `blockedByNuclearPack` in `work.ts` | `context-profile-real-pack.test.ts`, `context-profile.test.ts` (symlinked parent, tampered card, missing digest), `context-profile-brief.test.ts` (tampered pack blocks the claim) | implemented and tested |
| CT-07 The pack is what the generator writes; hand edits fail `--check`; `budgets.json` survives regeneration. | `scripts/generate-nuclear-pack.mjs` | `scripts/test/nuclear-pack.test.mjs`; `--check` | implemented and tested |
| CT-08 Each fixture brief stays within its measured budget. | `scripts/measure-briefs.mjs`, `packs/nuclear-grade/budgets.json` | `scripts/test/measure-briefs.test.mjs`; `--check` | implemented and tested |
| CT-09 Trust-surface path scope locks Nuclear. | `TRUST_SURFACE_PATHS` (documented only) | none | not applicable: no path scope in the contract |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md), [provenance](provenance.md).

## Exit criteria

CT-01 to CT-08 are implemented and tested; Light briefs are byte for byte unchanged; the composer loads the real pack; every measured brief is within its budget; the owner's recorded yes for the `spec/` change is in the Signature table of [ship](ship.md) before merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
