# Basis: `omp` Integration and Visual Casting Desk

**Change slug:** `omp-integration-and-casting-desk`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Decision this basis supports:** whether `feat/omp-patterns-adapter-casting-desk` is merged.

## Mission / need

Control Rod currently runs only two sandboxed CLIs (`claude` and `codex`) and exposes a read-only runtime probe table with binary seat toggles on the Agents Roster page. Users who want multi-provider reach, structured role/effort presets, and author-only failover without editing terminal YAML files need two building blocks:

1. Registering `oh-my-pi` (`omp`, MIT License) as a daemon `Adapter` (`daemon/internal/runner/adapter_omp.go`) safely gated behind `AwaitingConfinement` until live OS confinement qualification is signed off (ADR 0021), with structured JSON stream parsing and upstream `provider/model` + vendor-family extraction for attestation (`attest.go`).
2. Adding a visual **Casting Desk** in `apps/web/` (`AgentsRoster.tsx`) with one-click presets (`Balanced`, `Deep`, `Fast & Frugal`, `Local-Only`), role cards (`Author`, `Blind Checker`, `Planner`, `Quick / Summarizer`) with model/vendor/effort controls, plain-language read-back, an Advanced disclosure with an Author-only Fallback Chain builder (never on Blind Checkers, per ADR 0023 / ADR 0024 Decision 6), and an honest `not-yet` listing for `omp` in `lib/agents.ts` and `lib/runtimes.ts`.

## Scope

In scope:
- `docs/patterns/oh-my-pi.md` and `docs/patterns/README.md`
- `docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md`
- `daemon/internal/runner/adapter.go`, `daemon/internal/runner/adapter_omp.go`, `daemon/internal/runner/adapter_omp_test.go`
- `apps/web/src/lib/agents.ts`, `apps/web/src/lib/runtimes.ts`, `apps/web/src/lib/casting.ts`, `apps/web/src/components/CastingDesk.tsx`, `apps/web/src/pages/AgentsRoster.tsx`, and web unit/component tests
- `.nuclear/changes/omp-integration-and-casting-desk/`

Out of scope (protected trust surfaces untouched): `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`. No API persistence or passkey signing of Casting Sheets is wired in this change; browser-saved casting drafts are explicitly labeled as local previews.

## Fixed inputs

- `AGENTS.md` Rules 1–6 (change record first; no edits to protected trust surfaces without human signature; permissive licenses only; clean-room pattern note).
- ADR 0021 (Native CLI sandboxes — no agent CLI starts without verified confinement).
- ADR 0023 (Role Casting — signed Casting Sheets, blind cross-vendor checking, no unattested in-run subagents).
- ADR 0024 (Council First — Simple by default, Advanced on demand; Decision 6 author-only failover).
- `docs/plan/HANDOFF.md` (never mutate user CLI config dirs; no API key or token fields in the web UI; honest UI for unbuilt capabilities).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Every daemon launch path passes `PreflightHost` and `Command`, both of which check `AwaitingConfinement`. | `sandbox.go` `PreflightHost` and `runtime.go` `Command` both call `confinementRefusal`. | A new launch path that bypasses `PreflightHost` or `Command`. |
| `omp` is multi-vendor, so `"omp"` alone never identifies a vendor family for cross-vendor checking. | `omp` routes across 60+ hosted and local providers. | Never invalidated; upstream `provider/model` attestation stays mandatory. |
| Browser-saved Casting Desk drafts do not alter live daemon runs until API/kernel Casting Sheet signing lands. | `apps/web` stores drafts in `localStorage` only and displays a clear preview banner. | Wiring live dispatch to unsigned browser state without ADR 0023 signing. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Pattern note: [oh-my-pi.md](../../../docs/patterns/oh-my-pi.md). Design spec: [2026-11-24-omp-integration-and-casting-desk-design.md](../../../docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md). Decisions: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md), [ADR 0023](../../../docs/adr/0023-role-casting.md), [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

`docs/patterns/oh-my-pi.md` and the design spec are in place; `omp` is registered in the daemon behind `AwaitingConfinement` with `NativeSandbox: "none"`, refuses every launch path until live confinement qualification lands, and parses `omp --mode json` events + upstream `provider/model` vendor families in unit tests; `apps/web` lists `omp` honestly as `not-yet` and renders the visual Casting Desk with presets, role cards, effort selectors, plain-language read-back, Author-only fallback chains, and an honest local-draft preview notice; `tools/check_register.py`, daemon tests, and web tests pass; no protected trust surface is touched; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
