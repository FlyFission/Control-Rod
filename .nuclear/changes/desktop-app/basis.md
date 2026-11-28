# Basis: Desktop app shell for Control Rod

**Change slug:** `desktop-app`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** In progress.

## Mission / need

Today Control Rod starts from a terminal via `controlrod start` (or `pnpm cr start`), which launches the local control plane (with embedded PostgreSQL), the Go run daemon, and opens the web UI in a browser at `http://localhost:7300`. Many users want a double-click desktop app ("Control Rod") with a Dock icon, calm loading screen, native "a card needs you" notifications, clean shutdown on quit, and reuse of an already-running instance—while keeping the CLI path working unchanged and keeping all local agent CLIs (Claude Code, Codex, Antigravity, Grok, OpenCode) discoverable with the user's own sign-ins even when launched from Finder/Dock without a terminal shell PATH.

## Proposal

1. **Pattern chosen (Electron, patterned on `anomalyco/opencode` MIT and `sindresorhus/fix-path` MIT; compared against `BloopAI/vibe-kanban` Apache-2.0):**
   - `BloopAI/vibe-kanban` (Apache-2.0) uses Tauri v2 because its backend server (`crates/server`) is Rust linked directly in-process.
   - `anomalyco/opencode` (MIT) migrated from Tauri to Electron (`packages/desktop` + `electron-builder`) for its TypeScript/Node agent harness.
   - Control Rod's launcher (`scripts/cr.mjs`) and control plane (`services/api/dist/server.js` + `embedded-postgres`) are Node.js 22 ESM. Tauri has no built-in Node runtime, so a self-contained Tauri `.dmg` would still need a bundled Node sidecar per platform (~90 MB), plus Rust/WebKitGTK workspace isolation from Control Rod's strict `Cargo.toml` (`unsafe_code = "forbid"`, `deny.toml`). Electron embeds Node 22 (`ELECTRON_RUN_AS_NODE=1`) so `apps/desktop/` can directly reuse `scripts/cr.mjs` and `scripts/lib/instance.mjs` with zero duplication of service lifecycle, lockfiles, or macOS PostgreSQL shared-memory cleanup.
2. **Desktop shell (`apps/desktop/`):**
   - Electron main process (`src/main/index.ts`), preload (`src/preload/index.ts`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), and calm ISA-101 loading/error screen (`renderer/loading.html`).
   - Login-shell PATH resolver (`src/main/shell-env.ts`) so GUI-launched processes inherit the user's shell `PATH` and well-known CLI paths (`~/.local/bin`, Homebrew, mise shims) for agent CLIs.
   - Lifecycle manager (`src/main/lifecycle.ts`) reusing `scripts/lib/instance.mjs` (`findRunning`, `stopLauncher`, `healthy`, `readRecord`, `freeOrphanedSegments`) and spawning `scripts/cr.mjs start --foreground --no-open`. Reuses an already-running instance (and does not stop it on quit); cleanly stops owned services on quit so no orphan processes or leaked macOS System V Postgres shared-memory segments remain.
   - Single-instance lock (`app.requestSingleInstanceLock()`) so a second launch focuses the existing window.
   - Native notification bridge (`src/main/notifications.ts`) wired into `apps/web/src/lib/useAttentionSignals.ts` for "a card needs you" arrivals, focusing the window and navigating to `/inbox` on click.
   - Brand Dock icon assets (`apps/desktop/assets/`) derived from Control Rod's three-bar `BrandMark` SVG.
3. **Minimal launcher reuse updates (`scripts/cr.mjs`):**
   - Spawn `services/api/dist/server.js` with `process.execPath` instead of `"node"` so `ELECTRON_RUN_AS_NODE=1` works in packaged mode without changing CLI behavior.
   - Support `CONTROLROD_PACKAGED=1` and `CONTROLROD_DAEMON_BIN` so a packaged bundle skips rebuild steps and uses its bundled Go daemon binary.
4. **Packaging (`scripts/build-desktop.mjs`, `apps/desktop/electron-builder.config.mjs`) and README:**
   - Cross-platform `electron-builder` config targeting macOS unsigned `.dmg` first, with Windows (`nsis`), Linux (`AppImage`/`deb`), signing/notarization, and auto-update stubbed and documented as follow-ups.
   - Short "Download the app" section in `README.md` next to "Install the full workspace".
   - Unsigned `.dmg` PR workflow in `.github/workflows/desktop-dmg.yml` (trust surface; held for owner sign-off per `docs/collaboration.md#sole-maintainer-sign-off`).

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
| --- | --- | --- | --- | --- | --- |
| D1 | Ship a double-click desktop shell around the existing `controlrod` launcher without rewriting services, keeping the CLI path working. | "Goal: ship Control Rod as a double-click desktop app, without rewriting anything. Today the user runs the `controlrod` command, which starts local services and opens the UI in a browser at localhost. Keep that path working; add a desktop shell around it." | 2026-11-28, user task prompt | Wrap `scripts/cr.mjs` and `scripts/lib/instance.mjs` directly; keep `controlrod` CLI behavior unchanged. | Rewriting the API, daemon, or web UI into a native binary. |
| D2 | Use Electron instead of Tauri because Control Rod's launcher and API are Node.js 22 ESM with embedded PostgreSQL. | "A desktop shell (prefer Tauri for size; use Electron only if the repo's stack makes Tauri clearly harder, and say why)" | 2026-11-28, user task prompt | Electron embeds Node 22 (`ELECTRON_RUN_AS_NODE=1`), reuses `scripts/lib/instance.mjs` directly, and avoids bundling a separate Node sidecar or adding WebKitGTK/unsafe crates to the Rust workspace. | Tauri shell implementation. |
| D3 | Target macOS unsigned `.dmg` first, structured so Windows and Linux are config additions, leaving signing, notarization, and auto-update as documented follow-ups. | "Build (smallest thing that works, macOS first, structured so Windows and Linux are a later config change, not a redesign)" | 2026-11-28, user task prompt | Produce an unsigned macOS `.dmg` via `electron-builder` with Windows/Linux, signing, notarization, and auto-update stubbed in config and documented. | Apple Developer signing, notarization, Windows/Linux installers, and live auto-update servers. |
| D4 | Wire native notifications to the existing `useAttentionSignals` "needs you" arrival hook via `window.controlrodDesktop?.notify`. | none: authoring agent's choice, open to the owner | 2026-11-28, desktop-app implementation session | Reuses the existing privacy-preserving `notificationText(arrived)` wording and baseline logic; falls back to browser `Notification` outside Electron. | Notification preference UI redesign or custom sound packs. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`apps/desktop` builds, typechecks, and passes unit and integration tests for start, healthy, quit (no orphan processes / clean shutdown), second-launch reuse, login-shell PATH resolution for agent CLIs, and native notifications. `scripts/build-desktop.mjs` stages the runtime and drives `electron-builder` for unsigned macOS `.dmg`. Existing workspace tests and repo gates remain green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
