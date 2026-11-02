# Phase 3 part 1 (tasks 3.1 and 3.2, shell and palette): Codex review adjudication

Reviewer: Codex CLI (read-only, ephemeral). Evidence: `shell-codex-round1.md` and later rounds beside it.

## Round 1 (verdict BLOCK)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3A-01 | Accepted, fixed | The dev and preview proxy gives the app only to GET page loads that ask for HTML and are not output or verification evidence paths (the same rule the control plane applies in production), so file links open as files. |
| P3A-02 | Accepted, fixed | Every live event now also refreshes the package actions, administration and runtimes queries, and a recorded decision refreshes the actions at once. When availability could not be fetched or refreshed, the palette says so and that the server decides again on acting. Tests: `live.test.tsx` (keys refreshed), `says when what the viewer may do could not be checked`. |
| P3A-03 | Accepted, fixed | An administrative command refused for everyone (`org.create`, `multi-organization-later`) is returned refused with its reason and what would change it, so neither Policies nor the palette offers it. Test: `test/admin.test.ts`. |
| P3A-04 | Accepted, fixed | Roster states absence (no daemon report, nothing pinned) only after a successful answer; while loading it says so, after a failure it says the runtimes could not be loaded or refreshed, with a retry, and that pins are unknown. Test: `never claims nothing is pinned when the runtimes could not be loaded`. |
| P3A-05 | Accepted, fixed | Options keep focus in the search field on pointer use; keys are handled at dialog scope; focus that moves outside the open dialog is brought back to the field. Test: `keeps focus in the palette when a refused command is clicked, and Escape still closes it`. |
| Medium: hash scrolling | Fixed | The package page and Policies scroll (and Policies focuses the command entry) whenever the hash changes, not only when data loads. |
| Medium: since you last looked | Partly fixed here | The comment now says the cursor is kept per browser. The digest itself moves to the server in task 3.3 (the next PR), which removes the single page limit. |

Verification after round 1 fixes: API 495 passed, 1 skipped; web 121 passed; build passes.
