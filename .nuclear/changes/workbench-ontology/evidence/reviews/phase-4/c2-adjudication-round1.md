# PR C2 (#34): adjudication of Codex round 1 and the bot threads

Codex round 1 returned REVISE with nine findings. Every finding is accepted and fixed; none is deferred.

| # | Finding | Disposition | Where |
|---|---|---|---|
| 1 | The scope count came from office figures, not the pull's selection | Fixed at the root. `runsInReach` in `services/api/src/scram.ts` is now the one selection both `pullScram` and the new `GET /scrams/preview` use (organization scoped through `object_owners`, project scoped by the owner's project, every running run, older attempts included). The dialog shows the control plane's count with its time, lists the runs, and says the pull selects again when it fires | `scram.ts`, `app.ts`, `spec/api.tsp`, `Scram.tsx`; tests `scram.test.ts` (preview equals pull, project preview never reaches outside, unknown project 404), `preparation-grants.test.ts`, `scram.test.tsx` |
| 2 | A live refresh widened a draft review's `covers_batch` | Fixed. The review's basis is frozen once the reviewer starts (a reason typed or the disposition changed); a later report shows as new material, the sign button is disabled, and "Start over with every report" clears the draft and adopts the new basis. The sign button names the reports it covers | `Scram.tsx` `RunReview`; test `scram.test.tsx` |
| 3 | Quarantine could be signed off unseen | Fixed. Every report is listed with its status, time, output names and full sha256 digests before any disposition is offered | `Scram.tsx` `Batch`; test `scram.test.tsx` |
| 4 | Restart reused target and reason across scopes; nonexistent targets were accepted | Fixed on both sides. The client offers only packages the SCRAM still holds, or disciplines they record, as selects; a scope or target change clears the reason; the exact scope is stated before signing. The control plane refuses a package or discipline outside what the SCRAM reaches with the new reason code `not-in-scope` (catalogued in `refusals.ts`), and records nothing | `scram.ts` `scopePackages`, `restartAfterScram`; `GET /scrams/:id` now returns `packages` and each run's subject; tests `scram.test.ts`, `scram.test.tsx` |
| 5 | Cause groups merged by display text | Fixed at the root. The projection now carries `cause_key`, naming the recorded thing behind each cause: `scram:<id>`, `hold:<cause code, recorded reason, routed owner>`, `input:<package>@<revision>`, `deps:<role>:<packages>`, `queue:<role>`, else `run:<id>` (its own cause). `causeGroups` groups by key and uses the words only as the label. The owner is who the hold is routed to; the Inbox routes by role, so a named Member owner is not claimed (acceptance status narrowed) | `figures.ts`, `spec/api.tsp`, `exceptions.ts`; tests `figures.test.ts`, `office-view.test.tsx` |
| 6 | Presenting mode exposed SCRAM details | Fixed. `GET /scrams?presenting=true` returns each SCRAM as `ScramPresented` (id, organization, scope, project, drill) with its run count and timing, never its reason, runs or who pulled it; the banner passes presenting through and offers no review or restart while presenting | `scram.ts` `activeScramsFor`, `Scram.tsx`, `OfficeView.tsx`; tests `scram.test.ts`, `scram.test.tsx` |
| 7 | The modal did not contain focus | Fixed. The dialog is a native `<dialog>` opened with `showModal()` (the page behind is inert), with explicit Tab and Shift+Tab containment and Escape handling as well. Tests walk both tab boundaries and repeated tabbing; a local Playwright run in Chromium and Firefox confirmed `:modal`, containment in both directions, Escape and focus return (WebKit is not installed on this machine) | `Scram.tsx`, `office.css`; test `scram.test.tsx` |
| 8 | "Stopped" claimed before the stop | Fixed. The heading says "pulled on ... at ..."; completion is said only from the recorded `scram.stopped` event, with its own time | `Scram.tsx`; test `scram.test.tsx` |
| 9 | Acceptance status overclaimed | Fixed. OV-01, OV-03 and OV-09 are now partly met with their deferrals; OV-12 cites the assertions that hold each clause, including a new assertion that the pull revokes the run's preparation grant, and names its one limit (latency is between recorded timestamps, not checked against an outside clock). The both-themes clause of 4.7 is stated as held by the theme contract and the rendering harness, with the workflows theme independent | `docs/office-view/acceptance-status.md`, the execution ledger rows 4.7 and 4.10 |

