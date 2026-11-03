Found nine issues requiring revision.

1. **Major — Office assets bypass build validation and distribution uses whole directories.** [vite.config.ts:113](/home/flyfission/worktrees/control-rod-phase0/apps/web/vite.config.ts:113), [package.json:10](/home/flyfission/worktrees/control-rod-phase0/apps/web/package.json:10)  
   `build` checks only the older `floor-themes` packs; it never invokes the office validator. Vite then recursively copies each released office directory. A corrupted office SVG, stale digest, or development asset accidentally placed inside `standard-office/` reaches the build output.  
   **Fix:** Run office schema, SVG and digest validation during every build, then copy only explicitly declared assets. Add a distribution test with an unregistered file inside a released directory.

2. **Major — Contrast checks ignore transparency and actual foreground visibility.** [office-harness.spec.ts:218](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:218), [office-harness.spec.ts:263](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:263)  
   `parse()` discards the alpha component, and foreground contrast uses computed colours. Changing label colour to `rgba(232,240,248,0)` leaves the reported contrast high although the text disappears. Likewise, `opacity:0` on the state SVG preserves its computed fill and passes the mark calculation. Background sampling and hit testing do not detect either regression.  
   **Fix:** Account for alpha and ancestor opacity, verify foreground presence, and add transparent-text and invisible-mark negative controls.

3. **Major — Edge contrast credits a ring that may never be drawn.** [office-harness.spec.ts:231](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:231)  
   `edge()` takes the better contrast of the dark plate and `--office-ring`, regardless of whether the ring exists. Removing semantic `box-shadow` still earns the light ring’s contrast against dark scenery. The harness can therefore approve an outline that visually disappears.  
   **Fix:** Verify the rendered ring and its coverage before crediting it. Add a negative control that removes rings while retaining the custom property.

4. **Major — The legibility test does not test state shapes.** [office-harness.spec.ts:365](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:365)  
   The test measures figure outlines, package codes, plates and text sizes. Replacing every state symbol with the same circle leaves these checks green; contrast also passes because it checks paint rather than shape. Users would lose the shape distinctions required by section 13 while task 4.3 reports success.  
   **Fix:** Assert each state’s rendered geometry and visibility at minimum zoom, with negative controls for identical and undersized symbols.

5. **Major — “Event to screen” measures two animation callbacks, not the update.** [office-harness.spec.ts:116](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:116)  
   The timer ends after two `requestAnimationFrame` callbacks. If the state update is delayed beyond the budget, this measurement can still finish quickly; the separate `toHaveAttribute` assertion subsequently waits for the delayed update and passes.  
   **Fix:** Keep one timer running until the expected state has committed and received a rendering opportunity. Add a deliberately delayed-update sensitivity case.

6. **Major — The performance gate substitutes an unsupported budget.** [office-harness.spec.ts:125](/home/flyfission/worktrees/control-rod-phase0/apps/web/e2e/office-harness.spec.ts:125)  
   Q-10 requires 60 fps on a named reference machine. This test accepts 30 fps and records no reference-machine identity or runner calibration. A floor missing the required performance target can pass. The comment about CI capacity is not measurement evidence; this also leaves AGENTS.md rule 5’s recorded-input basis unresolved.  
   **Fix:** Retain the specified reference-machine check with machine/browser/build provenance. Treat any independently justified CI threshold as a separate smoke check.

7. **Major — The manifest validator accepts missing accessibility and provenance records.** [contract.ts:125](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/contract.ts:125), [contract.ts:159](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/contract.ts:159)  
   I removed `accessibility`, `credits`, and every asset’s `creator` and `licenseNoticeId`; validation still returned `[]`, including with actual asset reads and digest verification. The TypeScript interface does not provide the runtime schema required by section 18.  
   **Fix:** Validate required fields and nested types with a strict runtime schema, including accessibility evidence and asset provenance. Return validation errors for malformed input.

8. **Minor — The SVG scanner accepts invalid XML and does not establish geometric containment.** [contract.ts:72](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/contract.ts:72), [contract.ts:108](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/contract.ts:108)  
   Direct probes accepted both mismatched closing tags and duplicate attributes. They also accepted a rectangle extending far outside the declared region because only `viewBox` is checked. Invalid XML can become a broken image; oversized geometry passes the promised containment check. The current `<img>` bounds contain the rendering, so this is **not an established region-escape exploit**.  
   **Fix:** Parse XML strictly, enforce the namespace and document structure, and check transformed painted bounds—or explicitly define and validate clipping as the containment mechanism.

9. **Minor — Working animations are not stopped when the document is hidden.** [office.css:134](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/office.css:134)  
   The pulse runs indefinitely unless reduced motion is enabled. Neither `OfficeStage` nor the harness handles document visibility, although sections 13 and 18 require motion to stop in hidden tabs. Browser throttling does not implement that contract.  
   **Fix:** Pause shared motion on `visibilitychange` and test hidden, restored and reduced-motion states.

Both committed themes passed direct validation. Browser mutation scenarios above were established by code inspection; I did not rerun Playwright in this read-only workspace.

I found no demonstrated script, external-fetch or CSS escape through the current `<img>` embedding; SVG image processing disables scripting and external references. [SVG processing rules](https://www.w3.org/TR/SVG/latest/conform.html). The luminance formula itself matches WCAG; the errors concern which rendered colours receive credit. [WCAG contrast definition](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)

The Phase 4 commit makes no protected-surface edits; its CI change remains an unsigned proposal. Deferred lenses and OV acceptance execution belong to later tasks and are not counted as findings.

REVISE