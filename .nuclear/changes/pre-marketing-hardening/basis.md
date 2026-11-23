# Basis: Pre-marketing hardening and UX polish

**Change slug:** `pre-marketing-hardening`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** Whether Control Rod may ship non-trust-surface reliability, security, daemon/CLI, web UX, and documentation fixes ahead of public marketing.

## Mission / need

A pre-marketing due diligence audit of `main` (`69fe9698`) identified reliability bugs, API access-control gaps, daemon/CLI shutdown and token-handling races, broken Look B/C light-theme surfaces, half-wired secondary pages, failing local QA tool checks (`check_public_claims.py`, `check_register.py`), and stale documentation.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Scope Phases 1–3 without touching trust surfaces | "Phases 1–3 (non-trust-surface): all of the above plus onboarding/UX cleanup (hide or fix half-wired Compare/Snapshots/Setup controls, pre-passkey look-around/demo prep, and cr doctor/CLI polish)" | 2026-11-23, Antigravity chat session | Fix P0/P1 backend, daemon, CLI, frontend, tool-gate, and documentation issues without modifying `policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, or `docs/adr/`. | Any edits to trust-surface directories, Cycle 2 repo binding into daemon jobs, or M5–M7 feature builds. |
| D2 | Default `CONTROLROD_EGRESS_FILTER` on while keeping preparation flags opt-in | "(Recommended) Turn CONTROLROD_EGRESS_FILTER on by default; keep GUIDED_PREPARATION and PREPARED_RELEASE opt-in until piloted" | 2026-11-23, Antigravity chat session | Author runs wire the local TCP/CONNECT egress filter by default unless `CONTROLROD_EGRESS_FILTER=0`/`false`; guided preparation and prepared release stay opt-in. | Enforcing egress filtering on pre-check workspaces or replacing the HTTP proxy with network namespaces. |
| D3 | Lead positioning with Software developers per ADR 0024 | "(Recommended) Lead with Software developers (per ADR 0024): simplify navigation, fix broken pages/styling, and clearly gate upcoming/unbuilt options" | 2026-11-23, Antigravity chat session | Fix broken CSS and layout on secondary pages, mark unimplemented Setup check-in options as coming soon, clarify Compare/Snapshots/NewWork capabilities honestly, and default GeoMap offline. | Removing Capital Projects mode or hiding existing routes required by tests. |
| D4 | Deliver on a local branch with change record for review before pushing | "(Recommended) Create a local branch with a valid .nuclear/changes/ record and commit cleanly for your review before pushing" | 2026-11-23, Antigravity chat session | Work on local branch `fix/pre-marketing-hardening` with a complete `.nuclear/changes/pre-marketing-hardening/` record and commit locally without pushing to `origin`. | Pushing to `origin` or opening a pull request automatically. |
| D5 | Push branch and open draft PR | "did you finish everything? if not do that and push a PR, if so go ahead and push it." | 2026-11-23, Antigravity chat session | Complete any remaining host verification, push `fix/pre-marketing-hardening` to `origin`, and open a draft pull request to `main`. | Merging the PR or modifying any trust-surface directory. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All non-trust-surface API, daemon, CLI, frontend, and documentation fixes land on `fix/pre-marketing-hardening`; `check_public_claims.py`, `check_register.py`, `check_owner_decisions.py`, `spec` build, `typecheck`, `build`, `apps/web` tests, `go vet`, and `tools` unit tests pass; no trust-surface files are modified.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
