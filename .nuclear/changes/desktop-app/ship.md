# Ship: Desktop app shell for Control Rod

Release decision: **ready for owner review and CI; `.github/workflows/desktop-dmg.yml` held for sole-maintainer sign-off.**

- **Proposed:** squash-merge the `feat/desktop-app` pull request once CI is green and owner review is complete. Add `.github/workflows/desktop-dmg.yml` once the sole maintainer gives their recorded yes under [sole-maintainer sign-off](../../../docs/collaboration.md#sole-maintainer-sign-off).
- **Not claimed:** Apple Developer code signing, notarization, Windows/Linux installers, or live auto-update (all documented as follow-ups in `docs/desktop.md` with stubs in `apps/desktop/electron-builder.config.mjs`). Actual macOS `.dmg` creation via `electron-builder` requires a macOS host and was not executed on this Linux devbox; runtime staging and cold boot were verified live on Linux (`E-05`).

## Rollback and monitoring

Rollback: revert the merge. The CLI (`controlrod` / `pnpm cr`) and web UI continue working independently with no data migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`apps/desktop` builds, typechecks, and passes unit and integration tests for start, healthy, quit (no orphan processes / clean shutdown), second-launch reuse, login-shell PATH resolution for agent CLIs, and native notifications. `scripts/build-desktop.mjs` stages the runtime and drives `electron-builder` for unsigned macOS `.dmg`. Existing workspace tests and repo gates remain green.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
