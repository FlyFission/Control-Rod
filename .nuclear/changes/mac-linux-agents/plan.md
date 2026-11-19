# Plan: agent runs on macOS and native Linux

1. Make the launch qualification run on macOS and native Linux: errno names instead of Linux numbers, `--deps` only on Linux, and the host and CLI versions in the report.
2. Add `.github/workflows/platforms.yml`: `daemon-macos` (gofmt, vet and the Go tests on `macos-15`) and `qualify` (the launch qualification on `ubuntu-24.04` and `macos-15` with the pinned Claude Code 2.1.318 and Codex 0.166.0, installed with `npm -g`). Add Seatbelt checker tests that only run on darwin.
3. On Ubuntu 24.04, apply the AppArmor profile that lets `/usr/bin/bwrap` create user namespaces, and add the same check to the daemon's preflight so a user gets the fix instead of a failed run.
4. Once both qualifications pass, open `QualifiedPlatform` for linux and darwin, record Claude Code and Codex author launches as qualified there, and update `pnpm cr doctor`, the README, `docs/daemon.md`, `docs/getting-started.md` and `docs/status.md`.
5. Open a draft PR with the trust-surface box ticked and leave the signature to a maintainer.

## Rollback

Revert the PR. To stop offering one platform only, return `QualifiedPlatform` to refuse it; the preflight then refuses every launch there with the reason.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

ML-01 to ML-07 are implemented with CI and local evidence reported as it ran; the signature for the new `platforms` workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
