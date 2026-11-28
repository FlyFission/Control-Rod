# Trace: Desktop app shell for Control Rod

| Need | Code | Test |
| --- | --- | --- |
| Reuse existing `controlrod` launcher and instance management | `scripts/cr.mjs`, `apps/desktop/src/main/lifecycle.ts` | `apps/desktop/test/lifecycle.test.ts`, `scripts/test/controlrod-cli.test.mjs` |
| Calm loading screen and plain-word error screen | `apps/desktop/renderer/loading.html`, `apps/desktop/src/main/index.ts` | `apps/desktop/test/lifecycle.test.ts`, rendered screenshots |
| Clean quit with no orphan processes or leaked Postgres shm | `apps/desktop/src/main/lifecycle.ts`, `apps/desktop/src/main/index.ts` | `apps/desktop/test/lifecycle.test.ts` ("stops owned services cleanly on quit") |
| Reuse already-running instance / single-instance second launch | `apps/desktop/src/main/lifecycle.ts`, `apps/desktop/src/main/index.ts` | `apps/desktop/test/lifecycle.test.ts` ("reuses an already-running instance without starting a second one") |
| macOS GUI login-shell PATH for agent CLIs | `apps/desktop/src/main/shell-env.ts` | `apps/desktop/test/shell-env.test.ts` |
| Dock icon, app name "Control Rod", native "needs you" notifications | `apps/desktop/assets/`, `apps/desktop/src/main/notifications.ts`, `apps/desktop/src/preload/index.ts`, `apps/web/src/lib/useAttentionSignals.ts` | `apps/desktop/test/notifications.test.ts`, `apps/web/src/lib/useAttentionSignals.test.tsx` |
| Build script and unsigned `.dmg` packaging config | `scripts/build-desktop.mjs`, `apps/desktop/electron-builder.config.mjs` | `apps/desktop/test/packaging.test.ts` |
| README "Download the app" section | `README.md` | `tools/check_public_claims.py` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`apps/desktop` builds, typechecks, and passes unit and integration tests for start, healthy, quit (no orphan processes / clean shutdown), second-launch reuse, login-shell PATH resolution for agent CLIs, and native notifications. `scripts/build-desktop.mjs` stages the runtime and drives `electron-builder` for unsigned macOS `.dmg`. Existing workspace tests and repo gates remain green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
