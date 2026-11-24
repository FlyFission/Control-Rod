# Verification: Interactive workflow block flow editor & swim-lane packs

**Change slug:** `workflow-flow-editor`

## Checks run

- `pnpm check:workflow-packs` — PASS (`packs/workflows` digest/pin check clean).
- `pnpm --filter @control-rod/api typecheck` — PASS (0 errors).
- `pnpm --filter @control-rod/api build` — PASS.
- `pnpm --filter @control-rod/api exec vitest run test/workflow.test.ts test/workflow-spec.test.ts test/migration-lock.test.ts` — PASS (3 files, 47/47 tests passed).
- `pnpm --filter @control-rod/web build` (`check:themes`, `check:office`, `gen:api`, `tsc --noEmit`, `vite build`) — PASS (15 passive-art packs, 41/41 office contract tests, 0 TS errors).
- `pnpm --filter @control-rod/web exec vitest run src/lib/workflowSpec.test.ts src/components/workflow-editor.test.tsx src/components/workflow-diagram.test.tsx src/lib/councilFlow.test.ts src/lib/workflow.test.ts src/features/board/board.test.tsx src/session-gate.test.tsx src/design/contrast.test.ts src/design/type-scale.test.ts src/pages/setup.test.tsx` — PASS (10 files, 151/151 tests passed).
- Trust-surface verification: `git diff --name-only main` touches zero files under `spec/`, `policies/`, `tests/redteam/`, `.github/`, `kernel/`, or `docs/adr/`.
- Note on blind check: Standalone `codex` CLI binary is not installed in this devbox VM; an independent blind review subagent audited the diff and verified fixes across all 5 review categories.
