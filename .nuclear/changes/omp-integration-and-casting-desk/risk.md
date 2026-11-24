# Risk: `omp` Integration and Visual Casting Desk

- **Mode:** Standard
- Execution owner: Wave 1 (Docs & Change-Record Architect) and Wave 2 (Daemon & Web App implementers) on branch `feat/omp-patterns-adapter-casting-desk`.
- Decision owner: Ben Huffer. No protected surface is touched: no `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`, or `spec/` edits.
- Scope: see [basis](basis.md).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | An `omp` run launches without verified OS confinement and reaches the host filesystem or network. | `ompAdapter` implements `AwaitingConfinement` with an explicit `ConfinementGap()`; `PreflightHost` and `Command` refuse it; `NativeSandbox` is `"none"`. Tested in `adapter_omp_test.go`. | `omp` returning a live command from `runtime.go` `Command` or passing `PreflightHost` before qualification. |
| R-02 | `omp` is treated as a single vendor, allowing `omp(anthropic/*)` to check a Claude author run. | `Capabilities.MultiVendor` is `true`; `StreamMetadataParser` extracts the resolved upstream `provider/model`; `OmpVendorFamily` maps canonical families and fails closed (`""`) on unknown names. | Any unknown or unparsed model counting as an independent checker family. |
| R-03 | `omp` mutates the user's `~/.omp/` configuration or reads/leaks OAuth tokens. | `Command` isolates `PI_CODING_AGENT_DIR` inside the run workspace and `SandboxRequired()` enforces `AgentEnv` secret stripping. | Any read/write to `~/.omp/` by Control Rod. |
| R-04 | Users assume browser-saved Casting Desk drafts are already enforced and passkey-signed on live runs. | Casting Desk displays a prominent local-draft preview notice stating drafts are browser-only until ADR 0023 API/passkey signing lands; `omp` is listed as `not-yet` (`runnable: false`). | UI claiming live enforcement or passkey signature for a local draft. |
| R-05 | Casting Desk allows configuring fallback chains on Blind Checker seats ("pass shopping"). | Fallback chain builder is scoped exclusively to the `Author` role inside the collapsed Advanced disclosure, with an inline notice that Blind Checkers never fail over (ADR 0023, ADR 0024 Decision 6). | Any UI control attaching a fallback chain to Blind Checker. |
| R-06 | Casting Desk introduces raw API key or token fields in the web UI. | Zero credential/key inputs in `CastingDesk.tsx` or `casting.ts` (`docs/plan/HANDOFF.md` hard rule). | Any API key or token field added to web UI. |
| R-07 | Pattern note copies upstream prose/code or trips the borrowed-code register check. | `docs/patterns/oh-my-pi.md` is written clean-room in Control Rod's own words (MIT source, ideas only) and verified with `python3 tools/check_register.py`. | `check_register.py` returning non-zero. |

## Selected mode

- **Mode:** Standard
- Basis: adds a confinement-gated daemon adapter (refused on launch), clean-room docs, and a browser-local UI preview; zero contract or protected-surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Pattern note: [oh-my-pi.md](../../../docs/patterns/oh-my-pi.md). Design spec: [2026-11-24-omp-integration-and-casting-desk-design.md](../../../docs/superpowers/specs/2026-11-24-omp-integration-and-casting-desk-design.md). Decisions: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md), [ADR 0023](../../../docs/adr/0023-role-casting.md), [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

`docs/patterns/oh-my-pi.md` and the design spec are in place; `omp` is registered in the daemon behind `AwaitingConfinement` with `NativeSandbox: "none"`, refuses every launch path until live confinement qualification lands, and parses `omp --mode json` events + upstream `provider/model` vendor families in unit tests; `apps/web` lists `omp` honestly as `not-yet` and renders the visual Casting Desk with presets, role cards, effort selectors, plain-language read-back, Author-only fallback chains, and an honest local-draft preview notice; `tools/check_register.py`, daemon tests, and web tests pass; no protected trust surface is touched; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
