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
- **Requirements cross-reference:** `basis.md#derived-requirements-or-claims`, C-001 to C-014

## Trace summary

| ID | Claim | Basis link | Control / design feature | Verification evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | Only a human with a verified passkey over the matching subject digest can release, accept, return or reject. | `basis.md#protected-outcomes` | Kernel decision rules; signed challenge | E-001, E-002 | Merge after owner signature on kernel edits | pass |
| C-002 | Agents can only claim, submit output, submit a pre-check or revise. | `basis.md#protected-outcomes` | Kernel transition table | E-001 | Merge after owner signature | pass |
| C-003 | The pre-checker runs on a different baseline and never receives the author's log. | `basis.md#protected-outcomes` | Kernel `NotIndependent`; claim payload | E-001, E-002 | Merge after owner signature | pass |
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

## Evidence chain

```text
Risk: agents author and check engineering work; a self-approved or rewritten package would mislead.
  -> Basis: human passkey decisions bound to a digest, independent pre-check, append-only record, tool-computed numbers.
  -> Control: kernel floors through one binding; route guards; signed challenges; hash chain with trigger; cr-site tools.
  -> Verification: kernel, control plane, daemon, web and site pack suites; a live browser run with a virtual passkey.
  -> Ship: merge after the owner signs the kernel and license gate edits.
```

## Open trace gaps

| Gap | Why it matters | Disposition |
|---|---|---|
| County registry ignored by `.gitignore` and not committed | One parcel test fails on a fresh checkout, and `parcel resolve` by ID raises an error where it should refuse cleanly. | Done in `3f640a1`: ignore rule narrowed, file committed, suite passes. |
| No real agent runtime run | Scripted agents may hide prompt or tool issues. | First run on the owner's Mac. |
| Site pack and end-to-end not in CI | Regressions could land unseen. | CI jobs need the owner's signature on `.github/workflows`. |
| Live run script not committed | The browser run cannot be repeated from the tree. | Commit it with the CI work. |

## Required links

- `basis.md`, `verification.md`, `ship.md`

## Exit criteria

- Every claim has a status.
- Planned and failing claims are not used as merge evidence until they pass.

## Source-lineage note

Trace structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
