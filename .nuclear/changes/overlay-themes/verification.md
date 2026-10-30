# Verification: implemented overlay themes

Date: 2026-10-26. Implementation source commit: `3655b0b16d9aeb81f5fd2c6cbf0163bc59300b1b`. Branch: `feat/overlay-themes`. The executable baseline remains the buildout at `465b084a04c6a99bb80c29aa890146eea5a55bd1`, not merged main.

## Observed technical results

| Check | Actual result | Retained evidence |
|---|---|---|
| Web unit/component/integration suite | 97 tests, 13 files, all pass | `evidence/final-web.log` |
| Web TypeScript checking | Pass | `evidence/final-types.log` |
| Passive SVG, provenance, hash, cast, reproducibility, preflight and originality tests | 17 Python tests pass (2026-10-30) | `tools/test_check_theme_assets.py`, `tools/test_check_originality.py`; earlier run `evidence/review-cast-green.log` |
| Complete pack conformance | Fifteen packs, six distinct variants each; actual SVG bytes match descriptor/manifest hashes | Web pack-conformance tests and asset checker |
| Browser behavior, automated accessibility and build isolation | 12 flows each in Chromium and Firefox plus 2 build-isolation checks; 26 pass (2026-10-30, commit b9454de) | `evidence/browser-results.json`; earlier run `evidence/final-browser.log` |
| Release-build distribution | No draft demo or unapproved public SVG output; public Use disabled without record | `evidence/review-distribution-green.log` |
| Feature-off rollback | Legacy Floor still navigates to package details, no new mutation | `evidence/final-legacy.log` |
| Build/type integrity | Draft and normal builds pass; normal build excludes draft output | Browser webServer build logs and TypeScript results |
| Production dependency licensing | 211 packages pass existing repository license allowlist | `evidence/license-gate.log` |
| Reference performance | All fifteen worlds meet targets with 36 visible entities; 30-second frame samples | `evidence/performance.json` and `evidence/performance-final.log` |
| Protected surfaces | No changes to policies, red-team fixtures, CI workflows, wire contracts or kernel | Observed Git path diff from baseline |
| Fresh review | Eight findings reproduced and fixed with failed-first regressions in one pass | `evidence/final-review.md` and retained review RED/GREEN logs |

Current run (2026-10-30), bound by the script itself to source commit `b2a64d0717e83c7a8e097032541679512252a157` with SHA-256 digests of all 265 served build files in `evidence/performance.json`: linux 6.6.114.1-microsoft-standard-WSL2, AMD Ryzen 9 5900X 12-Core Processor (12 CPUs), Chromium 156.0.8078.4 at 1440×1200. Worst per-world p95 frame interval **16.8 ms**, worst cached switch **224 ms**, worst cold activation **914 ms**, all within targets. Cold activation is measured from Use to active artwork in a fresh browser context with cache disabled and CDP 10 Mbps/100 ms throttling; it excludes initial application startup. Each world has a full thirty-second frame sample. The 2026-10-26 run on the earlier reference host (worst 16.8 ms, 167 ms, 1034 ms) is retained as `evidence/performance-2026-10-26.json`. These measurements are not promises for all hardware or networks.

Browser fixtures use synthetic source records and intercepted APIs, not actual customer work or a running agent. They verify projection/interaction, no new mutation authority, fresh/stale behavior, reconnect baselining, unknown/conflicting identity, switching races, reduced/hidden/Quiet motion, mobile list identifiers, gallery focus and fallback. Automated axe checks supplement but do not replace real assistive-technology review.

## Review limitations and release posture

A second independent review (Codex, 2026-10-30, `evidence/review-2026-10-30/codex.md`) reported 3 major and 6 minor findings on the open-source amendments; R1 to R7 and R9 are fixed, with failed-first evidence for R1, R3 and R4, and R8 (DCO sign-off) needs the human author. Human final art/attribution/distribution review is pending; the public release manifest is empty and every art pack remains development. The local draft gallery is explicitly labelled. Real Safari/iOS, real mobile-device and manual screen-reader behavior remain unverified. WebKit binaries downloaded but could not launch because GTK4/Graphene/Harfbuzz-ICU/Manette/Hyphen/GLES libraries were missing; this environment has neither sudo nor usable apt package indexes. No public franchise label/license is claimed approved.

Existing backend/kernel correctness, actual agent execution and engineering/compliance assurance are outside this cosmetic change. The production bundle-size warning was already present in the baseline and remains a warning, not a failed build. No protected code, old contributor certification or prior publication authorization is inferred.

