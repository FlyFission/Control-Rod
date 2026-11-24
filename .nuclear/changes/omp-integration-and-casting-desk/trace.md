# Trace: `omp` Integration and Visual Casting Desk

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | Clean-room pattern note `docs/patterns/oh-my-pi.md` is written, indexed in `docs/patterns/README.md`, and passes `tools/check_register.py`. | `python3 tools/check_register.py` | implemented and verified (Wave 1) |
| T-02 | Design spec `docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md` specifies Part A (`adapter_omp.go`) and Part B (Casting Desk) without touching protected surfaces. | Diff check against protected paths | implemented (Wave 1) |
| T-03 | `ompAdapter` is registered in `daemon/internal/runner/adapter.go`, reports `NativeSandbox: "none"` and `MultiVendor: true`, and is refused by `PreflightHost` and `Command` via `AwaitingConfinement`. | `adapter_omp_test.go` & `adapter_test.go` `TestAwaitingConfinementIsRefused` | planned (Wave 2) |
| T-04 | `ompAdapter` `Probe`, `Command`, `LaunchInfo`, `Normalize`, and `TurnEnd` handle `omp --version` and `omp --print --mode json --no-session --model <id> --thinking <level>` with isolated `PI_CODING_AGENT_DIR`. | `adapter_omp_test.go` | planned (Wave 2) |
| T-05 | `ompAdapter` implements `StreamMetadataParser` (`StreamLabel`, `StreamModel`) and extracts resolved `provider/model` + vendor family (`OmpVendorFamily`), failing closed on unknown models. | `adapter_omp_test.go` | planned (Wave 2) |
| T-06 | `apps/web` lists `omp` honestly as `not-yet` (`runnable: false`) in `lib/agents.ts` and `lib/runtimes.ts`. | Web unit tests | planned (Wave 2) |
| T-07 | Casting Desk in `AgentsRoster.tsx` provides presets (`Balanced`, `Deep`, `Fast & Frugal`, `Local-Only`), 4 Role Cards (`Author`, `Blind Checker`, `Planner`, `Quick / Summarizer`) with model/vendor/effort controls, and plain-language read-back with cross-vendor and local-checker warnings. | Web component & unit tests | planned (Wave 2) |
| T-08 | Casting Desk Advanced disclosure provides an Author-only Fallback Chain builder, never exposes checker failover, has zero API key fields, and clearly states browser drafts are a local preview of ADR 0023 signed Casting Sheets. | Web component & unit tests | planned (Wave 2) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Pattern note: [oh-my-pi.md](../../../docs/patterns/oh-my-pi.md). Design spec: [2026-11-24-omp-integration-and-casting-desk-design.md](../../../docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md). Decisions: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md), [ADR 0023](../../../docs/adr/0023-role-casting.md), [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

`docs/patterns/oh-my-pi.md` and the design spec are in place; `omp` is registered in the daemon behind `AwaitingConfinement` with `NativeSandbox: "none"`, refuses every launch path until live confinement qualification lands, and parses `omp --mode json` events + upstream `provider/model` vendor families in unit tests; `apps/web` lists `omp` honestly as `not-yet` and renders the visual Casting Desk with presets, role cards, effort selectors, plain-language read-back, Author-only fallback chains, and an honest local-draft preview notice; `tools/check_register.py`, daemon tests, and web tests pass; no protected trust surface is touched; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
