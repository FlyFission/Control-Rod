# Basis: the controlrod command

**Change slug:** `controlrod-command`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Decision this basis supports:** whether Control Rod gets one command, run from any folder, to start, stop, update and check it, and whether the launcher may free dead PostgreSQL shared memory on macOS.

## Mission / need

On 2026-11-24 the owner asked for an "inline" command such as `controlrod update` after a first install. Until now, starting meant `pnpm cr start` from inside the checkout, and updating meant five steps by hand (stop, `git checkout main`, `git pull --ff-only`, `pnpm install --frozen-lockfile`, `pnpm cr start`). He asked for a full set (`controlrod doctor`, `controlrod update`, ...) and for reuse of established tools rather than new inventions.

The same day his start failed with "Control Rod could not start its database ... Detail: undefined". On his Mac, the real error was `FATAL: could not create shared memory segment: No space left on device`: macOS allows 32 System V segments (`kern.sysv.shmmni: 32`), and 29 were 56-byte PostgreSQL interlock segments left by killed runs, with nothing attached and their creating processes gone. The bundled `embedded-postgres` rejects with no reason when the server exits during start, and the control plane dropped the server's log.

## What this change does

- `pnpm cr link` installs `controlrod` into `~/.local/bin` (a short shell script that runs this checkout's `scripts/cr.mjs`), adding that folder to PATH in the shell's startup file once when it is missing. It never replaces a `controlrod` it did not write. Builds rewrite it when it points here.
- Commands, parsed by Commander (MIT): `start [--background]`, `stop [--now]`, `restart`, `status`, `open`, `logs [-f]`, `update [--check] [--no-restart]`, `version`, `doctor [--fix]`, `setup`, `verify`, `receipt`, `link`, `unlink`, `bench`; the daemon's own commands (`agents`, `check`, `runtimes`, ...) pass through, so the app's existing `controlrod agents update` advice now works as written.
- The launcher writes `~/.controlrod/launcher.json` while it runs, so another terminal can find and stop it with the same signal as Ctrl+C. A launcher started before this change is found through the control plane listening on the port.
- `update`: checks first (git clone, on `main`, fetch, fast-forward possible), stops a running copy gracefully, sets uncommitted edits aside in `git stash`, fast-forwards, installs, and builds with the new checkout's own `setup`. Any failure returns to the old commit and rebuilds it. A checkout left unbuilt is finished by the next `update`.
- The control plane now prints PostgreSQL's own error lines with advice for the common causes (shared memory, a held lock file, a busy port, a version mismatch, permissions) instead of "undefined".
- On macOS, `start` warns when System V shared memory is nearly used up, `doctor` lists segments that look left behind by PostgreSQL (this user's, 56 bytes, not attached, creator gone), and `doctor --fix` frees them on request.

## Reuse (patterns, no code copied)

| Source | License | Taken |
| --- | --- | --- |
| Commander | MIT | the command parser and help (dependency) |
| proper-lockfile | MIT | the update lock and the one-launcher claim, with stale-lock takeover (dependency) |
| Homebrew `brew update` | BSD-2-Clause | stash uncommitted edits under a fixed git identity, say how to `git stash pop` instead of popping; ignore Ctrl+C while the checkout changes |
| Oh My Zsh `tools/upgrade.sh` | MIT | fetch plus `git merge --ff-only`; keep the previous version in git config (`controlrod.lastVersion`); print the old..new change list |
| uv installer, Claude Code native installer | MIT/Apache-2.0 (uv) | `~/.local/bin` plus one PATH line in the shell's startup file |
| Docker Compose, Supabase CLI | (names only) | command names: `start`/`stop`/`status`, `logs -f`, background start |
| Homebrew `brew doctor` | BSD-2-Clause | `doctor` as the place that says what to fix |

## Follow-up: `controlrod start` as the one step (2026-11-24, after #177)

The owner, after #177: "why multiple commands, can't we simplify? controlrod start seems like it should do all of that, 2 steps is brutal". So `controlrod start` now checks the machine (stopping with what to fix), builds when needed, frees on macOS the shared memory segments that are certainly dead when the limit is near, starts in the background, and opens the app in the browser when someone is at the terminal. `--foreground` keeps it in the terminal and `--no-open` skips the browser. `pnpm cr start`, the developer's form inside the checkout, stays a terminal start. `doctor` and `doctor --fix` remain for the full list. This reverses the review-round-2 choice to never free segments automatically, at the owner's request; the filter is unchanged and freeing happens only when PostgreSQL could not start anyway.

## Not in scope

Desktop icons, an in-app update button, release tags or a cooldown before taking new commits.

## Exit criteria

CC-01 to CC-05 are implemented and tested, the decisive checks have failed-first (mutation) evidence, and the end-to-end run in verification passes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
