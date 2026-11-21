# Basis: agent runs on macOS and native Linux

**Change slug:** `mac-linux-agents`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-19
**Decision this basis supports:** whether the daemon may offer Claude Code and Codex author launches on macOS and native Linux, as it already does on WSL2, and whether the new `.github/workflows/platforms.yml` may stay on `main`.

## Mission / need

Agent runs started only on WSL2. ADR 0021 says macOS and native Linux are claimed only after the launch qualification passes there. Ben asked on 2026-11-19 for Control Rod agents to run on Mac and Linux, which is the launch blocker named in the adoption plan. This change runs the existing launch qualification (`spikes/runtime-confinement/launch_qualification.py`) on both platforms in CI and opens the platform check where it passes.

## Protected outcomes

| Protected outcome | Evidence needed |
|---|---|
| A launch on native Linux holds every boundary the WSL2 launch holds. | E-01: the qualification on `ubuntu-24.04` in CI. |
| A launch on macOS holds every boundary the WSL2 launch holds. | E-02: the qualification on `macos-15` in CI. |
| A Linux host where bubblewrap cannot create a sandbox refuses the run and names the fix. | E-03: unit test and the CI step that hit the refusal. |
| The daemon's darwin code, including the Seatbelt checker profile, is tested on a Mac. | E-04: `daemon-macos` in CI. |
| WSL2 behaves as before. | E-05: the full Go suite on Linux and `ci` on this change. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| A GitHub-hosted runner stands in for a user's Mac and Ubuntu machine for the sandbox boundary. | Same CLI builds, same daemon arguments, same decoy home; the boundary is each CLI's own sandbox (Seatbelt, bubblewrap). | A user report of a boundary that held in CI and leaked on their machine; a different macOS major version. |
| The scripted provider exercises the same sandbox as a real login. | On WSL2 the live-login check matched the scripted qualification (`workbench-ontology/evidence/phase6`). | A CLI build that sandboxes logged-in sessions differently. |
| The AppArmor profile for `/usr/bin/bwrap` widens only bubblewrap. | The profile names one binary and grants `userns`; the restriction stays on for every other program. | Ubuntu changing how unprivileged user namespaces are restricted. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

ML-01 to ML-07 are implemented with CI and local evidence reported as it ran; the signature for the new `platforms` workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
