Found nine issues requiring revision:

1. **Major — Scope count understates what SCRAM stops.** [Scram.tsx:47](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:47) counts office figures. That projection selects only the latest run at the current package revision and omits accepted/closed packages; `pullScram` selects **every running run** owned in scope (`scram.ts:141–148`). An older running attempt can therefore be stopped despite not being counted. **Fix:** obtain the preview from the server using the same selection as `pullScram`; describe concurrent changes explicitly.

2. **Major — A live refresh silently expands a draft review’s coverage.** [Scram.tsx:185](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:185). While someone writes a review, a late batch triggers live query invalidation. `newest` advances, but their reason and disposition remain; clicking Sign now submits the newer `covers_batch`. The backend accepts it because it matches the latest batch. **Fix:** freeze the reviewed batch boundary, invalidate the draft when batches change, and require explicit review of the new material.

3. **Major — Quarantine can be signed off without seeing what it contains.** [Scram.tsx:196](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:196). The API returns batch IDs, reported statuses, output names and digests, but the panel displays only aggregate counts. A reviewer can “retain” or “discard” unidentified outputs and unblock restart. **Fix:** display each batch and its output identities/digests before offering the signed disposition.

4. **Major — Restart scope changes reuse the previous target and justification.** [Scram.tsx:233](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:233), [Scram.tsx:267](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:267). Switching Package → Discipline preserves both `target` and `reason`. A package identifier matching a discipline can unintentionally authorize a broader restart. Arbitrary nonexistent targets also receive successful restart records because the backend checks blockers without validating that the target exists. **Fix:** use separate validated selectors, clear justification on scope changes, and show the exact affected scope before signing.

5. **Major — Different holds are merged by display text.** [exceptions.ts:79](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/exceptions.ts:79). Two unrelated failed author runs without errors both produce `Author run failed`, no `waiting_on`, and become one “shared cause.” Truncated cause strings can collide too. Conversely, no recorded Member owner is supplied for the missing-input example. **Fix:** project a stable cause identity and owner identity from the server; group by those, using prose only as a label.

6. **Major — Presenting mode exposes SCRAM details from hidden work.** [OfficeView.tsx:84](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/OfficeView.tsx:84). `ScramBanner` renders unconditionally and fetches unfiltered SCRAM details. A presenter who hides restricted figures can still display their run IDs and SCRAM reasons through Review and restart. **Fix:** provide a presentation-safe server projection and suppress sensitive detail controls while presenting.

7. **Major — The modal does not contain keyboard focus.** [Scram.tsx:63](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:63). `aria-modal` and autofocus do not make the background inert or trap focus. Tab past Cancel reaches underlying controls; Escape then may not reach the dialog handler. The accessibility test checks only initial focus and immediate Escape. **Fix:** use a native modal dialog or implement focus containment and background inertness; test forward and reverse tab boundaries.

8. **Minor — Stop completion is claimed before confirmation.** [Scram.tsx:143](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:143). The heading always says “stopped [scope] at [pull time],” even while the next paragraph says “Stopping.” This presents the request timestamp as completion. **Fix:** say “SCRAM pulled” or “Stopping” until `s.stopped` exists; use its timestamp for completion.

9. **Major — Acceptance status overstates the cited evidence.** [acceptance-status.md:3](/home/flyfission/worktrees/control-rod-phase0/docs/office-view/acceptance-status.md:3). The cited test files exist, but several claims exceed their assertions:

   - **OV-03:** the fixture contains a dependency description, not a Member owner; there is no projection test establishing identical recorded hold identities.
   - **OV-12:** backend tests never assert credential/grant revocation. Latency checks establish an integer and round-trip equality, not measurement accuracy. Client tests mock figures independently of the backend selection.
   - **OV-01:** the cited projection assertions accept generic role descriptions such as “someone who is…”, not another Member’s name.
   - **OV-09:** marked “Met” despite explicitly deferring the required new-spend behavior.
   - Task **4.7** requires acceptance cases on both themes; the theme harness exercises rendering checks, not all these acceptance workflows.

   **Fix:** narrow each row to its actual assertions, mark remaining clauses partial/deferred, and add the missing end-to-end evidence before claiming closure.

I found no reason/passkey bypass in the inspected command path: the backend independently enforces both. This was a source and assertion audit; tests were not executed.

**REVISE**