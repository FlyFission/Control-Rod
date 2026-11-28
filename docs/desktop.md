# Control Rod Desktop App

Control Rod ships an Electron desktop shell (`apps/desktop/`) around the existing `controlrod` launcher (`scripts/cr.mjs`) and local control plane (`services/api/` + embedded PostgreSQL + Go run daemon), keeping the CLI (`controlrod start` / `pnpm cr start`) working unchanged.

## Why Electron (and which pattern we followed)

- **Studied:** `BloopAI/vibe-kanban` (Apache-2.0, Tauri v2) and `anomalyco/opencode` (MIT, migrated from Tauri to Electron with `electron-builder`), plus Tauri v2 sidecar docs and `sindresorhus/fix-path` (MIT) for macOS GUI `PATH` resolution.
- **Why Electron fits Control Rod's stack:**
  - `vibe-kanban` uses Tauri because its backend server (`crates/server`) is written in Rust and linked in-process.
  - Control Rod's launcher (`scripts/cr.mjs`) and control plane (`services/api/dist/server.js` + `embedded-postgres`) are Node.js 22 ESM. Tauri has no Node runtime, so a double-click Tauri `.dmg` would still need a bundled Node sidecar per platform (~90 MB) plus Rust/WebKitGTK workspace isolation from `Cargo.toml`'s strict lints (`unsafe_code = "forbid"`, `deny.toml`).
  - Electron embeds Node 22 (`ELECTRON_RUN_AS_NODE=1`), lets `apps/desktop/` import `scripts/lib/instance.mjs` directly with zero duplication of lockfile or PostgreSQL cleanup logic, and follows `anomalyco/opencode`'s proven TypeScript/Electron packaging layout.

## Lifecycle & macOS GUI `PATH`

- **Single instance & reuse:** `app.requestSingleInstanceLock()` focuses the existing window on a second launch. Before spawning anything, `DesktopLifecycle` calls `findRunning()` from `scripts/lib/instance.mjs` and reuses any Control Rod already started from a terminal (leaving it running when the desktop window quits).
- **Agent CLI discovery:** `apps/desktop/src/main/shell-env.ts` probes the user's login shell (`$SHELL -ilc`) with a bounded timeout and merges common CLI paths (`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/share/mise/shims`) so `claude`, `codex`, `agy`, `grok`, and `opencode` work with the user's own sign-ins even when launched from Finder/Dock.
- **Clean shutdown:** Quitting an owned instance calls `stopLauncher()` from `scripts/lib/instance.mjs`, draining the Go daemon first and then stopping the API and embedded PostgreSQL cleanly, with `freeOrphanedSegments()` as a macOS System V shared-memory safety net.
- **Native notifications:** `apps/web/src/lib/useAttentionSignals.ts` routes "needs you" arrivals through `window.controlrodDesktop.notify(...)` when running in the desktop app, focusing the window and opening `/inbox` on click.

## Building locally (macOS)

```sh
pnpm install --frozen-lockfile
node scripts/build-desktop.mjs
```

The unsigned `.dmg` is written to `apps/desktop/release/`. Use `node scripts/build-desktop.mjs --stage-only` on Linux or macOS to verify runtime staging without running `electron-builder`.

## Documented follow-ups

1. **Apple Developer code signing & notarization:** remove `mac.identity: null` in `apps/desktop/electron-builder.config.mjs`, enable `hardenedRuntime: true`, add entitlements plists, and configure `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` in release CI.
2. **macOS in-app passkey entitlements:** once code-signed, evaluate Apple's AuthenticationServices/WebAuthn entitlements for in-window Touch ID passkeys; until then, **Control Rod -> Open in Browser** (`Cmd+Shift+O`) opens the same local instance in Safari/Chrome.
3. **Windows & Linux installers:** `win.target` (`nsis`) and `linux.target` (`AppImage`, `deb`) are already stubbed in `apps/desktop/electron-builder.config.mjs`; add platform runners to the packaging workflow and stage the corresponding `@embedded-postgres` and Go daemon binaries.
4. **Auto-update:** wire `electron-updater` and `publish: [{ provider: "github" }]` once signed releases are published.
