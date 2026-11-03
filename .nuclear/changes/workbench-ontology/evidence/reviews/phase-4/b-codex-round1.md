Reviewed `git diff main...HEAD`, the specified sections and acceptance cases. Focused in-memory probes confirmed routing and rendering failures below; the full database/browser suites were not run.

1. **Blocker — Presenting mode leaks reclassified work.** [figures.ts:88](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:88)  
   Filtering uses `p.body.data_lane`, ignoring current effective markings. An originally internal package raised to restricted remains visible, including its title and cause. **Fix:** resolve the effective lane through `laneOf` before projecting content; fail closed when classification is unavailable. Test both direct raises and inherited classification changes.

2. **Major — Active security holds lose state priority.** [figures.ts:115](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:115)  
   Pull SCRAM after a pre-check succeeds but before acceptance. The completed run has no `scram_id`, so this condition skips the active hold and renders ordinary waiting in Interface. The probe reproduced this. **Fix:** give the recorded package hold priority regardless of the latest run’s status; distinguish “held by SCRAM” from “this run was stopped” in the cause.

3. **Major — Actionable disputes disappear from needs-you routing.** [figures.ts:120](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:120)  
   A failed-run dispute actionable by the viewer appears in Inbox items, but the `ruling` branch overrides `own`, places it in Review and excludes it from `needs_me`. The probe returned one actionable Inbox item and zero needs-you figures. This also conflicts with OV-05’s dispute in Your office. **Fix:** preserve viewer ownership independently of the stuck state, and derive routing/counts from the shared attention decision.

4. **Major — Recorded agents and attention targets vanish.** [figures.ts:73](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:73), [figures.ts:87](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:87)  
   Intake runs belong to captures, so the package-only enumeration never includes them—even when Inbox routes their permission hold to the viewer. Returning a package also hides its previous agent until the new revision gains a run, despite an outstanding release decision. **Fix:** project capture-backed agents and represent outstanding attention targets explicitly. Separate figure counts from total Inbox attention where no recorded agent exists; do not claim “Nothing waits on you.”

5. **Major — Changed-input state is inferred from the wrong baseline.** [figures.ts:99](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:99), [figures.ts:218](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:218)  
   Create a dependent package, revise its upstream package, then prepare/release the dependent using that new upstream revision. Comparing against package creation still declares its input changed, although the prepared basis already includes the revision. **Fix:** compare current input revisions/digests with the recorded preparation or release basis. Show unknown freshness when that baseline is absent.

6. **Major — Projection cost grows through serial database round trips.** [figures.ts:79](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:79)  
   Each refresh first builds the complete Inbox, then serially queries latest runs, dependencies, run subjects and SCRAM state for packages. It repeats active-SCRAM discovery and scans `pending` per figure. Large portfolios incur this work even when most figures overflow. **Fix:** batch latest-run, dependency and hold reads; index attention by package once; share routing facts without rebuilding unrelated Inbox content.

7. **Major — Required figure marks are discarded before rendering.** [seat.ts:25](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/seat.ts:25)  
   Seating drops `marks`, and `StageFigure` cannot carry them. A Safety agent with a pending gate, changed input and multiple rounds shows only its state and package code. A rendered-stage probe confirmed all four additional marks were absent. **Fix:** carry and render the gate flag, changed-input triangle, loop count and Safety ring; extend both-theme harness fixtures to exercise their combinations.

8. **Major — OV-06’s governed card actions are missing.** [OfficeView.tsx:168](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/OfficeView.tsx:168)  
   Opening a working agent offers only “Open the package.” Call to office, direction, inputs/reach, watch live, park and stop are absent. **Fix:** provide the required actions through command descriptors, with explicit unavailable reasons where a command is not yet implemented. Keep OV-06 incomplete until exercised end to end.

9. **Major — Gate lens information is inaccessible without colour.** [lenses.ts:53](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/lenses.ts:53), [OfficeStage.tsx:103](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/OfficeStage.tsx:103)  
   Gate stage becomes only a tint. The figure’s accessible name, tooltip and selected card expose no gate-stage value, so a screen-reader user cannot determine which legend entry applies. **Fix:** provide each lens’s textual value in the accessible description and selected card, plus a visible textual alternative. Verify this through the actual OfficeView.

REVISE