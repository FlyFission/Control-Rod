Round 1 findings **1, 2, 3 and 9 are fixed**: effective-lane filtering, SCRAM priority, viewer-owned dispute routing, and textual lens values are implemented with regression coverage. Findings **4, 5 and 6 remain partially fixed**.

Three major defects remain:

1. **Failed and lost intake agents disappear.** [figures.ts:202](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:202)  
   When intake fails, stops, or loses its lease, Inbox supplies no corresponding capture item and this filter removes the agent—including an unreconciled unknown outcome. A source-level probe returned zero figures and zero attention counts for each terminal failure state.  
   **Fix:** retain unresolved intake failures and unknown outcomes, project their causes, and route their recovery through shared attention logic. Add failed/lost intake regressions.

2. **Changed-input detection ignores pinned sources outside `depends_on`.** [figures.ts:157](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:157), [figures.ts:295](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:295)  
   A preparation can pin another package as a design input without declaring a workflow dependency. If that source advances, detection never examines it: the figure remains working and the Change lens claims “Inputs current.” The probe reproduced this. The corrected baseline works for explicit dependencies, including matching pins and unknown baselines.  
   **Fix:** derive freshness checks from recorded preparation/release sources, independently of readiness dependencies; batch current-source reads. Test a revised pinned design input with no dependency edge.

3. **Serial projection cost remains through Inbox and active SCRAM checks.** [figures.ts:74](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:74), [figures.ts:154](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:154)  
   Every refresh still constructs the complete Inbox, whose loop performs serial package, run, authority and subject reads ([inbox.ts:95](/home/flyfission/worktrees/control-rod-phase0/services/api/src/inbox.ts:95)). While any SCRAM is active, each figure additionally repeats subject and active-hold queries. Batching the subsequent projection reads only partly resolves finding 6.  
   **Fix:** share batched routing facts with Inbox and resolve holds from one loaded SCRAM/ownership/restart dataset. Add query-scaling coverage.

Deferring **7 and 8 to PR C is acceptable as sequencing into task 4.7**. It does not complete WB-06. The plan’s [definition of done](/home/flyfission/worktrees/control-rod-phase0/docs/superpowers/plans/2026-10-29-workbench-buildout.md:185) still requires passing evidence or a reasoned deferral with owner acknowledgement at completion.

Validation: **52 focused web tests passed**. Reviewed the API tests and both-theme browser harness; database/browser suites were not rerun in this read-only environment. Reproductions above used the actual projection source with mocked database/routing inputs.

REVISE