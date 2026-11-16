# openharness: what to take, what to leave

> **Provenance.** Studied on 2026-10-22 at openharness commit `a1c3442` (github.com/autonomous-ai/openharness). The repository's own code is MIT, Copyright (c) 2026 Autonomous, Inc., so code may be ported if that notice is kept with it. Not everything in the repository is MIT: `os/` has GPL files, `store/viewers/film-viewer` and the `store/agents/openmontage` wrapper are AGPL-3.0, the `store/agents/circuitjs` examples are GPL-2.0, and `trailofbits-skills` content is CC-BY-SA. The store's license field says "MIT" for FreeCAD (LGPL-2.1+), OpenSCAD (GPL-2), KiCad (GPL-3), Typst (Apache-2.0) and marimo (Apache-2.0); those tools stay operator-installed programs that we call, never code we copy. Port only from the files named below, and pin the commit.

## Verdict

A good parts bin and a poor foundation. It drives each vendor's interactive app inside tmux, reads transcripts, spots questions by screen scraping and answers by typing keys. Control Rod's headless runs with leases, an outbox, idempotent completion and process-group stop are already stronger, and its "verdict" is a self-check by the authoring agent where ours is an independent pre-check.

## Build plan (one small PR after #3, then follow-ups)

| # | Item | Port from (openharness) | Lands in (Control Rod) | Effort | Notes |
|---|---|---|---|---|---|
| H1 | Pinned, checksummed tool fetch | `store/tools/runtimes.sh` (`_harness_fetch`); per-platform SHA-256 table in `store/agents/typst/toolchain/setup.sh` | new `tools/fetch_pinned.sh`; a `VERSIONS` file in the pack that pins a tool | S | First PR |
| H2 | Full-commit git pins with a lock file | `store/tools/studio_fetch.py` | `upstream.lock.json` for any tool built from source; a `scripts/cr.mjs` setup step | S | First PR |
| H3 | Build discipline for generated sheets: lock, stage, re-hash inputs, atomic publish, history | `store/agents/freecad/skills/freecad/scripts/build.mjs` | the renderer of a future drawing pack | S to M | First PR |
| H4 | Claude Code hooks as hints for a true "waiting on you" state (PreToolUse, PermissionRequest) under `claude -p`, via a per-run `--settings` file, failing closed; Codex `exec` has no equivalent | `cli/src/engines/claude/hookContract.ts` | `daemon/internal/runner/runtime.go`, new `hooks.go` | M | Test on the Mac first |
| H5 | Typst for reports, built with the same discipline as H3; minimum-content contract for calcs | `store/agents/typst/` (pinning only); `store/agents/data-studio/skills/data/references/analysis-contract.md` (adapt) | a new reports pack and a new calcs pack; ADR 0021 | M | Sets the report and calc bar |
| H6 | PDF review packets: markup anchored to a place in a PDF, bundled into Return | `store/viewers/doc-viewer/lib/reviews.mjs` | `spec/records.tsp`, a web review component | L | Fills Kandev pattern P12 |
| H7 | Pack manifest check | `cli/src/dsh/check.ts` | pack loader; Kandev pattern P44 | M | Later |
| H8 | Small daemon hardening | `cli/hook/notify.mjs` lines 400-417 (token file checks); `daemonSpawnLock.ts`; `serviceCommand.ts` (launchd) | `daemon/` | S | With Kandev P57 and P60 |
| H9 | Daemon enrolment by owner passkey on a signed, hash-chained key log | `cli/src/lib/e2ee/deviceLog.ts` (idea) | `daemon/internal/identity/`, new `services/api/src/runners.ts`, `spec/work.tsp` | M to L | Only when a second machine is needed |

## Leave alone

- Screen scraping and keystroke approvals; Ctrl-C stops with unknown outcome.
- The relay, WebRTC remote linking and password pairing: no minimum password length, the target approves nothing, the vendor backend can enrol a device, agents can drive the daemon over its local socket. Use Tailscale plus the passkey for phone access.
- Self-update: the daemon polls an unsigned manifest every 60 seconds and checks downloads against hashes from that same manifest (`cli/src/lib/selfUpdate.ts`); firmware can update over plain HTTP.
- Writing into the user's global Claude settings file.
- Most domain harnesses as they are: GIS is a thin stub; Foam-Agent's OpenFOAM result reports hard-coded numbers; KiCad runs Codex with `approval_policy=never` and `danger-full-access`; several harnesses install unpinned Python packages.

## Worth knowing

- Strong and real: FreeCAD (requirements kept apart from geometry, native measured checks), Data Studio, Doc Viewer, Typst.
- Health on 2026-10-22: about 3,800 commits in 80 days, about 1.6 million lines, about 25,000 tests, 41 CI workflows with no security scanning; one maintainer has 41% of commits; nearly every commit is co-written by Claude, and its agent rules let agents merge and release. Port pieces at a pinned commit; do not depend on it.

Full study notes (not committed): `scratchpad/ohar/A-harnesses.md` and `B-platform.md` from the 2026-10-22 session.
