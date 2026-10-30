# SDD ledger for plan docs/superpowers/plans/2026-10-25-overlay-themes.md

2026-10-26: User approved the design and instructed full execution. Native sequential implementation in isolated worktree feat/overlay-themes; base 41d2d0b. Remote buildout remains 465b084a04c6a99bb80c29aa890146eea5a55bd1.
Pre-flight: Tasks 1→2/4/5/7/8 share the pack/display model; Tasks 2→3/5 share the pure projection; Tasks 3/4/5/6→7 share query health/preferences/renderer; Tasks 8→9 to 12 share asset records; Task 13 consumes all. No incompatible names found.
Ruling: Skill shell scripts are not available through the cloud skill reader; keep equivalent briefs, evidence and task ledger directly; costs less automated bookkeeping, no product scope change.
Ruling: Provide explicitly labelled local draft-art evaluation in addition to public released-pack eligibility; all fifteen can be reviewed without fabricating human legal/art release approval; accidental production opt-in would expose unreviewed original artwork, so require explicit build flag and persistent banner.

Task 1: complete: 42 web tests pass; typecheck passes; registry remains release-gated.
Task 2: complete: focused RED→GREEN; integrated suite 75/75 and web typecheck pass (engine-tests.log, engine-types.log).
Task 3: complete: focused RED→GREEN; integrated suite 75/75 and web typecheck pass (engine-tests.log, engine-types.log).
Task 4: complete: focused RED→GREEN; integrated suite 75/75 and web typecheck pass (engine-tests.log, engine-types.log).
Task 5: complete: focused RED→GREEN; integrated suite 75/75 and web typecheck pass (engine-tests.log, engine-types.log).
Task 6: complete: focused RED→GREEN; integrated suite 75/75 and web typecheck pass (engine-tests.log, engine-types.log).
Task 7: complete: focused RED→GREEN; integrated suite 75/75 and web typecheck pass (engine-tests.log, engine-types.log).
Ruling: Add a separate themes.html design preview using the same renderer and clearly synthetic sample data; makes all fifteen worlds reviewable without a running control plane; costs a small additional build entry; never claims live work or legal approval.
Task 9: artwork implementation complete: 3 distinct packs, passive-SVG/hash gate and 90-test suite pass; human art/distribution approval remains pending, so packs stay development.
Task 10: artwork implementation complete: 4 distinct packs, passive-SVG/hash gate and 90-test suite pass; human art/distribution approval remains pending, so packs stay development.
Task 11: artwork implementation complete: 3 distinct packs, passive-SVG/hash gate and 90-test suite pass; human art/distribution approval remains pending, so packs stay development.
Task 12: artwork implementation complete: 5 distinct packs, passive-SVG/hash gate and 90-test suite pass; human art/distribution approval remains pending, so packs stay development.

Task 8: complete: passive SVG, provenance, content hash and release-record validators; five Python tests and full pack byte checks pass.
Task 13: in progress: Chromium and Firefox seven-flow suites pass; performance, rollback and final fresh review remain.

## Final review and execution rulings

Final review: fresh-context read-only review of 41d2d0b..4e6b39d; seven Important and one Minor finding. All eight entered one fix pass. Quiet was regraded Important because the low-motion preference must deliver opacity-only behavior. No finding was silently discarded and no deferred Minor remains.
Final: fixed draft distribution: release output inventory test RED→GREEN; normal builds exclude the demo and unapproved art.
Final: fixed unknown-status reduction: projection regression RED→GREEN; unknown statuses remain visible with raw text and neutral presentation.
Final: fixed cross-package ID collision: projection regression RED→GREEN; conservative per-source rows replace last-write-wins.
Final: fixed reconnect replay: short-gap browser regression RED→GREEN; reuse existing SSE owner for a local rebaseline signal.
Final: fixed cross-tab pending-load race: browser regression RED→GREEN; even a repeated active-ID decision cancels earlier loads.
Final: fixed hidden mobile run IDs: mobile accessible-name/visible-badge regression RED→GREEN.
Final: fixed cast recolors: structural SVG geometry regression RED→GREEN across all four affected sets; actual guild species and distinct bodies/heads/tools authored.
Final: fixed Quiet transforms: real animation keyframe regression RED→GREEN; opacity-only effect.
Final: fixed standalone hidden-document motion: browser regression RED→GREEN; shared motion hook respects document visibility in live and sample scenes.
Final suite: 97/97 web tests; 6/6 Python asset tests; 24/24 browser flows across Chromium and Firefox; dedicated release-distribution and legacy-fallback browser checks pass. Web typecheck, production/draft build and permissive production-license gate pass.

