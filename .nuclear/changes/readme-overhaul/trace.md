# Trace: README overhaul

**Change slug:** `readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-23

---

| ID | Claim | Basis link | Control / design feature | Evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | Every capability the README states as present is on `main` at d0a4cc6. | `basis.md` Fixed inputs | Manual read against the sources in `basis.md` | E-004 | Merge | pass |
| C-002 | The README does not describe open pull requests, the Planner or a cross-subscription gauge as shipped. | `risk.md` Non-goals | Manual read | E-004 | Merge | pass |
| C-003 | The README passes the public-claims and originality checks. | `risk.md` Success criterion | `tools/check_public_claims.py`, `tools/check_originality.py` | E-002, E-003 | Merge | pass |
| C-004 | The four pictures come from the release build through `readme-shots.spec.ts`. | `basis.md` What changes | Spec run in Chromium | E-001 | Merge | pass |
| C-005 | No trust surface is edited. | `plan.md` Not touched | Diff scope | E-005 | Merge | pass |
| C-006 | Each research figure in the README matches its source as published, and the chart is drawn from `inputs.json` by `build.py`. | `basis.md` Revision 3 | `docs/research/second-checker/` | E-006 | Merge | pass |
| N-002 | **Not claimed:** that a different-vendor model catches a stated percentage more errors. No cited paper measures that. | `basis.md` Revision 3 | none | none | n/a | n/a |
| N-001 | **Not claimed:** any assurance, certification or compliance. | `risk.md` | none | none | n/a | n/a |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Every claim has a status.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
