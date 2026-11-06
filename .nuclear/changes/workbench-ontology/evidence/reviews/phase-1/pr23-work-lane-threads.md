# Phase 1: four work.ts lane threads on PR #23

Codex connector threads on `services/api/src/work.ts`, still open after merge. Checked against `main` at `d25deae` on 2026-11-06.

| Thread | Decision | Change and evidence |
|---|---|---|
| 4430235488: an unrelated draft edit is refused after an input raised the package | Accepted, fixed | Confirmed: once a capture raise makes the package's effective lane higher than its own `data_lane`, `updateDraft` compared the unchanged lane with the effective one and refused a title edit as a lowering. Only a lane the person changed is judged now, and a raise of the draft's own lane that stays below what it inherits is allowed; lowering the draft's own lane is still refused. Test: "takes an unrelated draft edit after an input raised the package above its own lane" in `markings.test.ts`. |
| 4430294151: classifying a legacy capture queues intake again | Accepted, fixed | Confirmed: a capture from before lanes has no lane, so `classifyCapture` treated it as never classified and queued a second intake. It now queues intake only when the capture has no intake run and no package. Test: "classifies a legacy capture that already went through intake without queueing intake again" in `disclosure.test.ts`. |
| 4430310534: intake hold written before the row is locked | Accepted, already closed | Every claim now takes `pg_advisory_xact_lock(hashtext('controlrod-budget'))` first (`work.ts` in `claim`, from PR #38), so no two claims run at once and a hold cannot overwrite a run another claim started. No change. |
| 4430393916: the package view and output downloads show a cached lane | Accepted, fixed | Confirmed: admission reads configured source lanes live from the owner's config, which markings never record, but `packageView` and `packageLane` read only the marking. Both now take the more sensitive of the marking and the live provenance lane, so the view's `effective_lane` and the download's `x-controlrod-lane` match what admission enforces. Test: "labels a package's view and downloads with a configured source's lane, though its marking records none" in `disclosure.test.ts`. |

The three new tests fail on `main` and pass with the fix. Full API suite: 598 pass, 2 fail (`command-boundary` SEC-01 and SEC-03, which fail the same way on `main` against this environment's trust-auth test database), 2 skipped.
