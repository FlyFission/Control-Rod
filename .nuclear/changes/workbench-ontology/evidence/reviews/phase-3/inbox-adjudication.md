# Phase 3 part 2 (task 3.3, Inbox): Codex review adjudication

Reviewer: Codex CLI (read-only, ephemeral). Evidence: `inbox-codex-round1.md` and later rounds beside it.

## Round 1 (verdict BLOCK)

| ID | Disposition | Fix and proof |
|---|---|---|
| P3B-01 | Accepted, fixed | The SCRAM item is routed by the viewer's own standing (`adminActions` for `scram.review` and `scram.restart`, `signingGaps` for reconcile). With nothing blocking, it reads "You may restart it when it is safe" only for someone who may restart; anyone else sees it under waiting on an administrator. Readiness and permission are stated separately. Test: `puts a SCRAM that needs a person above everything else` (second member). |
| P3B-02 | Accepted, fixed | A lost run with an unknown outcome is the viewer's only if they may reconcile it; otherwise it is waiting on someone who may, with the missing qualification named. Test: `routes a lost run with an unknown outcome to someone who may reconcile it`. |
| P3B-03 | Accepted, fixed | `packageActions` refuses release with `scram-stopped` while SCRAM holds the package, exactly as submission does, so the Inbox, the decision bar and the palette never offer it; the Inbox lists it waiting on a restart after SCRAM. Test: same SCRAM test. |
| P3B-04 | Accepted, fixed | A prepared draft whose requirements are ready but unconfirmed becomes a `confirm` item binding the requirements digest (the one the confirmation signs), routed to whoever may confirm, opening the preparation panel. Test: `asks the person who may confirm requirements to confirm them`. |
| P3B-05 | Accepted, fixed | The digest counts preparation edits as changes and every signed act by a person as a signature (decisions, requirements confirmations, reconciles, independence overrides, SCRAM pulls, reviews and restarts, person verifications), never an agent's. Test: digest test with these events. |
| P3B-06 | Accepted, fixed | Gate criteria are counted from each package's criteria: for prepared packages the snapshot's criteria minus those with an admitted passing result, otherwise all acceptance criteria until the pre-check passes. A missing result is never a pass. Test: `counts criteria as open until something shows them met`. |
| P3B-07 | Accepted, fixed | Inbox query keys and the badge include the signed-in person, the digest cursor is stored per person, and the query cache is cleared on sign in and sign out. The cursor is read for the current person on every render and the Inbox does not load until the person is known, so no cursor is ever used or written for anyone else. Test: `marks them seen, on this person's own cursor` (another person's cursor untouched). |
| Medium: artifact bytes | Fixed | Decision subjects read output names and digests only (`outputDigestsOf`); file bytes are loaded only to build jobs. |
| Medium: unbounded digest read | Fixed | The digest reads events up to the head it reports, so marking seen never skips or double counts. |
| Medium: binding scope | Fixed | The binding sentence names the confirmed requirements and preparation basis, and the checker's criterion results and evidence, when the signed subject includes them. |

Verification after round 1 fixes: API 505 passed, 1 skipped; web 121 passed.
