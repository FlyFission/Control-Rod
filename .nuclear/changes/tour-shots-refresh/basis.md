# Basis: Refresh the README and website tour screenshots

**Change slug:** `tour-shots-refresh`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

The PR #194 blind check found the website tour still showed the old Software column names. The coordinator asked for a refresh once the drawer (#195), rail (#192) and SCRAM (#190) changes were on main; all three merged by 2026-11-25 03:45 UTC.

## Proposal

1. Retake all six tour pictures with the existing `apps/web/e2e/readme-shots.spec.ts` (release build, recorded sample fixtures) and store them in `docs/assets/readme/app/`.
2. Update the board's alt text in README.md, site/index.html and site/app.js to the plain column names.
3. The spec's sample pre-check run used role `checker`, which is not a run role, so the card read "undefined running". Use `pre-check`, and give the status line a fallback word ("Agent running") for any role it does not know.

## Out of scope

`.github/`, `spec/`, `services/`, `daemon/`, `kernel/`, `policies/`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README and website tour pictures come from the current main (plain column names, calm drawer, resizable rail, one SCRAM button), the board alt text names the columns the picture shows, and no card reads "undefined running". The shots spec, site tests and web lib tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
