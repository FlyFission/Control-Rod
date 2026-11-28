# Plan: Make the trust promise true: Balanced by default, a trusted-key check, an update-check switch

1. Web: default preset and preset words in `lib/signing.ts`; ProjectModal, SigningSettings and AutonomyOffer use the default.
2. Web: copy that follows the project's steps in NewWorkModal, BoardView, FirstRunGuide, Setup, lib/agents.ts, AgentsRoster, Workflow and lib/councilFlow.ts.
3. API: `DEFAULT_PRESET` to Balanced; unit test of the default and of the no-policy fallback.
4. API: `--trusted-key` in verify-bundle.ts, with tests for a match, a different key that otherwise checks, a key tied to another signer, an unsealed bundle, a receipt with a trusted key, and the option's parsing.
5. API: `CONTROLROD_UPDATE_CHECK=0` stops the start-up update check, with a test.
6. Docs and README; regenerate the README SVGs; run `tools/check_public_claims.py`.
7. Web suite, typecheck, related API suites, script tests and repo gates. The owner decides the merge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new project is created at Balanced, so every routine accept is signed with the passkey. Every screen that describes how a card goes (New Work, the empty board, the first-run guide, Setup, the Agents roster, the workflow view, the one-time board offer) says what the project's settings really do, and Light says plainly that it starts and accepts on its own. `pnpm cr verify --trusted-key` fails clearly when the seal's key is not the trusted key. `CONTROLROD_UPDATE_CHECK=0` stops the API's update check at start, as it already does the daemon's. The README says what is checked offline with and without `--trusted-key`, what Control Rod contacts, and that its screenshots show sample data. Web and API typecheck and tests pass, and `tools/check_public_claims.py` passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
