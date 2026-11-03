Reviewed `git diff main...HEAD` at `b5b2142`.

Round 1 verification against the implementation:

| # | Status | Verification |
|---|---|---|
| 1 | Fixed | `build` invokes `check:office`; Vite copies declared files and verifies digests. |
| 2 | Partial | Pixel checks catch the supplied invisible-label/mark cases, but can still credit non-text pixels. |
| 3 | Partial | The dark-theme ring-removal control is covered; edge measurements still cannot establish ownership of sampled paint. |
| 4 | Partial | Identical-circle and undersized controls are covered; malformed shapes still classify successfully. |
| 5 | Partial | Delayed attribute commits are timed correctly; visible state changes remain unverified. |
| 6 | Partial | Smoke and reference checks are separated honestly. Designated-reference-machine acceptance remains pending. |
| 7 | Fixed | Runtime validation now requires accessibility, credits, asset provenance, and nested field types. |
| 8 | Partial | Original malformed-tag cases are rejected and viewport containment is documented; other invalid XML still passes. |
| 9 | Fixed | Visibility handling disables animation, with hidden/restored/reduced-motion assertions. |

Remaining findings:

1. **Major — Invisible package codes can pass `inkCheck`.** [office-harness.spec.ts:340](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:340)  
   Code text is measured over the entire rounded code plate. Its light ring occupies pixels inside the bounding rectangle’s corners. Setting `.office-figure-code { color: transparent !important }` therefore leaves bright pixels that the fourth-strongest-pixel test can credit as text. Plate, layout, and hit-testing checks remain satisfied. Clipping a label down to a few visible glyph pixels likewise passes.

   **Fix:** Measure glyph-owned pixels separately from the plate and ring, and require expected text coverage. Add transparent-code and partially clipped-label negative controls.

2. **Major — Edge profiles can credit scenery when no semantic edge exists.** [office-harness.spec.ts:353](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:353), [office-harness.spec.ts:391](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:391)  
   The quarter-pixel profile chooses the strongest full-image pixel against a scene pixel farther away; it never establishes that the semantic element painted that pixel. An in-memory probe using identical scene and full images returned **17.19:1** from scenery alone. Decorative geometry coinciding with a figure boundary can therefore conceal a missing application-owned outline.

   Exclusions also use expanded geometric zones, without checking visibility or stacking, and accept any nonzero remaining edge coverage. Nearby or invisible parts can suppress measurements without actually occluding the edge.

   **Fix:** Identify element-owned boundary pixels through an isolated render or mask, compare against local scenery, and exclude only demonstrably occluded spans. Require meaningful perimeter coverage. Add missing-outline controls over textured scenery and invisible-neighbour controls.

3. **Major — The classifier accepts disconnected blocks as a waiting ring.** [office-harness.spec.ts:400](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:400)  
   `hole < 0.5` immediately classifies any sufficiently large mark as a ring. A probe containing four disconnected corner blocks returned `{ shape: "ring", size: 13, fill: 0.21, hole: 0 }`. Replacing waiting symbols with those blocks satisfies size and contrast while destroying the required state shape.

   **Fix:** Check topology and contour similarity, including connectivity and an enclosed hole, or compare against application-owned raster templates with bounded tolerance. Add disconnected, hollow-square, and fragmented-symbol controls.

4. **Major — Event-to-screen still passes with frozen visible symbols.** [office-harness.spec.ts:59](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:59)  
   Timing ends after `data-state` changes and one animation callback. A regression that memoizes each symbol’s initial geometry can leave the old symbol displayed indefinitely while the attribute changes promptly. Initial shape checks pass, and the performance test subsequently checks only the attribute.

   **Fix:** Verify the expected rendered symbol and accessible state after the update, include its commit and rendering opportunity in the timing, and add a frozen-symbol sensitivity case.

5. **Minor — `validateSvg` still accepts invalid XML.** [contract.ts:75](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/contract.ts:75), [contract.ts:90](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/contract.ts:90)  
   Inside an otherwise valid SVG, each of these returned `[]`, while an XML parser rejected it:

   - `<g></G>`
   - `<rect width="1"height="1"/>`
   - `<title>&missing;</title>`
   - `<g></g fill="#fff">`

   Such an asset can pass validation but fail image decoding.

   **Fix:** Parse XML strictly before applying the allowlist; preserve case and reject parser errors. These probes establish a validation defect, not a demonstrated script or external-fetch exploit.

6. **Minor — Figure bodies are not constrained to the outlined silhouette.** [office.css:37](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/office.css:37)  
   A valid body SVG containing a full-viewBox rectangle renders as a square image. Its corners extend beyond the circular semantic outline because the body image has no silhouette clipping. Section 18 requires body art to remain within that silhouette; rectangular image containment does not enforce this.

   **Fix:** Apply an application-owned silhouette clip to body images and add a full-rectangle body control.

I found no additional defect in the current layout coordinates or build distribution allowlist. Deferred lenses, projection, and later OV tasks were not counted as missing foundation work.

Both committed themes passed direct byte/digest validation. XML and classifier/profile probes ran in memory; full build and Playwright mutation tests were not rerun in this read-only workspace.

REVISE