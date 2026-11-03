1. **Major — A concurrent restart can still leak the SCRAM reason while presenting.** [figures.ts:289](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:289) guards redaction using the run’s current `waiting_cause`, but `officeFigures` reads the Inbox before reading runs. If restart commits between those reads, the Inbox retains confidential hold text while the run’s SCRAM marker has been cleared. With no active hold, line 303 copies that text into the presenting response.

   I reproduced this through the complete `officeFigures` function with mocked reads representing that interleaving.

   **Fix:** read the Inbox, runs, and SCRAM index from one repeatable-read snapshot, or carry structured SCRAM provenance with Inbox items and redact independently of the later run body. Add an interleaving regression test. The confidentiality claim in [acceptance-status.md:22](/home/flyfission/worktrees/control-rod-phase0/docs/office-view/acceptance-status.md:22) exceeds the sequential tests’ coverage.

2. **Minor — Unclassified intake holds receive a shared identity.** [work.ts:890](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:890) always supplies `lane-admission:${capLane}`. When an existing queued intake encounters an unclassified capture, `capLane` is undefined, so unrelated captures share `lane-admission:undefined`. The projection consequently merges their holds. Normal creation avoids queuing unclassified intake, which limits this defect to existing queued records.

   **Fix:** supply the shared key only when `capLane` exists; otherwise omit it. Test two existing queued intakes on separate unclassified captures. The new figure test manually supplies unkeyed holds and therefore misses this caller behavior.

The remaining requested checks resolve as follows:

- **Restart cleanup:** the sequential discipline/full-restart regression asserts cleared words before another claim. `scramHolding` checks every remaining SCRAM before clearing, preserving overlapping holds by inspection; overlapping-SCRAM coverage is absent.
- **Stalled preview:** fixed. The new test follows a permanently pending count through timeout, explicit waiver, signing, and the stop command.
- **Recorded keys:** package classification failures remain unkeyed; different runtime offers receive different keys. An in-memory check confirmed `holdRun` updates when only the key changes. A valid run containing `waiting_key` passes schema validation, and the daemon’s Run schema matches.
- **Signing freeze:** both review and restart controls are inside disabled fieldsets while pending. The restart freeze is asserted; the review freeze lacks a dedicated assertion.

Verification used source/test inspection and in-memory execution. Vitest failed before running tests because Vite requires a temporary-file write on this read-only filesystem.

REVISE