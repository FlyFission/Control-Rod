# Trace: Make the trust promise true: Balanced by default, a trusted-key check, an update-check switch

| Need | Code | Test |
| --- | --- | --- |
| New projects start at Balanced (WEB-1) | `apps/web/src/lib/signing.ts` DEFAULT_SIGNING_PRESET, `ProjectModal.tsx`, `services/api/src/signing-policy.ts` DEFAULT_PRESET | `signing-default.test.tsx` "is created at Balanced...", `signing.test.tsx` "makes Balanced the default...", `signing-policy.test.ts` "defaults new projects to Balanced..." |
| Setup and the board offer start at Balanced; Light's words say it accepts on its own | `SigningSettings.tsx`, `AutonomyOffer.tsx`, `lib/signing.ts` | `signing.test.tsx` "starts at Balanced...", "says plainly that Light...", "turns on the default, Balanced..." |
| Each preset's words match its steps | `lib/signing.ts` SIGNING_PRESETS, cardFlowLine | `signing.test.tsx` "matches each preset's own words to its steps", "says what each preset does..." |
| New Work says what the governing settings do | `NewWorkModal.tsx` | `signing-default.test.tsx` "New Work" (Balanced, Light, no project, no saved settings) |
| First-run guide follows the settings | `FirstRunGuide.tsx`, `BoardView.tsx` | `signing-default.test.tsx` "the first-run guide" |
| Workflow view and check-in copy follow the settings | `lib/councilFlow.ts`, `lib/agents.ts`, `Workflow.tsx`, `Setup.tsx`, `AgentsRoster.tsx` | `signing-default.test.tsx` "the workflow view and check-ins"; existing `councilFlow.test.ts` unchanged and passing |
| No stored policy still signs every step | `signing-policy.ts` modeFor (unchanged) | `signing-policy.test.ts` "defaults new projects...", "signs every step while the project has no policy" |
| README hero and preset bullet match (DOC-1) | `README.md` | `tools/check_public_claims.py` |
| `--trusted-key` (DOC-2) | `services/api/src/verify-bundle.ts` | `verify-bundle.test.ts` "pnpm cr verify --trusted-key" (7 tests) |
| README and docs say what offline checking shows (DOC-2) | `README.md`, `docs/auditing.md`, `docs/quickstart-check.md` | review |
| Update-check switch (DOC-4) | `services/api/src/update-notice.ts` updateCheckOff, checkAtStart; `server.ts` | `update-notice-store.test.ts` "CONTROLROD_UPDATE_CHECK=0 stops the check at start..."; daemon `agents_test.go` (existing) |
| README says what Control Rod contacts (DOC-4) | `README.md`, `docs/getting-started.md` | review |
| Screenshots marked sample data (DOC-5) | `README.md` | review |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new project is created at Balanced, so every routine accept is signed with the passkey. Every screen that describes how a card goes (New Work, the empty board, the first-run guide, Setup, the Agents roster, the workflow view, the one-time board offer) says what the project's settings really do, and Light says plainly that it starts and accepts on its own. `pnpm cr verify --trusted-key` fails clearly when the seal's key is not the trusted key. `CONTROLROD_UPDATE_CHECK=0` stops the API's update check at start, as it already does the daemon's. The README says what is checked offline with and without `--trusted-key`, what Control Rod contacts, and that its screenshots show sample data. Web and API typecheck and tests pass, and `tools/check_public_claims.py` passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
