# Basis: audit export for a time window

**Change slug:** `audit-window-export`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether the time-window audit export, its `spec/` contract and its offline check are accepted.

## Mission / need

The owner asked for Control Rod to be "auditable" (2026-11-21). The first step (`offline-proof-verify`) lets an auditor check one package's proof offline. Sampling a period still meant asking for packages one at a time. This export gives an auditor everything recorded in a window, in the same self-checking form.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Build the audit export for a time window as the next auditability step. | "Audit export for a time window" | 2026-11-21, Claude project thread, option chosen on the card "Which auditability step should come after offline proof checks?" at 12:46 PM ET | Build it on this branch, including the new `spec/` operation the card named. | Merging the `spec/` change: that needs the owner's recorded yes on the pull request as it stands. QA overlays in `policies/`. |
| D2 | Windows are half open and placed by each event's recorded time; the export reuses the package proof's seal and segment rules. | none: authoring agent's choice, open to the owner | 2026-11-21, this record | One rule for both kinds of bundle, so one offline check. | A window by sequence number, or across organizations. |

## Scope

In scope: `spec/api.tsp` (operation `recordsExport`) and its regenerated outputs; `services/api/src/seals.ts` (`windowExport`, `verifyWindow`, and the package-proof code split into shared helpers); `services/api/src/app.ts` (route); `services/api/src/verify-bundle.ts`; the Records page export form and its client type; tests; `docs/auditing.md`, `docs/qa-standards.md`, `docs/status.md`. Out of scope: kernel, policies, workflows, red-team fixtures, the chain and seal formats.

## Fixed inputs

The inclusion proof rules in `services/api/src/seals.ts` on `main`; `offline-proof-verify` on this branch; AGENTS.md rules 1 to 6.

## Sources

1. `services/api/src/seals.ts`, `services/api/src/events.ts`, `services/api/test/seals.test.ts`, `apps/web/src/pages/Records.tsx` at `7bb72ae`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Each event's `at` is set by the control plane when it is appended and is covered by its digest. | `appendEvent` and `eventDigest` in `events.ts`. | `at` leaves the digest or comes from a client. |
| One organization per chain. | `refuseMixedScope`, shared with package proofs. | Per-organization chains arrive. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`GET /records/export?from&to` returns every event recorded in a half-open time window inside the chain from its first event, under the first valid seal covering the window's last event, checkable offline by `pnpm cr verify` through `verifyWindow`; the Records page exports and downloads it; package proofs behave as before; tests cover it; CI is green; the owner's recorded yes covers the `spec/` change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
