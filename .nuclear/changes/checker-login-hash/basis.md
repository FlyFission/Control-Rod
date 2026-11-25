# Basis: Let Codex checks run on a default Mac install

**Change slug:** `checker-login-hash`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** Built, for owner review.

## Mission / need

On 2026-11-24 the owner's first Codex checker run on his Mac failed at once: "protected login entry ~/.codex/plugins/.plugin-appserver/codex-cli/CodexCLI.app/Contents/MacOS/codex is over the 20971520 byte limit, so the check cannot count". The card then said "Outcome unknown: the daemon stopped answering" and asked him to sign why the run would never report. Nothing had run. Every user with the Codex app has the same layout, so no Codex check could ever start for them.

## Causes

1. `hashProtected` reads the full contents of everything under the protected login names, `plugins` included, inside a 20 MB per-file and 100 MB total budget, and fails past either. The Codex app keeps its own CLI binary (and app bundle) under `plugins/`.
2. When a run's command was built but never started, the completion carried no containment, so the control plane (`holdIfUnproven`, `services/api/src/work.ts`) read it as "no proof every process stopped" and held it as outcome unknown.

## Decisions

1. Keep `plugins` protected (plugins can carry skills and hooks). A file over the per-file limit, or past the byte budget, is named by its identity (device, inode, size, modification and change times) instead of its contents. A process without root cannot set the change time back, so a write, truncate, replace or retime still changes the hash. Platforms without that record keep the old refusal.
2. The protected walk keeps the existing entry cap (`checkerMaxEntries()`, 25,600). The owner's measured `~/.codex/plugins` holds 7,021 entries (`find | wc -l` on his Mac, verification E-03).
3. A run whose command never started (`cmd.Process == nil`) reports containment `none`, the existing wire value for "no process was started". The API already records such a run as failed and the web shows its error and the Requeue button.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Codex check on a default macOS install (the Codex app keeps its own CLI binary under `~/.codex/plugins/`) hashes the login directory and runs; a run refused before its process starts is recorded as failed with its reason and can be requeued, never held as outcome unknown; daemon tests pass apart from the sandbox tests this container cannot run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
