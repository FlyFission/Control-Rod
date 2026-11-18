# Basis: workspace UI redesign and local repository materialization

**Change slug:** `workspace-ui-redesign`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer (`@FlyFission`)
**Date:** 2026-11-17
**Decision this basis supports:** whether PR `#82` (`feat/workspace-ui-redesign`) is ready for owner `/spec/` CODEOWNERS review and squash-merge to `main` as part of Cycle 1 PR hardening.

## Mission / need

PR `#82` brings the workspace UI redesign (224px navigation rail, Software vs. Capital Projects mode toggle, `New work` modal, Look B/C theme CSS variables), local repository discovery and materialization (`GET /repos`, `POST /repos/materialize`), board slice M4 (`board-m4`), program gap analysis (`program-gap-analysis`), and Codex `0.167.0` feature qualification (`deferred_tool_world_state`). Independent multi-CLI and automated reviews identified path/Git boundary risks in `services/api/src/repos.ts`, TypeSpec contract drift, unbacked CLI options and async race bugs in `NewWorkModal.tsx`, board P2 bugs, stale `board-m4/ship.md` branch references, and a WCAG 2.5.3 `label-content-name-mismatch` on `.palette-trigger` in `Shell.tsx`. This packet anchors the Cycle 1 fixes and evidence for `#82`.

## Scope

In scope:
- `spec/api.tsp`, `spec/generated/`, `services/api/src/preparation/schema.d.ts`, `apps/web/src/api/{types.ts,client.ts}` (additive `Repos` namespace and generated TypeScript types).
- `services/api/src/{app.ts,repos.ts,refusals.ts}` and `services/api/test/repos-materialize.test.ts` (repository listing, safe materialization, path/symlink/dot-dir/$HOME containment, `hostGitEnv` + `GIT_CEILING_DIRECTORIES` + `GIT_CONFIG_*` non-persistent `gh()` hardening, `repo-identity-mismatch` refusal).
- `apps/web/src/` (`Shell.tsx`, `NewWorkModal.tsx`, `newwork.test.tsx`, `places/places.ts`, `lib/{mode.ts,runtimes.ts,workDefaults.ts}`, `pages/Inbox.tsx`, `styles.css`, `features/board/*`, `apps/web/e2e/board-looks.spec.ts`).
- `daemon/internal/runner/sandbox.go:368` (`deferred_tool_world_state` in `CodexDisabledFeatures`) and `daemon/internal/runner/testdata/launch-golden/*.json`.
- Governance & docs sync: `docs/commands/inventory.md`, `docs/README.md`, `docs/status.md`, `docs/superpowers/`, `.nuclear/changes/board-m4/ship.md:5`, `.nuclear/changes/program-gap-analysis/`, and `.nuclear/changes/workspace-ui-redesign/`.

Out of scope (explicitly deferred to Cycle 2):
- Wiring runtime or materialized-workspace selections from `NewWorkModal` directly into daemon execution (`daemon/internal/runner/workspace.go`).
- Enabling the 8 CLI ecosystems beyond `claude` and `codex` (`agy`, `opencode`, `grok`, `cursor`, `copilot`, `aider`, `cline`, `ollama`).
- Wave 1 `#83` endpoints (`POST /repos/checkpoint`, `POST /repos/remove`, `mode` parameter on `/repos/materialize`).
- Qualifying `codex-cli 0.169.0` features beyond `0.167.0` (discovered during local verification; tracked separately).
- Any edits to `policies/`, `tests/redteam/`, `.github/workflows/`, `kernel/`, or `docs/adr/`.

## Fixed inputs

- Cycle 1 design specification (`docs/superpowers/specs/2026-11-16-cycle1-pr-hardening-design.md`) and implementation plan (`docs/superpowers/plans/2026-11-17-cycle1-pr-hardening.md`), approved by owner Ben Huffer (`@FlyFission`), including authorization for additive `/spec/api.tsp` changes (`Repos` namespace).
- `.github/CODEOWNERS`: `/spec/` requires review by a maintainer who did not author the change (`@FlyFission` sign-off on PR `#82`).
- `AGENTS.md` Rules 1–6 and `docs/collaboration.md` (squash-merge, DCO `Signed-off-by:`, honest AI-authorship disclosure, no skipped or relaxed tests).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Owner local workspaces live in a non-dot directory inside `$HOME` (default `~/controlrod-workspaces`). | `resolveSafeWorkspaceRoot()` in `services/api/src/repos.ts:222` rejects `$HOME` itself and any dot-prefixed top segment under `$HOME`. | A supported workflow requiring workspaces in `~/.something` or outside `$HOME`. |
| Only `claude` and `codex` have daemon preflight/confinement in Cycle 1; the other 8 CLIs remain disabled in `NewWorkModal`. | `apps/web/src/lib/runtimes.ts` (`runnable: true` only on `claude` and `codex`) and `daemon/internal/runner/sandbox.go`. | Any Cycle 1 change allowing non-`claude`/`codex` selection or claiming daemon binding works. |
| `gh` CLI authenticates via user environment and respects `GIT_CONFIG_COUNT`/`KEY`/`VALUE` injected into subprocess env. | `gh()` and `gitConfigEnv()` in `services/api/src/repos.ts`, verified by `test/repos-materialize.test.ts`. | A `gh` version that strips `GIT_CONFIG_*` variables or requires persisting config into `.git/config`. |
| TypeSpec `spec/api.tsp` is the single source of truth for API schemas and web client types. | `pnpm spec` + `pnpm --filter @control-rod/web gen:api` + `git diff --exit-code` (`evidence/spec-drift.log`). | Any manual edit to `spec/generated/*`, `services/api/src/preparation/schema.d.ts`, or `apps/web/src/api/schema.d.ts`. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All Cycle 1 `#82` deliverables pass TypeSpec drift, API Vitest, Web Vitest/typecheck/build, Chromium `board-looks.spec.ts` axe scans, Python governance checks, and `ng.py validate --strict-custody`; open local `codex-cli 0.169.0` and pre-existing `check_register.py` findings are recorded accurately without skipping tests; and the owner completes `/spec/` CODEOWNERS review and merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
