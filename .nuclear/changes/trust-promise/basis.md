# Basis: Make the trust promise true: Balanced by default, a trusted-key check, an update-check switch

**Change slug:** `trust-promise`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 review of Control Rod (batch 1: WEB-1, DOC-1, DOC-2, DOC-4, DOC-5) found that the product's trust promise and its behaviour disagreed.

- WEB-1 (P0) and DOC-1 (P1): new projects were created at Light, which releases cards and accepts a passing check on its own. New Work and the empty board said "nothing runs until you approve it", the first-run guide said to press Release, the check-in choice said "you sign the plan's release", and the README hero said "your passkey signs at release and at acceptance".
- DOC-2 (P1): "anyone can verify offline" overstated. `pnpm cr verify` checks the seal only against the key carried inside the bundle, so someone who re-seals the same entries with their own key gets a pass.
- DOC-4 (P2): the README said "zero phone-home", but every API start fetches `main` from the checkout's git origin with no off switch, and the daemon asks the npm registry for agent CLI versions.
- DOC-5 (P2): the README screenshots come from recorded sample fixtures (`.github/workflows/readme-shots.yml`), and the captions did not say so.

Owner decision, relayed by the session that started this work: make every fix, with **Balanced** as the default for new projects, and keep Light as an explicit choice whose words say plainly that it releases and accepts on its own. This replaces the "light default" chosen in change record `signing-policy` (2026-11-25). The alternative the review offered, keeping Light and rewriting the copy, was not taken.

Note on the decision as relayed: it describes Balanced as matching a promise that nothing is released or accepted without the person's passkey. Balanced signs every accept, but it releases a card on its own once its plan is drafted. The copy therefore says exactly that ("Cards start on their own. You sign each accept with your passkey before the work is handed over."), and the README hero says the passkey signs every acceptance by default, with signing each release available under Everything.

## Proposal

1. Web `lib/signing.ts`: `DEFAULT_SIGNING_PRESET = "balanced"`; Light's words say that cards start, and work that passes its check is accepted and handed over, on their own, without a signature. Helpers `cardFlowLine` (one sentence from a project's release and accept steps), `projectSteps` (a project's saved steps, or every step signed when none are saved or the project is Nuclear-grade, as the server does) and `ALL_SIGNED`.
2. `ProjectModal` sends `signing_preset: "balanced"` and shows Balanced's words. `SigningSettings` starts an unsaved project at Balanced and marks Balanced Recommended. The board's one-time offer to a project with no settings turns on Balanced, and says the accept is still signed.
3. Copy that follows the real settings: New Work's header (the active project's steps when the capture is tagged with its id, otherwise every step signed), the empty board, the first-run guide's release and accept steps (neutral words when the board does not know the project), Setup's no-project line, the check-in choice, the Agents roster and Workflow read-backs, and the workflow view (`buildCouncilFlow` takes the project's steps; with none, every step is signed as before).
4. API `signing-policy.ts`: `DEFAULT_PRESET = "balanced"`, with a comment. No server fallback changes: a project with no stored policy still signs every step.
5. `verify-bundle.ts`: `--trusted-key [<signer>=]<sha256>` (repeatable). The seal's key, the SHA-256 of the public key in `seal_evidence` (the same digest the chain records with the seal), must equal a trusted key, and that key's signer when one is named; otherwise the check fails with status 1 and says which key it found. An unsealed bundle fails under `--trusted-key`. Without the option, the output now prints the bundle key's SHA-256 and how to pin it. A receipt is still compared as it was made.
6. `update-notice.ts`: `updateCheckOff` reads `CONTROLROD_UPDATE_CHECK` (0, off, false, no), the same variable and values the daemon already reads (`daemon/cmd/controlrod/agents.go`), and `checkAtStart` skips the start-up check when it is off. A press of Check again still checks.
7. Docs: README hero, preset bullet, receipt bullet, compare table, a "What Control Rod contacts" paragraph, and "sample data" in each screenshot's alt text and a caption line under it; `docs/auditing.md` and `docs/quickstart-check.md` on `--trusted-key`; `docs/getting-started.md` on the update checks and the switch; the council-loop SVG labels (from `docs/research/second-checker/build.py`) and the landing page's matching lines.

## Out of scope

Existing projects' stored presets are not changed. A project already saved at Light stays at Light. A project with no saved settings still signs every step, and still sees the board's one-time offer, which now offers Balanced. `pnpm cr receipt` does not take `--trusted-key` (the receipt keeps its UNVERIFIED SEAL KEY line; `pnpm cr verify --trusted-key` gives the answer). Nothing under `.github/` is edited.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new project is created at Balanced, so every routine accept is signed with the passkey. Every screen that describes how a card goes (New Work, the empty board, the first-run guide, Setup, the Agents roster, the workflow view, the one-time board offer) says what the project's settings really do, and Light says plainly that it starts and accepts on its own. `pnpm cr verify --trusted-key` fails clearly when the seal's key is not the trusted key. `CONTROLROD_UPDATE_CHECK=0` stops the API's update check at start, as it already does the daemon's. The README says what is checked offline with and without `--trusted-key`, what Control Rod contacts, and that its screenshots show sample data. Web and API typecheck and tests pass, and `tools/check_public_claims.py` passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
