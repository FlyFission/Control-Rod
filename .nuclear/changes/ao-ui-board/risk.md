# Quick Risk: AO Slice 5 — `apps/web/DESIGN.md` & Board UX Polish

## Selected mode

- **Mode:** Quick
- **Why this mode:** Documentation (`apps/web/DESIGN.md`) and reversible, strictly client-side board UX polish (`apps/web/src/features/board/`). No trust surface (`.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`), API contract, or custody/acceptance rule is altered.

---

## Change

- Slug: `ao-ui-board`
- Branch: `feat/ao-s5-ui-board`
- Owner: Ben Huffer (decision owner); implemented by subagent under Slice 5 task instructions
- Date: 2026-11-22
- Summary: Add clean-room `apps/web/DESIGN.md` encoding Control Rod's UI invariants (Looks A/B/C, WCAG 2.2 AA 4.5:1 floor, `--fs-chip: 11px` floor, symbol+word meaning tokens, 6-column custody pipeline, Office Worlds, zero-fabrication copy, AO reference boundary, shared-list vs card border discipline, interaction lifecycle, compositor-only looping animation, truthful `statusReadiness` spinner rules, and `Blocker / Must fix / Follow-up migration` QA rubric), plus board UX upgrades (`sortLaneCards` attention-first sorting, `useDeferredValue` board search with scoped `Cmd/Ctrl+F` yielding to `BOARD_FIND_YIELDS_TO`, truthful `shouldSpinStatus(readiness, isActive)`, and keyboard-reachable secondary card actions without title shift).

## Scope

- Affected files: 9 paths.
  - `apps/web/DESIGN.md` (new)
  - `apps/web/src/features/board/boardPolish.ts` (new)
  - `apps/web/src/features/board/boardPolish` wired into `BoardView.tsx`, `Card.tsx`, `useBoardData.ts`, `board.css`
  - `apps/web/src/features/board/board-polish.test.tsx` (new)
  - `.nuclear/changes/ao-ui-board/risk.md` (new)
  - `.nuclear/changes/ao-ui-board/proof.md` (new)
- Controlled / protected surfaces untouched: `.github/workflows/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/`, `docs/adr/`.
- User-visible behavior changed? yes (board attention-first column ordering, deferred search box + scoped `Cmd/Ctrl+F`, active-only status spinner).
- Dependency/model/API/prompt/tool permission changed? no.
- Release or rollback posture changed? no.

## Quick-mode screen

| Question | Answer |
|---|---|
| Consequence if wrong | Board search/sorting or spinner visual cue could misorder cards, hijack a field shortcut, or fail contrast/type-scale checks. Kernel decisions, passkey signing, Ruling 16, and O6 blocking remain unchanged. |
| Reversibility | Instant: revert commit on `feat/ao-s5-ui-board`. |
| Detectability | High: automated Vitest suites (`contrast.test.ts`, `looks-contrast.test.ts`, `type-scale.test.ts`, `board.test.tsx`, `board-polish.test.tsx`) and TypeScript `tsc --noEmit` check all invariants directly. |
| Exposure | Board UI (`apps/web/src/features/board/`) and developer design doc (`apps/web/DESIGN.md`). |
| Uncertainty | Low: pure helper logic and CSS tokens verified deterministically; Playwright browser axe run across Looks A/B/C was not executed in this slice and remains open for full browser verification. |
| Why Quick is enough | Pure UI polish and design specification inside `apps/web/`, with no trust-surface, schema, API, or authorization changes. |

## Required proof

- Commands to run: four checks.
  - `pnpm --filter @control-rod/web typecheck`
  - `pnpm --filter @control-rod/web test` (including `contrast.test.ts`, `looks-contrast.test.ts`, `type-scale.test.ts`, `board.test.tsx`, `board-polish.test.tsx`, `quick-add.test.tsx`, `move.test.tsx`, `LensBar.test.tsx`, and `office/contract.test.ts`)
  - `python3 tools/check_originality.py`
  - `git diff origin/main -- .github/workflows/ policies/ tests/redteam/ spec/ kernel/ docs/adr/`
- Expected result: typecheck exits 0, all Vitest files/tests pass with no contrast or type-scale regressions, originality check passes, and trust-surface diff is empty.
- Evidence link: [`proof.md`](proof.md).

## Critical-action self-check

- Exact target: `apps/web/DESIGN.md`, `apps/web/src/features/board/*`, `.nuclear/changes/ao-ui-board/*`.
- Expected result: no modifications outside `apps/web/` and `.nuclear/changes/ao-ui-board/`.
- Stop condition: any edit to a trust surface, any contrast below 4.5:1, any font-size below 11px or un-tokenized below 14px, or any spinner shown for `held`/`settled`/`unknown`.

## Escalation check

Move up to Standard if any acceptance/signing rule, API route, schema, or trust surface is modified. None is modified here.

## Exit criteria

- `apps/web/DESIGN.md` captures all Control Rod visual/interaction invariants and AO clean-room rules.
- `sortLaneCards`, `useDeferredValue` + scoped `Cmd/Ctrl+F` (`BOARD_FIND_YIELDS_TO`), `shouldSpinStatus(readiness, isActive)`, and stable secondary card actions are implemented and tested.
- `typecheck` and full `apps/web` Vitest suite pass after final edits.

## Required links

- [Proof](proof.md)
- [Design spec](../../../apps/web/DESIGN.md)

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
