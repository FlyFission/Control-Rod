# Phase 3 part 3 (tasks 3.4 to 3.7, case view): Codex review adjudication

Reviewer: Codex CLI (read-only, ephemeral). Evidence: `case-codex-round1.md` and later rounds beside it.

## Round 1 (verdict BLOCK)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3C-01 | Accepted, fixed | A running run's story refreshes every three seconds while visible and on every live event (`run-events` joins the live refresh list); its query key carries the run's status, so a run that finishes is read once more in full. A failed refresh says the story may be missing the latest steps; a live one says it is still being written. Test: `says a running run's story is still being written`. |
| P3C-02 | Accepted, fixed | The binding sentence for a draft no longer names an act ("releases"); it says what any signature on the draft binds, so it is true for release and reject alike. The Inbox uses the same sentence. Test: Inbox ordering test. |
| P3C-03 | Accepted, fixed | Every signing path is gated on a current, successful answer from the server: the decision buttons and the reason form's Sign button are disabled while a refresh has failed, and a decision started before permission was withdrawn is put away when the next answer refuses it, with the refusal shown. Tests: `puts away a decision whose permission was withdrawn`, `disables signing when a refresh of what the viewer may sign fails`. |
| P3C-04 | Accepted, fixed | Checked shows each evidence item's custody (generated, selected and presented by) and flags every axis not separated from the author (shared, coupled or unknown); the pre-check line warns about it in every tier, including the compact one. Test: `shows who generated, selected and presented the evidence and flags every axis not separated, even compactly`. |
| Medium: permission mode and tools | Fixed | Missing permission mode and tool list are flagged as not recorded. |
| Medium: abbreviated digests | Fixed | The decision bar also shows the full digest. |
| Medium: exit evidence reproducibility | Fixed | The exit spec is committed as `apps/web/e2e/phase3-exit.spec.ts`; the evidence file records the command and the raw output of a run. |

Verification after round 1 fixes: API 511 passed, 1 skipped; web 135 passed; exit spec 4 passed.

## Round 2 (verdict MERGE)

P3C-01 to P3C-04 and the round 1 Mediums closed; no new High or Critical findings. Both remaining Mediums are fixed before merge:

| ID | Disposition | Fix and proof |
|---|---|---|
| Medium: exit spec only logs | Fixed | The exit spec now asserts: no axe violations, the skip link first and every place reachable by Tab, the palette navigating, no reflow failures, and the 1.5 s budget for the case view's first story view and the full story. Rerun: 4 passed. |
| Medium: empty story after a failed refresh | Fixed | An empty story says the refresh failed (or, for a live run, that no events have arrived yet) instead of claiming none were recorded. |

Final verification: API 511 passed, 1 skipped; web 135 passed; exit spec 4 passed with assertions.

## CI finding before merge

CI's TypeScript job reported three unhandled `57P01` (administrator shutdown) errors while the preparation test files stopped their databases; every test passed. The cause was real beyond the tests: no database pool had an `error` listener, so an idle connection the server drops (a restart, an administrator's shutdown) is an uncaught error that ends the process. The reader, writer and migration pools now note the drop and carry on (the pool opens a new connection on next use), and the test harness's owner pools expect it at shutdown. Test: `test/pool-resilience.test.ts`.
