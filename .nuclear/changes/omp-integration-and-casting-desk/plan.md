# Plan: `omp` Integration and Visual Casting Desk

## Wave 1 — Docs & Change Record
1. Write clean-room pattern note `docs/patterns/oh-my-pi.md` (MIT provenance, ideas only, adopt/adapt/skip table) and list it alphabetically in `docs/patterns/README.md`.
2. Write design spec `docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md` covering Part A (`adapter_omp.go`) and Part B (Casting Desk in `apps/web/`).
3. Create change record `.nuclear/changes/omp-integration-and-casting-desk/{basis,plan,risk,trace,verification,ship}.md` and run `python3 tools/check_register.py`.

## Wave 2 — Daemon Adapter (`daemon/internal/runner/`)
4. Implement `daemon/internal/runner/adapter_omp.go` (`ompAdapter{}`): `ID`, `Binary`, `DisplayName`, `Providers`, `Capabilities` (`MultiVendor: true`, `NativeSandbox: "none"`), `AwaitingConfinement` (`ConfinementGap()`), `Available`, `Probe`, `Command` (`omp --print --mode json --no-session --model <id> --thinking <level>` with isolated `PI_CODING_AGENT_DIR`), `LaunchInfo`, `Normalize`, `TurnEnd`, and `StreamMetadataParser` (`StreamLabel`, `StreamModel`) plus `OmpVendorFamily`.
5. Register `ompAdapter{}` in `daemon/internal/runner/adapter.go`.
6. Add `daemon/internal/runner/adapter_omp_test.go` covering registration, `AwaitingConfinement` refusal in `PreflightHost` and `Command`, `NativeSandbox == "none"`, `Probe`, `Command` args/env, `Normalize`, `TurnEnd`, and `StreamMetadataParser` vendor-family extraction.

## Wave 2 — Web App Casting Desk (`apps/web/`)
7. List `omp` honestly (`runnable: false`) in `apps/web/src/lib/agents.ts` and `apps/web/src/lib/runtimes.ts`.
8. Implement `apps/web/src/lib/casting.ts` (presets: `Balanced`, `Deep`, `Fast & Frugal`, `Local-Only`; role definitions: `Author`, `Blind Checker`, `Planner`, `Quick / Summarizer`; model catalog entries with vendor family & effort levels; plain-language read-back and cross-vendor / local-checker warnings; Author-only fallback chain helpers; `localStorage` draft persistence).
9. Implement `apps/web/src/components/CastingDesk.tsx` and mount it in `apps/web/src/pages/AgentsRoster.tsx` with Simple View default, collapsed Advanced disclosure for Author-only fallback chains, explicit "Blind Checkers never fail over" notice, and explicit local-draft preview notice (ADR 0023).
10. Add web unit and component tests, run `go test`, web `vitest` / typecheck, and `python3 tools/check_register.py`, then finalize `verification.md`.

## Follow-up (out of scope for this change)
- Live OS confinement qualification of `omp` under ADR 0021 in its own change record before removing `AwaitingConfinement`.
- API persistence and passkey signing for ADR 0023 Casting Sheets.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Pattern note: [oh-my-pi.md](../../../docs/patterns/oh-my-pi.md). Design spec: [2026-11-24-omp-integration-and-casting-desk-design.md](../../../docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md). Decisions: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md), [ADR 0023](../../../docs/adr/0023-role-casting.md), [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

`docs/patterns/oh-my-pi.md` and the design spec are in place; `omp` is registered in the daemon behind `AwaitingConfinement` with `NativeSandbox: "none"`, refuses every launch path until live confinement qualification lands, and parses `omp --mode json` events + upstream `provider/model` vendor families in unit tests; `apps/web` lists `omp` honestly as `not-yet` and renders the visual Casting Desk with presets, role cards, effort selectors, plain-language read-back, Author-only fallback chains, and an honest local-draft preview notice; `tools/check_register.py`, daemon tests, and web tests pass; no protected trust surface is touched; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
