Major issues remain in `f895ec4`.

1. **Major — SCRAM reasons still leak through presenting-mode figures.** [figures.ts:292](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:292) includes `held.reason` in every affected figure’s cause. Presenting mode filters restricted figures but applies this projection unchanged to visible figures. An organization SCRAM therefore exposes its confidential reason through otherwise presentable work, despite `activeScramsFor` redacting it. I reproduced the projection returning `Held by SCRAM scr-private: PRIVATE SCRAM REASON`.

   **Fix:** redact SCRAM reasons throughout the presenting projection, including figure causes and resulting cause chips. Add an API test with visible and restricted work under one SCRAM, asserting that its reason occurs nowhere in the presenting response. The current test checks only the `/scrams` summary.

2. **Major — Presenting mode still offers an unfiltered run preview.** [OfficeView.tsx:80](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/OfficeView.tsx:80) renders `ScramControl` while presenting. Opening it calls the unrestricted preview at [Scram.tsx:51](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/Scram.tsx:51); “Which runs” displays running and queued identifiers, including restricted work. The banner’s presenting test renders only `ScramBanner`, so it misses this path.

   **Fix:** propagate presenting mode into the control and provide a safe aggregate preview without run identifiers, or require leaving presenting mode before opening it. Test this through the complete `OfficeView`.

3. **Major — Hold keys still merge unrelated causes by prose.** [figures.ts:288](/home/flyfission/worktrees/control-rod-phase0/services/api/src/figures.ts:288) builds `holdKey` from the cause category, reason text and generic resolver description. Those fields do not identify the underlying hold. For example, separate preparation failures receive the same generic message from [lifecycle.ts:93](/home/flyfission/worktrees/control-rod-phase0/services/api/src/preparation/lifecycle.ts:93), and consequently become one cause group. I reproduced identical keys for distinct runs with separate generic preparation holds. Some preparation reasons are also truncated before storage, preserving the original collision problem.

   **Fix:** key by the recorded preparation, input, policy or hold identity; fall back to the run ID when no shared identity exists. Test distinct holds with identical messages and genuinely shared holds separately. Carry that identity into `CauseGroup` and the React key; [OfficeView.tsx:204](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/features/office/OfficeView.tsx:204) still keys chips by display text.

4. **Minor — Restart validation accepts targets already lifted.** [scram.ts:344](/home/flyfission/worktrees/control-rod-phase0/services/api/src/scram.ts:344) checks membership in `scopePackages` but ignores its `lifted` field. A direct signed request can record another package restart after that package was released, or another discipline restart when every package in it is already lifted. The client excludes these targets, but the claimed server enforcement does not.

   **Fix:** require a matching package with `lifted === false`; for a discipline, require at least one matching held package. Test repeated partial restarts and assert that refusals create no record.

5. **Minor — Acceptance status still exceeds its evidence.** [acceptance-status.md:12](/home/flyfission/worktrees/control-rod-phase0/docs/office-view/acceptance-status.md:12) marks OV-02 “Met,” although its approved Then clause requires the waiting Member’s name—the same missing assignment acknowledged under OV-01. [Line 22](/home/flyfission/worktrees/control-rod-phase0/docs/office-view/acceptance-status.md:22) also claims presenting confidentiality despite findings above, and describes latency as the interval between two event timestamps. The implementation computes latency before `appendEvent` acquires the event lock and assigns the stopped timestamp; existing assertions establish integer storage and readback, not timestamp-difference equality.

   **Fix:** mark OV-02 partly met, narrow presenting claims until both leak paths are tested, and describe latency as elapsed application-clock time sampled before recording completion—or change its implementation and test the stated relationship.

All nine original findings were checked:

| Round 1 | Verification |
|---|---|
| 1 | Shared `runsInReach` selection implemented; API tests cover preview/pull agreement and project boundaries. Older-attempt coverage remains mocked client evidence. |
| 2 | Frozen review basis and explicit restart of the draft implemented and asserted. |
| 3 | Batch statuses, output names and full digests displayed and asserted. |
| 4 | Scope changes clear target/reason; nonexistent and outside-project targets refused. Already-lifted validation remains incomplete. |
| 5 | Failed-run collisions fixed; generic hold collisions remain. |
| 6 | Summary redaction implemented; complete presenting confidentiality remains broken. |
| 7 | Native `showModal`, cancellation handling and focus containment implemented; boundary assertions added. |
| 8 | Pull and completion wording correctly separated and asserted. |
| 9 | Several claims narrowed; remaining overclaims noted above. |

The preview requires an active person session and scopes reads to that member’s organization. I found no new authorization or project-scope bypass in that path.

This was a source/assertion audit plus isolated in-memory projection checks. The targeted Vitest run failed before executing tests because Vite attempted a temporary-file write on the read-only filesystem.

REVISE