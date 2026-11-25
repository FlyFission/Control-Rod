# Basis: evidence payloads out of git

- **Standard**
- Execution owner: authoring agent under the 2026-11-24 ten-x amendment program.
- Decision owner: Ben Huffer.
- Date: 2026-11-25

## What this rests on

The ten-x plan's Phase 4 step 1: git keeps the SHA-256 digest and a manifest row per evidence file; payloads move to an owner-controlled store; existing records are grandfathered; history is not rewritten. Step 2 disqualifies GitHub Actions artifacts and any store that disappears with this GitHub org. Step 4 requires `pnpm cr verify` to report incomplete, verified, or tampered, and never to say verified when the bytes are missing or do not match.

`pnpm cr verify` today checks an inclusion proof or an audit export (`services/api/src/verify-bundle.ts`). It does not check a change record's evidence. The pinned `ng.py` validator checks record markdown, not payload files, so the payload convention is a local check.

`git ls-tree origin/main docs/adr/` on 2026-11-25 ends at two files numbered 0025. 0026 is unused. This change does not renumber that pair.

## What this does not decide

The owner has not picked the store, and has not recorded a yes for `docs/adr/`. The recommendation is in `proposed-adr.md`. This record does not type a retention period.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. The verify path reports the three outcomes.
2. The convention check grandfathers current records and fails a cited missing file with no manifest.
3. `docs/adr/` is untouched.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
