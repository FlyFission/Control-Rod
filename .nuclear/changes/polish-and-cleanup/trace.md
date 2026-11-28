# Trace: Polish and cleanup from the November review (batch 10)

| Need | Code | Test |
| --- | --- | --- |
| First passkey needs the setup code (API-34) | `server.ts`, `app.ts` setupCodeMatches, `SignIn.tsx`, `scripts/cr.mjs` | `setup-code.test.ts`, `signin.test.tsx` |
| After-commit hook errors do not fail the commit (API-27) | `db/index.ts` | `after-commit.test.ts` |
| Missing themes folder (API-35) | `admin.ts` bundledThemes | `bundled-themes.test.ts` |
| Live stream ceiling | `app.ts` /events/stream, `events.ts` | `stream.test.ts` |
| Paging records back (WEB-15) | `events.ts` listEventsBefore, `Records.tsx` | `organization-visibility.test.ts`, `lib.test.ts` |
| Long reasons refused (API-25) | `work.ts` REASON_MAX | `runs.test.ts`, `inbox.test.ts` |
| Failed Inbox read is marked (WEB-16) | `Shell.tsx` InboxBadge | `shell-rail.test.tsx` |
| Side panel focus (WEB-9) | `SidePanel.tsx` | `side-panel.test.tsx` |
| Wording (WEB-19, WEB-20, WEB-24) | `Today.tsx`, `format.ts`, `NewWorkModal.tsx` | `wave3-pages.test.tsx`, `components.test.tsx`, `newwork.test.tsx` |
| Ollama network claim (DMN-24) | `adapter_ollama.go` | `adapter_test.go` |
| Client ceiling (DMN-31) | `client.go` | `boundary_test.go` |
| Agent PATH for detection (DMN-27), probe pipes (DMN-26) | `main.go`, `runtimes.go`, `agents.go`, `sandbox.go`, `seccomp_linux.go` | `go test ./internal/... ./cmd/...` |
| Zombie-safe test | `update-notice-store.test.ts` | same |
## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each finding in batch 10 of the 2026-11-28 review is fixed, already fixed on main, logged with a reason, or covered by another batch. The first passkey needs the setup code the server printed. Web, API and daemon typecheck and the related tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