## Documentation and delivery integrity

Run `python3 .nuclear/changes/overlay-themes/check_documents.py --write-inventory` and `git diff --check`. The packet checker covers local links, fifteen catalog IDs, fifteen requirement/scenario pairs, thirteen task headings/coverage, original unchecked-runbook status and whitespace. Current progress is in execution.md; runbook checkboxes deliberately preserve the original plan. Deterministic document checks are author self-checks, not product or legal verification. Artifact inventory records actual sizes and SHA-256 hashes.

The implementation run retains the initial planning report, expected failed-first logs, final green outputs, source-art manifests, screenshots and reference performance result. The source patch and private runnable preview are export artifacts; the branch is pushed and open as draft PR #12; no merge or deployment has occurred.

## Evidence custody and coupling

| Evidence ID | Claim ID | Decisive? | Artifact / raw result | Change actor | Generated by | Selected by | Transformed / summarized by | Executed / captured by | Retained by | Presented by | Verified / witnessed by |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E-01 | OT-02 | yes | Web suite, 97 tests | Implementing agents | Vitest | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-02 | OT-01 | yes | 17 Python tool tests including byte reproducibility of all art | Implementing agents | Python unittest | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Self-check |
| E-03 | OT-06 | yes | Browser flows, 26 pass | Implementing agents | Playwright | Implementing agent | Implementing agent | Chromium and Firefox | `evidence/browser-results.json` | Implementing agent | Self-check |
| E-04 | OT-15 | yes | Build isolation and release distribution checks | Implementing agent | Playwright and Vite | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Codex review R1 reproduced the defect independently |
| E-05 | OT-13 | yes | Performance for fifteen worlds bound to a commit | Implementing agent | Measurement script | Implementing agent | Measurement script | Chromium via CDP | `evidence/performance.json` | Implementing agent | Self-check |
| E-06 | OT-14 | yes | Originality guard and asset checks | Implementing agent | Python tools | Implementing agent | Implementing agent | Local toolchain | Packet | Implementing agent | Codex review 2026-10-30 |
| E-07 | OT-14 | no | Human art, attribution and distribution review | Not supplied | Not executed | Not supplied | Not supplied | Not executed | Not retained | Not supplied | Pending owner |

| Evidence ID | Actor | Context | Mechanism | Authority | Resource | Classification | Admissibility / residual-risk disposition |
|---|---|---|---|---|---|---|---|
| E-01 | coupled: implementing agents | coupled: implementation session | partially separated: deterministic test runner | separated: owner decides merge | coupled: local machine | self-check | Frontend behaviour only [Ship limits](ship.md) |
| E-02 | coupled: implementing agents | coupled: implementation session | separated: regenerating from named inputs | separated: owner decides merge | coupled: local machine | self-check | Structural and reproducibility checks; not a judgement of beauty [Ship limits](ship.md) |
| E-03 | coupled: implementing agents | coupled: implementation session | partially separated: real browsers | separated: owner decides merge | coupled: local machine | self-check | WebKit and real devices unverified [Ship limits](ship.md) |
| E-04 | separated: outside reviewer found the defect | separated: reviewer context | separated: different provider | separated: owner decides merge | coupled: local machine | independent reproduction | Release isolation for reused output directories |
| E-05 | coupled: implementing agent | coupled: implementation session | separated: browser timing | separated: owner decides merge | coupled: local machine | self-check | One host; not a promise for all hardware [Ship limits](ship.md) |
| E-06 | separated: outside reviewer | separated: reviewer context | separated: different provider | separated: owner decides merge | coupled: local machine | diverse verification | Guard proves absence of listed names only, not originality |
| E-07 | separated: owner | separated: owner | separated: human review | separated: owner | separated: owner | direct witnessing | Required before any public release of a pack |

[Basis](basis.md), [risk](risk.md), [plan](plan.md), [trace](trace.md), [execution](execution.md), [ship](ship.md).

## Required links

[Basis](basis.md), [risk](risk.md), [plan](plan.md), [trace](trace.md), [execution](execution.md), [ship](ship.md).

## Exit criteria

Each observed result above is reproducible from the named evidence, and every unverified area (WebKit, real devices, manual screen reader, human art review) is stated rather than implied.

## Source-lineage note

Workflow basis: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Adapted as a local engineering record, not a compliance certification.
