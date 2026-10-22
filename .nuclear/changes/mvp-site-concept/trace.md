# Trace: MVP with the site concept job

**Purpose:** Tie each claim to its basis, control, evidence and merge stance.

**Change slug:** `mvp-site-concept`
**Owner:** Ben Huffer
**Date:** 2026-10-22

---

## Change context

- **Slug:** `mvp-site-concept`
- **Related records:** `basis.md`, `verification.md`
- **Owner:** Ben Huffer
- **Date:** 2026-10-22
- **Requirements cross-reference:** `basis.md#derived-requirements-or-claims`, C-001 to C-025

## Trace summary

| ID | Claim | Basis link | Control / design feature | Verification evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | Only a human with a verified passkey over the matching subject digest can release, accept, return or reject. | `basis.md#protected-outcomes` | Kernel decision rules; signed challenge | E-001, E-002 | Merge after owner signature on kernel edits | pass |
| C-002 | Agents can only claim, submit output, submit a pre-check or revise. | `basis.md#protected-outcomes` | Kernel transition table | E-001 | Merge after owner signature | pass |
| C-003 | The pre-checker runs on a different baseline and a different runtime identity, or on the same runtime only after a recorded owner override, and never receives the author's log. | `basis.md#protected-outcomes` | Kernel `NotIndependent` with runtime identity; claim hold; claim payload | E-001, E-002, E-008, E-009 | Merge after owner signature on `kernel/src/transition.rs` | pass |
| C-004 | Acceptance needs a pre-check, and a non-pass pre-check needs a written reason. | `basis.md#protected-outcomes` | Kernel `MissingPreCheck`, `ReasonRequired` | E-001 | Merge after owner signature | pass |
| C-005 | People and the daemon cannot use each other's routes, and nothing acts without a session. | `basis.md#protected-outcomes` | Route guards | E-002 | Merge | pass |
| C-006 | The event log is hash-chained and refuses update and delete. | `basis.md#protected-outcomes` | Chain and trigger | E-002 | Merge | pass |
| C-007 | Unknown fields are refused, and dependencies gate claims. | `basis.md#derived-requirements-or-claims` | Generated schemas; dependency check | E-002 | Merge | pass |
| C-008 | A return creates a new revision with the direction in the brief, and a revise loop carries findings. | `basis.md#derived-requirements-or-claims` | `work.ts` | E-002 | Merge | pass |
| C-009 | A full site job runs in a browser with real tools and live public data to five accepted packages and a passing plan check. | `basis.md#protected-outcomes` | `cr-site`, site roles, scripted agents | E-005 | Merge | pass |
| C-010 | The site tools compute from recorded inputs and pass their tests on a fresh checkout. | `basis.md#protected-outcomes` | `cr-site` | E-004 | Fixed in `3f640a1`: registry committed, ignore rule narrowed | pass |
| C-011 | Shipped dependencies use permissive licenses. | ADR 0002 | License gate with `Unlicense` added | E-006 | Merge after owner signature on the gate | pass |
| C-012 | Real Claude Code and Codex runs follow the same floors. | `basis.md#assumptions-constraints-and-invalidation-triggers` | Same runner path | none yet | Do not claim | planned |
| C-013 | The daemon claims eligible jobs, runs the role's runtime in a workspace and reports the trace; the fake runtime runs only with `CONTROLROD_ALLOW_FAKE=1`. | `basis.md#derived-requirements-or-claims` | `daemon/internal/runner` | E-003 | Merge | pass |
| C-014 | The web app lets the owner sign in, capture, review packages and decide with a passkey. | `basis.md#derived-requirements-or-claims` | `apps/web` | E-007, E-005 | Merge with UI gaps listed | pass |
| C-015 | Codex runs start with a workspace-write sandbox and no repository check; network only for author runs of roles that ask. | `basis.md#derived-requirements-or-claims` | `CodexArgs`; `network: on` directive | E-010, E-009 | Merge; trust Codex only after one real author and pre-check on the Mac | pass by test; real run planned |
| C-016 | Claim token and lease; lapsed lease marks the run lost; owner-only requeue. | `basis.md#protected-outcomes` | `startRun`, `runLog`, `sweepLost`, `requeueRun`; daemon heartbeat | E-009, E-010, E-011 | Merge | pass |
| C-017 | Idempotent completion with a stored receipt; stale or foreign token refused; refusals recorded as failed runs; invalid trace refused with a reason; daemon outbox with backoff. | `basis.md#protected-outcomes` | `complete`, `recordRefused`; daemon `Outbox` | E-009, E-010 | Merge | pass |
| C-018 | An author run with no output fails with a reason and never advances the package. | `basis.md#protected-outcomes` | `applyCompletion` | E-009 | Merge | pass |
| C-019 | A pre-check that could only share the author's provider is held; same provider is the same runtime whatever the models; the owner may proceed only with a passkey-signed override with a reason, recorded and shown on the verification record. | `basis.md#protected-outcomes` | `pickChecker`; kernel `OverrideIndependence`, `owner_override_verified`; override routes; `independence` block | E-008, E-009, E-011, E-012, E-013, E-015 | Merge after owner signature on `kernel/src/transition.rs` | pass |
| C-020 | The owner can stop a run; recorded first; shown as stopping until the daemon confirms; repeating is harmless. | `basis.md#protected-outcomes` | `stopRun`; daemon stop handling | E-009, E-010, E-011 | Merge | pass |
| C-021 | Outputs are re-hashed when served; a mismatch is refused and logged. | `basis.md#protected-outcomes` | `packageOutput` | E-009 | Merge | pass |
| C-022 | Cookie-authenticated state changes need a same-origin mark; runner routes use the token. | `basis.md#protected-outcomes` | `onRequest` hook | E-009 | Merge | pass |
| C-023 | The trace records runtime mode, requested and reported model, tools and sandbox; model mismatch raises an event; ADR 0020. | `basis.md#protected-outcomes` | `LaunchFor`, `ReportedModel`, `modelMismatch` | E-009, E-010 | Merge | pass |
| C-024 | Runtimes are probed before they are offered; only ready ones are picked; the office shows the rest. | `basis.md#protected-outcomes` | `Probe`; `recordRuntimeStatus`; office notice | E-013, E-014, E-015 | Merge; check the real Codex CLI on the Mac | pass by test |
| C-025 | One live run per package revision, role and round, enforced by the database. | `basis.md#protected-outcomes` | `runs_one_live` index; conflict-safe `queueRun` | E-013 | Merge | pass |

