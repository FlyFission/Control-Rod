# Trace: Make every button and option work, or hide it until it does

| Need | Code | Test |
| --- | --- | --- |
| API-1: only worktree offered; other strategies refused in plain words | `workDefaults.ts`, `NewWorkModal.tsx`, `ProjectModal.tsx`, `repos.ts` bindCheckout, `refusals.ts` | `newwork.test.tsx` "supports capture settings...", `repos.test.ts`, `refusals.test.ts` |
| WEB-4: Add prepares and binds the worktree; a failed prepare sends nothing | `NewWorkModal.tsx` submit | `newwork.test.tsx` "captures with resolved project preferences...", "clears previously succeeded preparedPath..." |
| WEB-5: capture-box captures show on the project's Board | `CaptureBox.tsx` captureBoxHeader | `components.test.tsx` "tags a capture with the open project..." |
| WEB-3/API-8: effort reaches each CLI, only through a daemon that reads it | `spec/api.tsp`, daemon `client.go`, `runtime.go`, adapters, `attest.go`; API `work.ts`, `app.ts`, `workspace-projects.ts` | `effort_test.go` (3 tests); `runs.test.ts` "sends the chosen reasoning effort only to a daemon that reads it (#175)" |
| WEB-6: Compare removed | `router.tsx`, `places.ts`, `Explore.tsx` | `wave3-pages.test.tsx` |
| WEB-11: saved agents reach new cards | `workDefaults.ts` agentsChosen, `NewWorkModal.tsx` | `newwork.test.tsx` "supports capture settings..." |
| WEB-12: Quick add prepares for any repository project | `QuickAdd.tsx`, `scripts/lib/cards.mjs` | `quick-add.test.tsx` "still gives a card its own worktree..." |
| WEB-13: Setup has a New project button | `Setup.tsx` | `setup.test.tsx` |
| WEB-14: only built check-ins show | `Setup.tsx`, `agents.ts` | `setup.test.tsx` |
| WEB-8: SCRAM opens in place, one press of Stop now fires | `ScramSwitch.tsx`, `Scram.tsx` | `shell-scram.test.tsx` "opens the stop on this screen..." |
| WEB-2: Board New change opens New Work through context | `newWork.ts`, `Shell.tsx`, `BoardView.tsx` | `quick-add.test.tsx` "opens New Work from the empty board's own button..." |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each control in review batch 4 either does what it says or is gone. New Work and Quick add bind every card with a repository to its own worktree, preparing it on Add when needed. A capture from the capture box shows on the open project's Board. The chosen reasoning level reaches Claude Code as `--effort` and Codex as `model_reasoning_effort`, and only a daemon that says it reads the field gets it. Saved agents reach new cards. Setup offers only built check-in points and a button to make a project. SCRAM opens its confirm on the same screen. Compare is removed. Web, API and daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
