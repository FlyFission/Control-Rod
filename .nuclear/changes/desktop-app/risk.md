# Risk: Desktop app shell for Control Rod

- R-01: GUI launch on macOS has a minimal `launchd` `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), causing `claude`, `codex`, `agy`, `grok`, or `opencode` to be reported missing. Mitigated by `shell-env.ts` querying the user's login shell with a bounded timeout and merging common CLI directories (`~/.local/bin`, Homebrew, mise shims), verified by unit/integration tests from a minimal PATH.
- R-02: Abrupt app quit could leave orphan API/daemon processes or leak macOS System V PostgreSQL shared-memory interlock segments (limit 32). Mitigated by `before-quit` intercepting exit and calling `stopLauncher()` from `scripts/lib/instance.mjs` (which drains the daemon first, then sends `SIGTERM` to the API so `pgServer.stop()` runs cleanly), with `freeOrphanedSegments()` safety net on macOS.
- R-03: Launching the app while Control Rod is already running from a terminal or another window could collide on port 7300 or shut down the user's terminal session on quit. Mitigated by `app.requestSingleInstanceLock()` plus `findRunning()` reuse: externally started instances are reused and never stopped when the desktop window quits.
- R-04: Security boundary of the Electron window. Mitigated by `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, minimal `contextBridge` API (`notify`, `retry`, `openExternal`), and strict external-URL opening (`http:`/`https:` only via `shell.openExternal`).
- R-05: Unsigned macOS `.dmg` builds trigger Gatekeeper on first launch, and WebAuthn platform passkeys inside unsigned Electron apps on macOS have Apple entitlement constraints (`electron/electron#24573`). Documented plainly in README and follow-ups, with an "Open in Browser" menu action so users can always complete passkey sign-off in Safari/Chrome against the same local instance.
- R-06: License compliance. `electron` and `electron-builder` are MIT `devDependencies`; no copyleft or source-available code is copied. Verified by `node tools/license-gate.mjs`.
- Trust surface: Adding `.github/workflows/desktop-dmg.yml` touches `.github/` (CODEOWNERS trust surface) and requires sole-maintainer sign-off under `docs/collaboration.md#sole-maintainer-sign-off` before editing.

## Selected mode

- **Mode:** Standard
- Basis: additive desktop shell around the existing launcher; zero kernel, policy, or spec changes; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`apps/desktop` builds, typechecks, and passes unit and integration tests for start, healthy, quit (no orphan processes / clean shutdown), second-launch reuse, login-shell PATH resolution for agent CLIs, and native notifications. `scripts/build-desktop.mjs` stages the runtime and drives `electron-builder` for unsigned macOS `.dmg`. Existing workspace tests and repo gates remain green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
