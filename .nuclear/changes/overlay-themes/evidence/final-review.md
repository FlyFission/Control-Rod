# Fresh-context whole-branch review and fix disposition

Date: 2026-10-26. Reviewed range: `41d2d0b..4e6b39dbf88adff96f1f04a752f5c3efccd634b4`. Reviewer: separate fresh-context senior-code-review agent, read-only. Initial verdict: request changes; no Critical findings, seven Important and one Minor. This is the one independent code review; later fixes are verified by failed-first regressions and full suites, not a second reviewer.

| Finding | Reproduction / failed-first evidence | Fix |
|---|---|---|
| Draft art/demo leaked into normal build | `review-distribution-red.log`; output had themes.html and unapproved SVGs | Demo is an explicit draft-build entry; ordinary build copies only record-approved manifest assets; no automatic public-dir copy |
| Unknown status reduced as terminal history | `review-projection-red.log` | Only known terminal states reduce; unknown rows remain, show raw escaped context and neutral icons |
| Cross-package duplicate run ID overwrote work | `review-projection-red.log` | Detect global collisions; retain per-source neutral rows and warning instead of claiming a terminal row is authoritative |
| Short reconnect replayed submission | `review-browser-red.log` | Existing SSE owner emits local gap notification; data/motion rebaseline before processing refreshed state; no new stream |
| New cross-tab Plain choice lost to pending older load | `review-browser-red.log` | Valid external preference decisions have a sequence even when ID is unchanged; invalidate pending generations |
| Mobile hid complete run IDs | `review-browser-red.log` | Keep wrapping run badge in compact list and accessible button name |
| Human/guild casts were mostly recolors | `review-cast-red.log` | Six different body/head/tool geometries per cast; guild adds actual horned smith, bird courier and stone archivist; regenerate hashes and previews |
| Quiet effect still moved/scaled | `review-quiet-red.log` | Regraded Important because the low-motion control must follow its stated behavior; opacity-only keyframes now used |

An additional hidden-document regression for the standalone preview was observed in `showcase-visibility-red.log` and fixed in the shared motion hook, so live and sample scenes both pause and resume without replay.

## Behaviors the reviewer declined to judge: executor rulings

1. **Legal clearance and human art/distribution approval:** remain pending, recorded honestly; public records stay empty. Cost: public art release awaits the designated human decision.
2. **Subjective final beauty/recognizability beyond cast diversity:** original art and screenshots are delivered for user review; concrete structural diversity is tested. Cost: later editorial refinement may still be desired.
3. **Real Safari/iOS/mobile-device and screen-reader behavior:** Chromium/Firefox responsive and automated accessibility tests are executed; actual devices/assistive technology remain unverified. WebKit binaries could not launch because required OS libraries are absent and this environment has no sudo/apt package index. Cost: those platform/manual release checks remain open.
4. **Performance and rollback:** measured separately by executor tools, with source/build identity and actual outputs retained; not attributed to the reviewer. Cost: reference-machine measurements do not guarantee all user hardware/network conditions.
5. **Existing backend/kernel correctness:** unchanged and outside this cosmetic feature; tests cover consumption/projection and absence of new mutation authority. Cost: this delivery does not certify the underlying platform.

No review finding was silently dropped. No deferred Minor remains after the Quiet item was regraded and fixed. Neither this review nor passing tests is a legal clearance or a public deployment decision.