Final: Ruling: legal clearance and actual human art/distribution decisions remain pending; no fabricated reviewer or public approval; cost: public art release waits for the designated human review.
Final: Ruling: deliver original vectors and contact sheets for subjective art review while testing concrete cast diversity; cost: editorial refinement may still be requested.
Final: Ruling: actual Safari/iOS and assistive-technology checks remain unverified; WebKit host libraries are missing and no sudo/apt package index is available; cost: those platform/manual release gates remain open.
Final: Ruling: executor measures performance and rollback separately, not in the fresh review; cost: reference-machine results do not guarantee other devices or networks.
Final: Ruling: existing backend/kernel semantics are not certified by a cosmetic frontend change; cost: underlying platform assurance remains outside this feature.
Final: Ruling: keep the feature branch/worktree local rather than merging, pushing or publishing without a request; cost: remote integration remains a subsequent action; no work is discarded.

The implementation runbook remains a reference; this ledger is the progress record. Task 13 reference performance measurements and final delivery inventory are recorded in verification.md after the benchmark finishes. A complete technical implementation is distinct from approving public artwork or claiming unexecuted manual checks.

Task 13: technical implementation and available-environment verification complete; 97 web tests, six asset tests, 24 cross-browser flows plus public-distribution/legacy-rollback checks pass. All fifteen 36-entity reference measurements pass: max p95 16.8 ms, cached 167 ms, cold 1034 ms. User/art/public-release and real-device/manual assistive-technology gates remain open, explicitly outside any completion claim. Code source is committed at 3655b0b; only delivery records follow.

2026-10-30 amendment (owner direction: open-source release, no infringement): Ruling: the repository names no third-party franchise in code, art, documentation or launch material, including as "inspired by" references; cost: catalog "Influence" notes become genre descriptions and avoid rules become generic. Added `docs/overlay-themes/originality.md` (naming, art, launch and takedown rules; display name proposal, adopted later the same day), `tools/check_originality.py` with a hashed denylist so the guard never republishes names, and `tools/test_check_originality.py`. Verification: 11/11 Python tool tests pass; repository scan passes; an injected denied word was reported by line and the scan returned to green after removal. Visual review of all fifteen worlds and close renders of six casts found no franchise likeness. Earlier branch commits still contain the names; squash merge recommended.

2026-10-30 second amendment: Ruling: every world gets its own character bodies and brief-matched props, enforced by tests; display names adopted at the owner's direction; The Cloudspring Baths replaces the earlier bathhouse name. Independent Codex review of the amendments: 3 major and 6 minor findings; R1 (draft art surviving in a reused external output directory) fixed in the Vite plugin with two build-isolation tests shown failing against the previous plugin; R2 policy text and release-record influence field aligned; R3 byte reproducibility test; R4 cross-line and six-word originality windows with a canary (longer denylist entries could not match before); R5 generator preflight; R6 measurement script records its commit, build digests and summary; R7 this record; R9 film pointer removed. R8 (DCO sign-off) is the human author's. Verification: 97 web, 17 Python, 26 browser checks pass; performance bound to b2a64d0, all fifteen worlds within targets.


## Required links

[Basis](basis.md), [risk](risk.md), [plan](plan.md), [trace](trace.md), [execution](execution.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Fifteen original worlds are verified as observed, every review finding has a disposition, and the remaining human decisions (art and distribution review, DCO sign-off, merge) are named rather than implied.

## Source-lineage note

Workflow basis: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Adapted as a local engineering record, not a compliance certification.
