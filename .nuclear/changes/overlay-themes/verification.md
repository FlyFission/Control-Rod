# Verification: implemented overlay themes

Date: 2026-10-26. Implementation source commit: `3655b0b16d9aeb81f5fd2c6cbf0163bc59300b1b`. Branch: `feat/overlay-themes`. The executable baseline remains the buildout at `465b084a04c6a99bb80c29aa890146eea5a55bd1`, not merged main.

## Observed technical results

| Check | Actual result | Retained evidence |
|---|---|---|
| Web unit/component/integration suite | 97 tests, 13 files, all pass | `evidence/final-web.log` |
| Web TypeScript checking | Pass | `evidence/final-types.log` |
| Passive SVG/provenance/path/hash/cast tests | Six Python tests pass | `evidence/review-cast-green.log`; final gate output |
| Complete pack conformance | Fifteen packs, six distinct variants each; actual SVG bytes match descriptor/manifest hashes | Web pack-conformance tests and asset checker |
| Browser behavior and automated accessibility | 12 flows each in Chromium and Firefox; 24 pass | `evidence/final-browser.log` |
| Release-build distribution | No draft demo or unapproved public SVG output; public Use disabled without record | `evidence/review-distribution-green.log` |
| Feature-off rollback | Legacy Floor still navigates to package details, no new mutation | `evidence/final-legacy.log` |
| Build/type integrity | Draft and normal builds pass; normal build excludes draft output | Browser webServer build logs and TypeScript results |
| Production dependency licensing | 211 packages pass existing repository license allowlist | `evidence/license-gate.log` |
| Reference performance | All fifteen worlds meet targets with 36 visible entities; 30-second frame samples | `evidence/performance.json` and `evidence/performance-final.log` |
| Protected surfaces | No changes to policies, red-team fixtures, CI workflows, wire contracts or kernel | Observed Git path diff from baseline |
| Fresh review | Eight findings reproduced and fixed with failed-first regressions in one pass | `evidence/final-review.md` and retained review RED/GREEN logs |

Performance on the recorded Linux/AMD reference host (three exposed CPUs), Chromium 156.0.8078.4 at 1440×1200: worst per-world p95 frame interval **16.8 ms**, worst cached switch **167 ms**, worst cold activation **1034 ms**. Cold activation is measured from Use to active artwork in a fresh browser context with cache disabled and CDP 10 Mbps/100 ms throttling; it excludes initial application startup. Each world has a full thirty-second frame sample, around 1,800 frames. Source commit and SHA-256 identity of the actual private review build are in the performance report. These measurements are not promises for all hardware or networks.

Browser fixtures use synthetic source records and intercepted APIs, not actual customer work or a running agent. They verify projection/interaction, no new mutation authority, fresh/stale behavior, reconnect baselining, unknown/conflicting identity, switching races, reduced/hidden/Quiet motion, mobile list identifiers, gallery focus and fallback. Automated axe checks supplement but do not replace real assistive-technology review.

## Review limitations and release posture

No second fresh code review is claimed after the one regression-backed fix pass. Human final art/attribution/distribution review is pending; the public release manifest is empty and every art pack remains development. The local draft gallery is explicitly labelled. Real Safari/iOS, real mobile-device and manual screen-reader behavior remain unverified. WebKit binaries downloaded but could not launch because GTK4/Graphene/Harfbuzz-ICU/Manette/Hyphen/GLES libraries were missing; this environment has neither sudo nor usable apt package indexes. No public franchise label/license is claimed approved.

Existing backend/kernel correctness, actual agent execution and engineering/compliance assurance are outside this cosmetic change. The production bundle-size warning was already present in the baseline and remains a warning, not a failed build. No protected code, old contributor certification or prior publication authorization is inferred.

## Documentation and delivery integrity

Run `python3 .nuclear/changes/overlay-themes/check_documents.py --write-inventory` and `git diff --check`. The packet checker covers local links, fifteen catalog IDs, fifteen requirement/scenario pairs, thirteen task headings/coverage, original unchecked-runbook status and whitespace. Current progress is in execution.md; runbook checkboxes deliberately preserve the original plan. Deterministic document checks are author self-checks, not product or legal verification. Artifact inventory records actual sizes and SHA-256 hashes.

The implementation run retains the initial planning report, expected failed-first logs, final green outputs, source-art manifests, screenshots and reference performance result. The source patch and private runnable preview are export artifacts; no remote push, merge or deployment occurred.

[Basis](basis.md), [risk](risk.md), [plan](plan.md), [trace](trace.md), [execution](execution.md), [ship](ship.md).
