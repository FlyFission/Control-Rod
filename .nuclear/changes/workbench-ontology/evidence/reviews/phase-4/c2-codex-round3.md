Three major findings remain in `e710892`.

1. **Major — Presenting mode still leaks SCRAM reasons after restart.** [figures.ts:301](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:301) copies Inbox detail without redaction. A queued run acquires `waiting_cause: "scram"` and a reason containing the confidential SCRAM explanation during a claim attempt. Restart lifts the hold but leaves that text until another claim. With `held === null`, the projection exposes it through `own.detail` or `waiting_reason`. I reproduced this against the projection in memory.

   **Fix:** redact recorded SCRAM hold text throughout the presenting projection, including Inbox-derived causes after restart. Add an API regression covering pull → blocked claim → partial/full restart → presenting read before another claim. The existing test covers only an active hold. The confidentiality claim in [acceptance-status.md:22](/home/flyfission/worktrees/control-rod-phase0/docs/office-view/acceptance-status.md:22) remains too broad.

2. **Major — A stalled preview blocks the emergency stop indefinitely.** [Scram.tsx:74](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:74) requires success or an acknowledged error; the waiver appears only for `isError`. The preview’s fetch has no timeout. A request that never settles therefore leaves signing disabled with no escape path. The new [test:125](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/scram.test.tsx:125) demonstrates the pending state, then uses query-client cancellation/reset unavailable to the person. It only checks that the button becomes enabled afterward.

   **Fix:** bound preview loading with a timeout that exposes the explicit waiver. Test a permanently stalled preview through timeout, acknowledgement, passkey signing, and the actual stop command. Document the count-waiver exception in acceptance status.

3. **Major — Hold keys still combine unrelated underlying holds.** [figures.ts:294](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:294) treats every lane hold on the same package lane as shared, and every runtime-pin hold for the same role as shared. However:
   
   - Lane holds also represent separate unclassified sources, such as capture A versus capture B.
   - Runtime pins belong to a **runtime and role**; separate Claude and Codex pin failures for author runs receive the same key.

   I reproduced both collisions. `causeGroups` then presents the first hold’s explanation for the combined group. The preparation collision is fixed, but the replacement identities remain insufficient.

   **Fix:** record structured hold identities when dispatch records the hold: classification subject, admission lane, or affected pin IDs. Share keys only when those identities match; otherwise use the run ID. Add distinct-source and distinct-runtime tests alongside genuinely shared-hold tests.

The five round-two findings resolve as follows:

| Finding | Verification |
|---|---|
| Presenting figure redaction | Partial; active-hold path fixed and asserted, post-restart path still leaks |
| Presenting preview | Fixed in API and complete `OfficeView` assertions; counts replace run identifiers |
| Hold identity | Partial; preparation fallback and React/open-chip identity fixed, collisions remain above |
| Already-lifted restart targets | Fixed; server checks `!lifted`, with repeated package/discipline refusals asserting no additional record |
| Acceptance wording | OV-02 and latency corrections are appropriate; presenting confidentiality and unconditional pre-stop counting still exceed coverage |

The decision **not to bind SCRAM to a run-set digest is sound**: the signature authorizes the stated scope, and execution selects its current running runs under the SCRAM gate. Rejecting drift would obstruct stopping newly started work. The explicit count waiver is also sound in principle, subject to finding 2. The owner-role qualification, pending-form freeze, and focus-trap responses match the inspected code and assertions.

Verification was source/assertion inspection plus successful in-memory projection reproductions. Vitest failed before executing tests because Vite attempted a temporary-file write on the read-only filesystem.

REVISE