# Quick Risk: Web board progressive deliverable disclosure, honest model reroute presenter, and offline asset URL guard

## Selected mode

- **Mode:** Quick
- **Why this mode:** Self-contained TypeScript presenter and URL-guard module in `apps/web/src/features/board/boardDisclosure.ts` with comprehensive Vitest unit tests in `apps/web/src/features/board/board-disclosure.test.ts`, touching zero CODEOWNERS-protected trust surfaces (`.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`) and introducing no external dependencies.

---

## Change

- Slug: ao-web-artifacts-reroute
- PR / issue: Slice 8 on branch `feat/ao-s8-web-artifacts-reroute` (`#124`, `#133`, `M5`–`M7`, `AO-15`, `AO-16`, `AO #8785`)
- Owner: Ben Huffer (decision owner); implemented by subagent for Slice 8
- Date: 2026-11-22
- Summary: four pure web board disclosure, telemetry, routing, and offline-asset guard primitives with unit tests.
  - Add `partitionDeliverables` and `isRedundantBranchLabel` in `apps/web/src/features/board/boardDisclosure.ts` implementing progressive deliverable disclosure (`AO-15`: default inline cap 2, click-to-expand cap 10, overflow count routed to the review drawer/inspector) and duplicate branch/ref label suppression.
  - Add `presentUsageMetric` in `apps/web/src/features/board/boardDisclosure.ts` implementing accessible compact usage telemetry (`AO-15`: omits idle `0%` CPU noise, pairs compact tabular token labels with full `sr-only` copy or `null` when unreported, and enforces `"Cost not reported"` zero-fabrication copy instead of `"$0.00"`).
  - Add `presentModelRouting` in `apps/web/src/features/board/boardDisclosure.ts` implementing honest model reroute disclosure (`AO-16`: `"Answered by <actualModel> (requested <requestedModel>)"`) and preserving unsupported runtime capabilities as `disabled: true` with an explicit non-empty `inlineReason`.
  - Add `isAllowedAssetOrigin` in `apps/web/src/features/board/boardDisclosure.ts` enforcing the zero-third-party-network URL guard (`#133`, `AO #8785`) that permits relative paths, `data:`/`blob:`, `currentOrigin`, `http://localhost` / `http://127.0.0.1`, and explicitly configured origins while blocking unconfigured third-party tile/font/CDN origins by default.

## Scope

- Affected files/configs/docs: 4 paths.
  - `apps/web/src/features/board/boardDisclosure.ts` (new)
  - `apps/web/src/features/board/board-disclosure.test.ts` (new)
  - `.nuclear/changes/ao-web-artifacts-reroute/risk.md` (new)
  - `.nuclear/changes/ao-web-artifacts-reroute/proof.md` (new)
- Controlled items touched: Web board feature module (`apps/web/src/features/board/`).
  - Not touched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes/no: no (adds pure presenter and URL-guard functions ready for board card and drawer consumption without conflicting with Slice 5 files).
- Dependency/model/API/prompt/tool permission changed? yes/no: no.
- Release or rollback posture changed? yes/no: no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | A board deliverable partition, usage metric label, model reroute badge, or asset URL origin check returns an inaccurate value in unit tests. |
| Reversibility | Instant: revert the commit on `feat/ao-s8-web-artifacts-reroute`. |
| Detectability | High: 17 deterministic Vitest unit tests in `board-disclosure.test.ts` and `tsc --noEmit` verify every function and edge case. |
| Exposure | Web UI board feature helpers (`apps/web/src/features/board/boardDisclosure.ts`). |
| Uncertainty | Low: pure TypeScript functions using standard `URL` parsing with zero external dependencies. |
| Why Quick is enough | No CODEOWNERS trust surface (`spec/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`, `docs/adr/`), external dependency, or public assurance claim is modified. |

## Required proof

- Command/check/eval to run: six checks.
  - `pnpm --filter @control-rod/web typecheck`
  - `pnpm --filter @control-rod/web exec vitest run src/features/board/board-disclosure.test.ts`
  - `python3 tools/check_originality.py` (with all files staged)
  - `python3 tools/check_public_claims.py`
  - `git diff --cached --check`
  - `python3 /home/flyfission/projects/Nuclear-grade/tools/ng.py validate .nuclear/changes/ao-web-artifacts-reroute/`
- Expected result: one per check.
  - `@control-rod/web typecheck` (`tsc -p tsconfig.json --noEmit`) succeeds (exit 0);
  - All 17 Vitest tests in `board-disclosure.test.ts` pass (exit 0);
  - `originality check passed` (exit 0);
  - `public claims check passed` (exit 0);
  - `git diff --cached --check` produces empty output (exit 0);
  - `OK: .nuclear/changes/ao-web-artifacts-reroute` (exit 0).
- Evidence link/location: `proof.md`.

## Critical-action self-check

- Exact target: the 4 paths listed in Scope.
- Expected result: `git status` shows only those 4 paths and zero modifications under `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, or `docs/adr/`.
- Stop condition: any edit outside Scope, any TypeScript or Vitest failure, or any originality / public-claims / `ng.py validate` failure.

## Escalation check

Move up to Standard if this change modifies `/spec/`, `/kernel/`, `/policies/`, `/tests/redteam/`, `.github/workflows/`, or `docs/adr/`. None of these is in this change.

## Exit criteria

- Every path this change touches is named in Scope and none is a CODEOWNERS-gated trust surface.
- TypeScript typecheck, Vitest unit tests, `check_originality.py`, `check_public_claims.py`, `git diff --cached --check`, and `ng.py validate` pass and are recorded in `proof.md`.

## Required links

[Proof](proof.md), [boardDisclosure.ts](../../../apps/web/src/features/board/boardDisclosure.ts), [board-disclosure.test.ts](../../../apps/web/src/features/board/board-disclosure.test.ts).

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
