Static verification of `f19019f` (`phase-3/shell`), using the requested three-dot diff. No files modified or tests run.

- **P3A-01 — Closed:** GET/HTML bypass excludes output and verification-evidence paths; preview inherits the proxy configuration. Evidence: [vite.config.ts:37](/home/flyfission/worktrees/control-rod-phase0/apps/web/vite.config.ts:37).
- **P3A-02 — Closed:** Live events invalidate actions, administration and runtimes; decisions also invalidate actions; the palette warns when eligibility refresh fails. Evidence: [live.ts:31](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/lib/live.ts:31), [DecisionBar.tsx:51](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/DecisionBar.tsx:51), [CommandPalette.tsx:134](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/CommandPalette.tsx:134).
- **P3A-03 — Closed:** Unsupported organization creation returns a refused descriptor with explanatory text. Evidence: [admin.ts:203](/home/flyfission/worktrees/control-rod-phase0/services/api/src/admin.ts:203), [admin.ts:714](/home/flyfission/worktrees/control-rod-phase0/services/api/src/admin.ts:714).
- **P3A-04 — Closed:** Initial loading/failure no longer asserts absent pins; failed refreshes explicitly warn that retained data may be outdated. Evidence: [Roster.tsx:33](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/pages/Roster.tsx:33), [Roster.tsx:86](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/pages/Roster.tsx:86).
- **P3A-05 — Closed:** Pointer interaction preserves input focus, escaped focus returns, and dialog-level handling supports Escape. Evidence: [CommandPalette.tsx:56](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/CommandPalette.tsx:56), [CommandPalette.tsx:120](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/CommandPalette.tsx:120), [CommandPalette.tsx:166](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/CommandPalette.tsx:166).
- **Prior Mediums:** Hash scrolling **closed** ([PackagePage.tsx:19](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/pages/PackagePage.tsx:19), [Policies.tsx:16](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/pages/Policies.tsx:16)); digest **partial**, with honest browser-storage wording but unchanged pagination, explicitly deferred to task 3.3 ([SinceLastLooked.tsx:7](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/SinceLastLooked.tsx:7)).

No new High or Critical defects established.

| ID | Severity | Finding | Evidence (file:line) | Fix |
|---|---|---|---|---|

Nonblocking Mediums: palette Home/End handling overrides normal search-field caret movement ([CommandPalette.tsx:91](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/components/CommandPalette.tsx:91)); package-list fetch failure can present “No packages yet” ([Packages.tsx:81](/home/flyfission/worktrees/control-rod-phase0/apps/web/src/pages/Packages.tsx:81)). Preserve text-editing keys and distinguish retrieval failure from an empty result. Static inspection does not establish the manual WCAG acceptance pass.

MERGE