## Bot threads

- Copilot or Codex connector, "Count SCRAM impact from organization-scoped runs": fixed by finding 1; the count is now the control plane's organization-scoped selection. The bot's wider note that the office floor reads are not organization filtered is true of every read API today: migration 009 makes inserts refuse unless exactly one organization is active, so all reads assume one active organization. Scoping every read by organization is a cross-cutting change for the tenancy work, recorded here rather than patched in one view.
- "Disable cancellation while the signed stop is pending": fixed; Cancel and Escape do nothing while the signed stop is in flight, and the button says it is signing. Test `scram.test.tsx` "cannot be cancelled while the signed stop is in flight".

## Verification

Web: 214 tests pass. API: 536 pass, 1 skipped (pre-existing). Typecheck and lint pass. `pnpm spec` and `gen:api` regenerated with no hand edits.

# Round 2

Codex round 2 confirmed the nine round 1 fixes in code and tests and returned REVISE with five findings. All are accepted and fixed.

| # | Finding | Disposition |
|---|---|---|
| 1 | SCRAM reasons leaked through presenting figures' causes | Fixed: the projection takes the presenting flag and drops the reason from a held figure's cause. `figures.test.ts` asserts the held, presentable figure is shown and the reason appears nowhere in the presenting response |
| 2 | The SCRAM control offered run identifiers while presenting | Fixed: the control stays available (an emergency stop is never hidden) but takes the presenting flag; `GET /scrams/preview?presenting=true` returns counts only (`running_count`, `queued_count`), and the dialog says which runs is not shown. Tested in `scram.test.ts` and through the whole `OfficeView` in `office-view.test.tsx` |
| 3 | Hold keys still merged by prose | Fixed: a hold is shared only by a recorded identity, a lane's admission (`hold:lane:<lane>`) or a runtime pin for the role (`hold:runtime-pin:<role>`); every other hold is the run's own. `CauseGroup` carries its key, used for the React key and the open chip. `figures.test.ts` asserts two preparation holds with identical messages stay apart and two lane holds on one lane group |
| 4 | Restart validation accepted already lifted targets | Fixed: the target must be a package no restart has lifted, or a discipline with at least one such package. `scram.test.ts` repeats a partial restart and asserts the refusal records nothing |
| 5 | Acceptance status still exceeded evidence | Fixed: OV-02 partly met (waiting Member's name), presenting claims cite both now tested paths, and the latency is described as control plane clock time sampled before the stopped event is recorded |

## Bot threads after round 1

- "Bind the command to the run set": answered by design. A SCRAM must fire even if the run set moves while the dialog is open; refusing on drift would block an emergency stop. The dialog states the control plane's count and that the pull selects again when it fires; the ScramEvent records exactly the runs it stopped, shown in the banner and the review.
- "OV-03 chip owner": the acceptance status marks OV-01, OV-02 and OV-03 partly met; the chip shows who the hold is routed to, by role, and a named Member owner needs assignment recorded.
- "Pull allowed while the count is loading or failed": fixed. Nothing fires while counting; on a failed count the stop is possible only after the person checks "Stop without a count", so an emergency stop is never blocked by a broken read. Tested in `scram.test.tsx`.
- "Focus trap": fixed in round 1 (native modal plus explicit Tab containment).
- "Freeze the scope controls while pending": fixed. The scope fieldset, reason and drill controls are disabled while the signed stop is in flight; tested.

Verification: web 216 tests pass; API 537 pass, 1 skipped (pre-existing); typecheck and lint pass.

# Round 3

Codex round 3 confirmed the run set decision and the count waiver as sound in principle and returned REVISE with three findings. All are accepted and fixed at the root.

| # | Finding | Disposition |
|---|---|---|
| 1 | A SCRAM's reason survived a restart in a queued run's recorded hold words | Fixed at the root: `restartAfterScram` clears `waiting_reason`, `waiting_cause` and `waiting_key` from every queued run held by a SCRAM that nothing holds any longer, in the restart's transaction. As a second guard, the presenting projection never shows a SCRAM hold's words. `scram.test.ts` pulls, lets a claim record the hold, restarts by discipline (the lifted run's words go, the still held run keeps them) and then fully, and reads the ordinary and presenting floor before any further claim: the reason appears in neither |
| 2 | A preview that never settles blocked the stop | Fixed: after six seconds without a count the dialog says counting is taking too long and offers "Stop without a count"; the waiver resets on a scope change. Tested with a count that never answers, through the waiver, the passkey and the stop command |
| 3 | Hold keys still combined unrelated holds | Fixed at the root: dispatch now records `waiting_key` on the run (contract `Run.waiting_key`) only where one decision resolves the hold for every run that names it: `lane-admission:<lane>` when no offered runtime is admitted, and `runtime-pin:<role>:<offered runtimes>` for a pin. An unclassified source, a preparation, an independence conflict and a SCRAM record none, so each is the run's own. The projection groups only by a recorded key. Tests: `disclosure.test.ts` and `runtimes.test.ts` assert the recorded keys; `figures.test.ts` asserts two admissions to one lane group, an unkeyed lane hold stays apart, and pins for different runtimes stay apart |

## Bot thread after round 2

- "Freeze restart scope controls while signing is pending": fixed. The review and restart forms are fieldsets disabled while their signature is in flight, as the pull dialog is; `scram.test.tsx` holds a restart signature open and asserts the scope and reason cannot change.

## Correction

Earlier verification notes said "lint passes". The repository has no lint script (`pnpm lint` is not a command), so nothing was linted; the checks that ran are the type checks (`pnpm typecheck`, all three packages) and the test suites.

Verification: web 217 tests pass; API 537 pass, 1 skipped (pre-existing); `pnpm typecheck` passes; daemon Go tests pass (the Run schema it embeds gained `waiting_key`).

# Round 4

Codex round 4 confirmed the stalled count waiver, the recorded keys (including that `holdRun` updates when only the key changes and that runs with `waiting_key` validate) and the signing freeze, and returned REVISE with two findings. Both are accepted and fixed.

| # | Finding | Disposition |
|---|---|---|
| 1 | A restart committing between the floor's Inbox read and its run read could leak the reason while presenting | Fixed with structured provenance rather than prose matching: a SCRAM hold now records `waiting_key: scram:<id>`, every Inbox item made from a SCRAM's words carries `scram_id` (contract `OfficeItem.scram_id`; `AttentionItem.scram_id` already existed), including permission items built from a held run and items refused as `scram-stopped`, and the presenting projection redacts when the run or either Inbox item says so. Reading the whole floor in one repeatable read snapshot was considered; it would mean widening the Inbox's entire call tree (package actions, administrative actions, office, confirmation checks) to take a transaction client, a larger change than this PR should carry. `figures-race.test.ts` reproduces the interleaving (the Inbox answers as before the restart, the run as after) and fails with the guard removed; `scram.test.ts` asserts the recorded key and the Inbox item's `scram_id` |
| 2 | Unclassified intake holds shared `lane-admission:undefined` | Fixed: the key is recorded only when the capture has a lane. `disclosure.test.ts` queues two legacy intakes on unclassified captures and asserts neither records a key |

Also added, as Codex noted it was missing: a review freeze assertion in `scram.test.tsx` (the disposition and reason cannot change while the review's signature is in flight).

Verification: web 217 tests pass; API 539 pass, 1 skipped (pre-existing); `pnpm typecheck` passes; daemon Go tests pass.
