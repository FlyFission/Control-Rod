# Quick Proof: AO Slice 5 — `apps/web/DESIGN.md` & Board UX Polish

## Proof summary

- Change slug: `ao-ui-board`
- Proof owner: Ben Huffer (review pending); verified locally by implementing subagent
- Date/time: 2026-11-22
- Risk record: [`risk.md`](risk.md)

## Claim proven

Claim: `apps/web/DESIGN.md` encodes Control Rod's UI invariants and clean-room rules without touching any trust surface; `sortLaneCards`, `useDeferredValue` search with scoped `Cmd/Ctrl+F` (`BOARD_FIND_YIELDS_TO`), truthful `shouldSpinStatus(readiness, isActive)`, and keyboard-reachable secondary card actions without title shift work as specified and preserve all WCAG 2.2 AA contrast, `--fs-chip: 11px` type-scale, 6-column board, and Office Worlds contracts.

## Method

- Commands executed after final code/CSS/test edits: six checks.
  1. `pnpm --filter @control-rod/web typecheck` (`pnpm gen:api && tsc -p tsconfig.json --noEmit`)
  2. `pnpm --filter @control-rod/web test` (`pnpm gen:api && vitest run`)
  3. `pnpm --filter @control-rod/web check:themes` (`python3 ../../tools/check_theme_assets.py --root ../..`)
  4. `pnpm --filter @control-rod/web check:office` (`vitest run src/features/office/contract.test.ts`)
  5. `git diff origin/main -- .github/workflows/ policies/ tests/redteam/ spec/ kernel/ docs/adr/`
  6. `python3 tools/check_originality.py` (run after staging new tracked files)
- Environment: Linux, worktree `/home/flyfission/worktrees/cr-ao-s5-ui-board`, branch `feat/ao-s5-ui-board`, Vitest 5.1.0, TypeScript 5.9.3, pnpm 10.28.0.
- Self-check used? yes; verified scope against `risk.md` and empty diff on all trust surfaces.
- Reproducible by reviewer? yes; rerun the commands listed above in `apps/web/` and repo root.
- Residual actor-evidence coupling accepted for this Quick change: the same subagent wrote the code, tests, and proof record; maintainer review is the independent check.

## Result

- Status: **pass** (local Vitest, TypeScript, theme asset, and office contract checks; browser Playwright axe scan not executed in this slice).
- Observed results: all checks passed.
  - `pnpm --filter @control-rod/web typecheck`: exited `0` (`tsc -p tsconfig.json --noEmit`).
  - `pnpm --filter @control-rod/web test`: `53` test files passed (`53`), `708` tests passed (`708`), including:
    - `src/design/contrast.test.ts`: `10` passed (WCAG AA 4.5:1 across stylesheets and AAA 7:1 reading colors; `RECORDED_EXCEPTIONS` unchanged)
    - `src/design/looks-contrast.test.ts`: `188` passed (Looks A, B, and C token contrast)
    - `src/design/type-scale.test.ts`: `5` passed (`--fs-chip: 11px` floor and token usage across `board.css`)
    - `src/features/board/board.test.tsx`: `49` passed
    - `src/features/board/board-polish.test.tsx`: `9` passed (covering `sortLaneCards`, `BOARD_FIND_YIELDS_TO` / `shouldYieldBoardFind` + scoped `Cmd/Ctrl+F` + deferred search filtering, `shouldSpinStatus` + `cardStatusReadiness` truthfulness, and keyboard-reachable secondary card actions below `.bd-title`)
    - `src/features/board/LensBar.test.tsx`: `7` passed
    - `src/features/board/quick-add.test.tsx`: `15` passed
    - `src/features/board/move.test.tsx`: `12` passed
  - `pnpm --filter @control-rod/web check:themes`: exited `0` (`PASS: 15 complete passive-art packs; thumbnails 290018 bytes.`).
  - `pnpm --filter @control-rod/web check:office`: `1` file, `40` tests passed.
  - Trust-surface diff (`git diff origin/main -- .github/workflows/ policies/ tests/redteam/ spec/ kernel/ docs/adr/`): empty.

### Gaps

- Playwright browser axe-core run (`apps/web/e2e/board-looks.spec.ts`) was not executed in this slice and remains open for browser-level verification across Looks A/B/C.
- No human independent review has been performed yet.

## Reviewer note

- Reviewer: Ben Huffer (pending on PR)
- Is Quick mode still valid after proof? yes; only `apps/web/` board UI, `apps/web/DESIGN.md`, and `.nuclear/changes/ao-ui-board/` were added or modified.

## Required links

- [Risk](risk.md)
- [Design spec](../../../apps/web/DESIGN.md)
- Changed implementation & test files: 6 files.
  - [`apps/web/src/features/board/boardPolish.ts`](../../../apps/web/src/features/board/boardPolish.ts)
  - [`apps/web/src/features/board/BoardView.tsx`](../../../apps/web/src/features/board/BoardView.tsx)
  - [`apps/web/src/features/board/Card.tsx`](../../../apps/web/src/features/board/Card.tsx)
  - [`apps/web/src/features/board/useBoardData.ts`](../../../apps/web/src/features/board/useBoardData.ts)
  - [`apps/web/src/features/board/board.css`](../../../apps/web/src/features/board/board.css)
  - [`apps/web/src/features/board/board-polish.test.tsx`](../../../apps/web/src/features/board/board-polish.test.tsx)

## Exit criteria

- The evidence matches the claim in `risk.md` directly.
- The actual result is compared to the expected result named before the proof.
- The result status is stated plainly.
- Any failure or gap has a next action or an escalation.
- The reviewer can decide whether the Quick change is acceptable without reading unrelated docs.

## Source-lineage note

Original Nuclear-grade template inspired by public ideas on software test documentation, verification, work records, and keeping the approved version under control, mapped in `docs/00-standards-foundation/source-map.md` and `docs/01-field-guide/source-to-concept-crosswalk.md`. No compliance claim is made.
