# Plan: Desktop app shell for Control Rod

1. Study open-source agent desktop shells (`BloopAI/vibe-kanban` Apache-2.0, `anomalyco/opencode` MIT, Tauri sidecar docs, Electron process/PATH patterns) and record the Electron choice in `basis.md`.
2. Add minimal packaged-mode hooks in `scripts/cr.mjs` (`process.execPath` for API spawn, `CONTROLROD_PACKAGED=1`, `CONTROLROD_DAEMON_BIN`) while keeping CLI behavior identical.
3. Build `apps/desktop/`:
   - `src/main/shell-env.ts` for macOS/Linux login-shell PATH resolution so GUI-launched agent CLIs are found with user sign-ins.
   - `src/main/lifecycle.ts` reusing `scripts/lib/instance.mjs` for start, healthy polling, clean shutdown, orphan/Postgres shm safety, and second-launch reuse.
   - `src/main/notifications.ts` for native OS notifications with click-to-focus.
   - `src/main/index.ts` and `src/preload/index.ts` for the Electron window, single-instance lock, Dock icon, menus, and IPC.
   - `renderer/loading.html` for the calm ISA-101 loading screen and plain-word error screen with one primary action and collapsed details.
   - `assets/` Dock icon set derived from Control Rod's three-bar `BrandMark` SVG.
   - `electron-builder.config.mjs` targeting unsigned macOS `.dmg`, with Windows/Linux, signing, notarization, and auto-update stubbed.
4. Wire `apps/web/src/lib/useAttentionSignals.ts` to `window.controlrodDesktop?.notify` when present, falling back to browser `Notification`.
5. Add `scripts/build-desktop.mjs` to build web/api/daemon/desktop, stage the runtime, and build the `.dmg`.
6. Add tests in `apps/desktop/test/` covering shell PATH resolution, start, healthy, quit, second-launch reuse, foreign port conflict, and native notifications, plus a web test for the desktop notification bridge.
7. Add "Download the app" to `README.md` next to "Install the full workspace".
8. Capture screenshots of the loading screen, error screen, and live app window.
9. Run full workspace typecheck, tests, license gate, public claims check, and change-record checks.
10. Request sole-maintainer sign-off before adding `.github/workflows/desktop-dmg.yml` (trust surface), then open PR against `main`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`apps/desktop` builds, typechecks, and passes unit and integration tests for start, healthy, quit (no orphan processes / clean shutdown), second-launch reuse, login-shell PATH resolution for agent CLIs, and native notifications. `scripts/build-desktop.mjs` stages the runtime and drives `electron-builder` for unsigned macOS `.dmg`. Existing workspace tests and repo gates remain green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
