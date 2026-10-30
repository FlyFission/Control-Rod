# Risk: interchangeable visual overlay themes

Date: 2026-10-26. Mode: standard frontend/asset implementation after user approval. Initial planning was delivered 2026-10-25; actual technical results and remaining human/public-release decisions are in verification.md and ship.md.

## Selected mode

- **Mode:** Standard
- Basis: user-visible frontend and bundled art for an open-source release, with release isolation and third-party rights exposure.

## Risk register

| Risk | Planned control | Evidence / stop condition |
|---|---|---|
| Franchise names or likeness reach the public repository or launch posts | Genre only naming, originality rules, hashed denylist scan, cast review at full size | Any scan finding, or a reviewer naming a specific franchise from a cast |
| Theme says done before work is accepted | Source-backed local projection; exact terminal/checker/human labels | State matrix and mixed-revision tests; stop release on false acceptance |
| Scene conceals missing/overflow work | Selected-page counts, failed-detail reporting, bounded stations and complete list | 31-package and seventh-entity fixtures; no “all agents” claim |
| Theme switch changes task authority | Read-only model, no API/auth/raw evidence in pack props | Mutation/external-request rejection in browser fixtures |
| Color/motion prevents access | Fixed state labels/shapes, list fallback, OS Still, keyboard focus, contrast targets | Real browser and manual assistive-technology evidence before release |
| Lost connectivity still looks busy | Required-query freshness, visible polling, last-known labels, animation freeze | Time/network/reconnect fixtures; no inferred lost/success from clock |
| Clever renaming is mistaken for IP permission | Original-expression review plus separate factual-attribution review | Actual pack/hash/title/note/distribution decision; no blanket clearance |
| Licensed art conflicts with Apache distribution | Separate code and asset license/provenance records | Exclude incompatible assets from open bundle; attribution is not relicensing |
| Asset causes injection, tracking or load failure | Bundled allowlist, passive image SVG, XML/hash/path gate, neutral fallback | Hostile asset fixtures and load-failure browser checks |
| Fifteen art projects turn into fifteen engines | One renderer, fixed stations/actions and pack conformance | No per-pack JSX or custom scripts; defer unsupported primitives |
| Performance estimates presented as measurements | Explicit proposed byte/frame/load budgets | Recorded actual machine/browser/cache/network results |
| Plan implemented on nonexistent main feature | Pin observed executable buildout; refresh before execution | No implicit merge/adoption of unrelated code or old authorization |

Protected surfaces remain untouched by this planning packet. No complete security, accessibility or legal assurance is claimed by source inspection or document checks.

[Basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship posture](ship.md).


## Required links

[Basis](basis.md), [risk](risk.md), [plan](plan.md), [trace](trace.md), [execution](execution.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Fifteen original worlds are verified as observed, every review finding has a disposition, and the remaining human decisions (art and distribution review, DCO sign-off, merge) are named rather than implied.

## Source-lineage note

Workflow basis: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Adapted as a local engineering record, not a compliance certification.