## Evidence chain

```text
Risk: agents author and check engineering work; a self-approved or rewritten package would mislead.
  -> Basis: human passkey decisions bound to a digest, independent pre-check, append-only record, tool-computed numbers.
  -> Control: kernel floors through one binding (including runtime identity for the pre-check); route guards and a same-origin check; signed challenges; hash chain with trigger; run custody (claim token, lease, sweep, idempotent completion, outbox); cr-site tools.
  -> Verification: kernel, control plane, daemon, web and site pack suites; a live browser run with a virtual passkey.
  -> Ship: merge after the owner signs the kernel and license gate edits.
```

## Open trace gaps

| Gap | Why it matters | Disposition |
|---|---|---|
| County registry ignored by `.gitignore` and not committed | One parcel test fails on a fresh checkout, and `parcel resolve` by ID raises an error where it should refuse cleanly. | Done in `3f640a1`: ignore rule narrowed, file committed, suite passes. |
| No real agent runtime run | Scripted agents may hide prompt or tool issues. | First run on the owner's Mac. |
| Codex flags checked by reading `codex exec --help`, not by a real run | The owner's own Codex configuration could change sandbox or network behavior. | One real Codex author and pre-check on the Mac before trusting Codex. |
| Kernel runtime-identity rule edited in `kernel/src/transition.rs` | A trust surface changed in an unsigned PR. | Owner signs the final version before merge. |
| Codex 0.163.0 was not installed where the probe was built | Whether it offers `codex login status` was not checked; the probe reads `codex login --help` at run time and reports `login_checked: false` when it cannot tell. | Check `pnpm cr doctor` and the office on the Mac. |
| Fake-only end-to-end runs now hold every pre-check | The scripted run needs the owner override (or a second runtime) at each pre-check. | Accepted: no silent fallback, even for the fake runtime. |
| Site pack and end-to-end not in CI | Regressions could land unseen. | CI jobs need the owner's signature on `.github/workflows`. |
| Live run script not committed | The browser run cannot be repeated from the tree. | Commit it with the CI work. |

## Required links

- `basis.md`, `verification.md`, `ship.md`

## Exit criteria

- Every claim has a status.
- Planned and failing claims are not used as merge evidence until they pass.

## Source-lineage note

Trace structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
