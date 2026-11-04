Reviewed only `origin/phase-5/budgets...HEAD` at `14fff3d5`.

1. **High: Generated invitation links lose their token during routing.** [AdminSections.tsx:135](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:135) generates `/#invitation=...`, but the `/` route redirects to `/inbox` without preserving the hash. The installed router resolves that redirect to `/inbox`; `SignIn` then has no invitation to read. **Fix:** link directly to a stable invitation route, capture the token before routing, and test through the production router.

2. **High: Bootstrap permits an authority combination that locks out qualification administration.** [AdminSections.tsx:519](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:519) allows selecting only `administrator`. Issuing that qualification closes bootstrap permanently, while subsequent `qualification.issue` calls require both administrator and policy authority. Nobody can grant the missing authority. Selecting only policy also contradicts the “allowed once” description because bootstrap remains open. **Fix:** require administrator and policy authority for completing bootstrap, explain both, and test subsequent qualification issuance.

3. **Medium: Ordinary Members receive unnecessary personal and authenticator evidence.** [registry.ts:15](/home/flyfission/worktrees/control-rod-p5records/services/api/src/registry.ts:15) returns full qualification bodies, including license numbers and reasons; [registry.ts:18](/home/flyfission/worktrees/control-rod-p5records/services/api/src/registry.ts:18) returns full credential bodies, including raw attestation evidence. `/admin` requires membership, without an administrative authority check. Disabled forms do not restrict this response. **Fix:** return explicit display projections and restrict detailed evidence to the owner or appropriate administrative authority. Add a Member response test.

4. **Medium: Enrollment discards the invitation it already creates.** [AdminSections.tsx:55](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:55) reads a nonexistent top-level `user_name` and tells the administrator to invite the person separately. The real command returns `{ member, invitation }` and has already created a bearer token. **Fix:** display `result.member.user_name` and the returned invitation link; describe enrollment as creating both membership and an invitation.

5. **Medium: Several descriptions omit actual payload changes or command effects.**

   - [AdminSections.tsx:301](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:301): project creation sends `qa_overlays`, but its description omits them.
   - [AdminSections.tsx:167](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:167): qualification issuance describes only the license count, omitting jurisdiction, number, expiry and discipline.
   - [AdminSections.tsx:526](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:526): bootstrap sends disciplines but never describes them.
   - [AdminSections.tsx:76](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:76): removal also revokes open delegations, which the description omits.

   **Fix:** include these values and effects in the confirmation text. Test that changing each material payload field changes the description.

6. **Medium: Invitation cleanup occurs only after successful registration.** [SignIn.tsx:51](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/pages/SignIn.tsx:51) leaves the live bearer token in the address and current history entry while the user waits, cancels, or encounters an error. **Fix:** capture it in memory and immediately replace the address, before registration begins. Retain the in-memory token for retries. The fragment itself does avoid request-line and referrer transmission; I found no added server logging path.

7. **Medium: The budget form cannot update an existing budget.** [AdminSections.tsx:482](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/AdminSections.tsx:482) never sends `budget_id`, so every submission takes the creation branch in `admin.ts`. An administrator cannot amend an existing hard cap through this screen. **Fix:** add an existing-budget selector and send its ID with the supported updates; describe those updates explicitly.

8. **Low: Checkbox guidance is not programmatically associated with its controls.** [CommandForm.tsx:141](/home/flyfission/worktrees/control-rod-p5records/apps/web/src/features/admin/CommandForm.tsx:141) renders checkbox-group hints without an ID or `aria-describedby`. This includes bootstrap authority guidance. **Fix:** give each hint an ID and associate it with the fieldset or relevant controls.

9. **Medium: Ledger row 5.4 overclaims completion and verification.** [2026-10-29-workbench-buildout.md:118](/home/flyfission/worktrees/control-rod-p5records/docs/superpowers/execution/2026-10-29-workbench-buildout.md:118) claims exact descriptions, working invitation handling and command coverage despite the defects above. Its signing test checks the final submitted payload, without comparing it to the options request. **Fix:** narrow the row to implemented behavior and outstanding limits, then restore completion claims after integrated routing and contract tests pass.

Direct commands currently pass the same payload object to challenge issuance and submission. The unsigned proposal forms match the catalogue’s `none` entries. Registry queries are organization scoped and select latest qualification and credential versions before presenting revocation state. Labels and status/alert roles are otherwise present; no em or en dashes were found in the reviewed UI strings.

Validation was static inspection, an installed-router redirect probe, and `git diff --check`; the test suites were not run.

REVISE