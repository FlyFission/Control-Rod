# Basis: live stack cleanup and software domain pack

**Change slug:** `live-stack-and-software-pack`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether the branch `feat/live-stack-and-software-pack` is merged to harden `apps/web/e2e/live/stack.ts` and populate `packs/software/` (closing Gap G-08).

## Mission / need

Two concrete operational gaps remain on `main`:
1. `apps/web/e2e/live/stack.ts` (`AGENT_BINARIES` and `startStack()`) did not hide the Wave 2 CLI binaries `"ollama"` and `"agy"` in `pathWithoutAgents()`, and did not clean up the started API process, embedded PostgreSQL, or `/tmp/cr-live-*` temp directory if post-API startup (such as `startDaemon()`) failed.
2. `packs/software/` was still a placeholder (Gap G-08 in `docs/superpowers/specs/2026-11-08-program-gap-analysis.md`), leaving software intake and authoring without domain-specific roles, tools, templates, typicals, or depth-2 job intake guides.

## Scope

In scope: `apps/web/e2e/live/stack.ts`, `services/api/src/work.ts` (exporting existing pack/role resolution helpers for testing), `services/api/test/software-pack.test.ts`, `packs/software/` (`README.md`, `roles/`, `bugfix/`, `feature/`, `migration/`), `docs/status.md`, and this packet. Out of scope: any trust surface (`policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, `docs/adr/`), daemon adapter changes, or capital-projects domain packs beyond existing test fixtures.

## Fixed inputs

Gap G-08 constraints in `docs/superpowers/specs/2026-11-08-program-gap-analysis.md` (no hardcoded engineering numbers inside packs); pack and role resolution rules in `services/api/src/work.ts` (`findRoleIn`, `preCheckRole`, `roleToolText`, `packFiles`, `jobIntakeGuides`); live test stack isolation rules in `apps/web/e2e/live/stack.ts`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Wave 2 CLI adapters execute binaries named `claude`, `codex`, `opencode`, `grok`, `ollama`, and `agy` (plus `gemini`, `antigravity`). | `Binary()` methods in `daemon/internal/runner/adapter_*.go`. | A new adapter binary is added without updating `AGENT_BINARIES`. |
| `jobIntakeGuides()` discovers job guidance at `packs/<mode>/<job>/roles/intake.md` (depth 2) and `findRoleIn()` skips `intake.md`. | `services/api/src/work.ts` lines 736-808. | Changing pack discovery depth or role lookup precedence in `work.ts`. |
| `preCheckRole(cfg, role)` resolves `${role}-pre-check` then `${role.split("-")[0]}-pre-check`, so `software-author` resolves to `software-pre-check`. | `services/api/src/work.ts` lines 791-794. | Changing `preCheckRole` naming convention. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`apps/web/e2e/live/stack.ts` hides all Wave 2 agent binaries and cleans up on startup failure; `packs/software/` is populated with shared roles and `bugfix/`, `feature/`, and `migration/` playbooks verified by `services/api/test/software-pack.test.ts`; API and web typechecks pass; and the owner makes the merge decision. Nothing here claims live Playwright e2e execution against a running browser or external CLIs.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
