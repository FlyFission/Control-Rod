Static review of `39e4bd9`; no files modified or tests executed.

**Closed for their reported paths:** P5-01, P5-03–P5-27. **P5-02 and P5-28 remain incomplete:** config parsing, preparation-save checks and direct dispatch checks work, but configured provenance can still disappear behind a package marking.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|
| P5-29 | High | **Materializing a legacy package marking bypasses configured-source admission.** Accepted legacy package B can have an internal stored lane and outputs derived from a restricted configured document. Adding B as A’s dependency calls `ensureMarking`, which reconstructs B using only `storedSources`, omitting configured sources. Dispatch then returns B’s new internal marking before checking `storedConfigured`, allowing Claude/Codex to receive B’s outputs. Later config lane raises are likewise invisible behind existing markings. | [markings.ts:178](/home/flyfission/worktrees/control-rod-phase0/services/api/src/markings.ts:178), [work.ts:202](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:202), [work.ts:210](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:210), [work.ts:659](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:659) | Include configured sources when reconstructing markings. Ensure recursive admission checks their current classification even when a package already has a marking; refuse unclassified sources and propagate lane raises. |

BLOCK