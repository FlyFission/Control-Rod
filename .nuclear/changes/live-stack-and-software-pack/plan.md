# Plan: live stack cleanup and software domain pack

1. `apps/web/e2e/live/stack.ts`:
   - Add `"ollama"` and `"agy"` alongside `"claude"`, `"codex"`, `"opencode"`, `"grok"`, `"gemini"`, and `"antigravity"` in `AGENT_BINARIES` so `pathWithoutAgents()` hides every Wave 2 CLI adapter when running in fake-only mode.
   - Wrap `startStack()` startup (`await stack.startApi(); if (daemonBin) await stack.startDaemon();`) in `try { ... } catch (err) { await stack.stop(); throw err; }` so a failure in `startDaemon()` (or `startApi()` after launch) tears down any started API/embedded Postgres/daemon processes and removes the `/tmp/cr-live-*` temp directory (unless `LIVE_KEEP` is set).
2. `services/api/src/work.ts`:
   - Export `findRoleIn`, `packFiles`, `preCheckRole`, `jobIntakeGuides`, and `roleToolText` without changing runtime behavior.
3. `packs/software/`:
   - Update `packs/software/README.md` documenting the layout and conventions.
   - Create `packs/software/roles/software-author.md`, `packs/software/roles/software-author.tools.md`, and `packs/software/roles/software-pre-check.md` with no hardcoded engineering numbers and explicit independent pre-check and evidence rules.
   - Create `packs/software/bugfix/`, `packs/software/feature/`, and `packs/software/migration/`, each with depth-2 `roles/intake.md`, `templates/`, and `typicals/`.
4. `services/api/test/software-pack.test.ts` and `docs/status.md`:
   - Add Vitest coverage verifying `findRoleIn`, `preCheckRole`, `roleToolText`, `packFiles`, and `jobIntakeGuides` resolve `packs/software/` cleanly with zero symlinks and within `packFiles` size limits.
   - Update `docs/status.md` to reflect that `packs/software/` is populated.
5. Verify with `@control-rod/api` typecheck, `vitest run test/software-pack.test.ts`, `@control-rod/web` typecheck, repo checks, and `ng.py validate --strict-custody`.

## Interfaces as built

- `AGENT_BINARIES` in `apps/web/e2e/live/stack.ts` includes `"claude"`, `"codex"`, `"opencode"`, `"grok"`, `"gemini"`, `"antigravity"`, `"ollama"`, `"agy"`.
- `startStack()` in `apps/web/e2e/live/stack.ts` calls `await stack.stop()` in `catch` before rethrowing.
- `services/api/src/work.ts` exports `findRoleIn`, `packFiles`, `preCheckRole`, `jobIntakeGuides`, and `roleToolText`.
- `packs/software/` provides shared roles under `roles/` and playbooks under `bugfix/`, `feature/`, and `migration/`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All edits implemented and tested in `services/api/test/software-pack.test.ts`, typechecks passing for `@control-rod/api` and `@control-rod/web`, and `ng.py validate --strict-custody` passing on this packet. Nothing here claims live Playwright e2e execution or runtime behavior changes in `daemon/`.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
