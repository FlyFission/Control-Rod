Reviewed committed `phase-3/inbox` at `b0aa783` using the requested three-dot diff. Static review only; no files modified or tests run.

Against `inbox-codex-round5.md` and `inbox-adjudication.md:57–59`:

- **P3B-14 — Closed.** Preparation routing uses the viewer’s return descriptor, including qualification, hardware-key and lifecycle checks. Evidence: [inbox.ts:73–77](/home/flyfission/worktrees/control-rod-phase0/services/api/src/inbox.ts:73), [work.ts:2077–2097](/home/flyfission/worktrees/control-rod-phase0/services/api/src/work.ts:2077). These match return enforcement at `work.ts:2122–2139`.
- **P3B-15 — Closed.** Held queued intake runs are enumerated independently of packages, identified by capture, and routed through capture SCRAM checks and hold-resolution authority. Evidence: [inbox.ts:161–180](/home/flyfission/worktrees/control-rod-phase0/services/api/src/inbox.ts:161).
- **Disputes Medium — Closed.** The digest counts disputes across both queues, eliminating the viewer-only “No disputes are open” error. Evidence: [inbox.ts:224](/home/flyfission/worktrees/control-rod-phase0/services/api/src/inbox.ts:224), `inbox.ts:297–301`.

No new High or Critical defects found in the round 5 changes; no P3B-16 assigned.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|

Medium: “Open the capture” opens the generic Packages page without selecting the capture (`apps/web/src/pages/Inbox.tsx:151`; `services/api/src/inbox.ts:170`). Use an honest generic label or a capture-specific destination. Prepared-artifact hashing remains the accepted Medium; spend remains deferred to task 5.2.

MERGE